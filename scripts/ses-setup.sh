#!/usr/bin/env bash
# Amazon SES for the orgs' own domains in hosted mode (docs/ses.md). Idempotent: safe to run again.
#   scripts/ses-setup.sh setup       S3 bucket, SNS topics, configuration set, receipt rule set, IAM user, Worker secrets
#   scripts/ses-setup.sh subscribe   SNS → https://workinbox.io/api/ses/webhook (after a deploy with the new code)
#   scripts/ses-setup.sh access      asks AWS for production access in the region (out of the sandbox)
# Needs `aws login` (an admin of the AWS account) and `wrangler login`. The events secret is kept in .ses.prod.vars.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION=eu-west-1
APP_URL=https://workinbox.io
NAME=workinbox
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="$NAME-inbound-mail-$ACCOUNT"
aws_r() { aws --region "$REGION" "$@"; }
# Runs a create call and treats "already exists" as done.
ensure() { out=$("$@" 2>&1) || { grep -qiE "AlreadyExists|BucketAlreadyOwnedByYou|EntityAlreadyExists" <<<"$out" || { echo "$out" >&2; exit 1; }; }; }

[ -f .ses.prod.vars ] || printf 'SES_EVENTS_SECRET=%s\n' "$(openssl rand -hex 32)" > .ses.prod.vars
SECRET=$(sed -n 's/^SES_EVENTS_SECRET=//p' .ses.prod.vars)
HOOK="$APP_URL/api/ses/webhook?secret=$SECRET"

topic() { aws_r sns create-topic --name "$1" --query TopicArn --output text; }

setup() {
  echo "account $ACCOUNT, region $REGION"
  # 1. Received mail lands in S3 (mail/, kept 14 days at most; the app deletes it once stored).
  ensure aws_r s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint="$REGION"
  aws_r s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws_r s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{"Rules":[{"ID":"expire-mail","Status":"Enabled","Filter":{"Prefix":"mail/"},"Expiration":{"Days":14}}]}'
  aws_r s3api put-bucket-policy --bucket "$BUCKET" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ses.amazonaws.com\"},\"Action\":\"s3:PutObject\",\"Resource\":\"arn:aws:s3:::$BUCKET/mail/*\",\"Condition\":{\"StringEquals\":{\"AWS:SourceAccount\":\"$ACCOUNT\"},\"StringLike\":{\"AWS:SourceArn\":\"arn:aws:ses:$REGION:$ACCOUNT:receipt-rule-set/$NAME:receipt-rule/*\"}}}]}"
  echo "bucket $BUCKET"

  # 2. Two SNS topics SES may publish to: received mail and delivery events.
  INBOUND=$(topic "$NAME-inbound"); EVENTS=$(topic "$NAME-events")
  for t in "$INBOUND" "$EVENTS"; do
    aws_r sns set-topic-attributes --topic-arn "$t" --attribute-name Policy --attribute-value "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ses.amazonaws.com\"},\"Action\":\"sns:Publish\",\"Resource\":\"$t\",\"Condition\":{\"StringEquals\":{\"AWS:SourceAccount\":\"$ACCOUNT\"}}}]}"
  done
  echo "topics $INBOUND $EVENTS"

  # 3. Configuration set: every send names it (lib/server/ses.ts); its events go to the events topic.
  ensure aws_r sesv2 create-configuration-set --configuration-set-name "$NAME"
  ensure aws_r sesv2 create-configuration-set-event-destination --configuration-set-name "$NAME" --event-destination-name sns \
    --event-destination "{\"Enabled\":true,\"MatchingEventTypes\":[\"DELIVERY\",\"BOUNCE\",\"COMPLAINT\",\"REJECT\",\"DELIVERY_DELAY\",\"RENDERING_FAILURE\"],\"SnsDestination\":{\"TopicArn\":\"$EVENTS\"}}"

  # 4. Receiving: one rule for every verified domain, spam/virus scan on, store in S3 and notify the inbound topic.
  ensure aws_r ses create-receipt-rule-set --rule-set-name "$NAME"
  ensure aws_r ses create-receipt-rule --rule-set-name "$NAME" \
    --rule "{\"Name\":\"inbound\",\"Enabled\":true,\"ScanEnabled\":true,\"TlsPolicy\":\"Optional\",\"Actions\":[{\"S3Action\":{\"BucketName\":\"$BUCKET\",\"ObjectKeyPrefix\":\"mail/\",\"TopicArn\":\"$INBOUND\"}}]}"
  ACTIVE=$(aws_r ses describe-active-receipt-rule-set --query Metadata.Name --output text 2>/dev/null || true)
  if [ "$ACTIVE" != "$NAME" ] && [ -n "$ACTIVE" ] && [ "$ACTIVE" != "None" ]; then
    echo "Another receipt rule set ($ACTIVE) is active in $REGION; only one can be. Stopping." >&2; exit 1
  fi
  aws_r ses set-active-receipt-rule-set --rule-set-name "$NAME"
  echo "receipt rule set $NAME active"

  # 5. The Worker's own IAM user, with only what lib/server/ses.ts calls.
  ensure aws iam create-user --user-name "$NAME-ses"
  aws iam put-user-policy --user-name "$NAME-ses" --policy-name ses --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"ses:SendEmail\",\"ses:CreateEmailIdentity\",\"ses:GetEmailIdentity\",\"ses:DeleteEmailIdentity\",\"ses:PutEmailIdentityMailFromAttributes\",\"ses:CreateTenant\",\"ses:CreateTenantResourceAssociation\",\"ses:DeleteTenantResourceAssociation\",\"ses:ListResourceTenants\"],\"Resource\":\"*\"},
    {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:DeleteObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/mail/*\"}]}"

  # 6. Worker secrets. A new access key only when the user has none (AWS shows the secret once).
  if [ "$(aws iam list-access-keys --user-name "$NAME-ses" --query 'length(AccessKeyMetadata)' --output text)" = "0" ]; then
    read -r KEY_ID KEY_SECRET < <(aws iam create-access-key --user-name "$NAME-ses" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
    printf '%s' "$KEY_ID" | npx wrangler secret put AWS_SES_ACCESS_KEY_ID >/dev/null
    printf '%s' "$KEY_SECRET" | npx wrangler secret put AWS_SES_SECRET_ACCESS_KEY >/dev/null
    echo "access key $KEY_ID stored as Worker secrets"
  else
    echo "access key exists; Worker secrets left as they are"
  fi
  printf '%s' "$ACCOUNT" | npx wrangler secret put AWS_ACCOUNT_ID >/dev/null
  printf '%s' "$SECRET" | npx wrangler secret put SES_EVENTS_SECRET >/dev/null
  echo "Worker secrets set. Deploy, then run: scripts/ses-setup.sh subscribe"
}

subscribe() {
  for t in "$(topic "$NAME-inbound")" "$(topic "$NAME-events")"; do
    # The webhook confirms the subscription itself (SubscribeURL).
    aws_r sns subscribe --topic-arn "$t" --protocol https --notification-endpoint "$HOOK" --query SubscriptionArn --output text
  done
  sleep 5
  aws_r sns list-subscriptions --query "Subscriptions[?starts_with(TopicArn, 'arn:aws:sns:$REGION:$ACCOUNT:$NAME-')].[TopicArn,SubscriptionArn]" --output text
}

access() {
  aws_r sesv2 put-account-details --production-access-enabled --mail-type TRANSACTIONAL --website-url "$APP_URL" --contact-language EN \
    --use-case-description "Work Inbox (workinbox.io) is team email hosting: companies add their own domain, verify it with Easy DKIM and a custom MAIL FROM, and their people send and receive person-to-person business mail from their own mailboxes. No bulk or marketing mail: every message is written by a person (or a forwarding rule they set up). Each customer has its own SES tenant; bounces and complaints come back through a configuration set to our app, which suppresses those recipients and shows delivery status to the sender."
  aws_r sesv2 get-account --query '{production:ProductionAccessEnabled,review:Details.ReviewDetails.Status}'
}

"${1:-setup}"
