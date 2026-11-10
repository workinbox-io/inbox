# Amazon SES for the orgs' own domains (hosted mode)

Cloudflare Email Routing only delivers to our Worker, and Email Service only sends, for zones in **our** Cloudflare
account. A customer's domain lives in their DNS (often their own Cloudflare account), so in hosted mode
(`DEPLOY_MODE=cloud`) a custom domain added in Settings → Mail goes through Amazon SES instead (built 2026-11-10,
copied from Luxivo's sending domains). Self-hosted installs, our own subdomains and domains added before stay on
Cloudflare (`mail_domains.provider`).

## How it works

- Adding a domain creates an SES identity (Easy DKIM, MAIL FROM `bounce.<domain>`) in the org's tenant `org-<orgId>`
  and stores the DKIM tokens. The settings list MX `inbound-smtp.eu-west-1.amazonaws.com` (10), three DKIM CNAMEs,
  MX + SPF on `bounce.<domain>` and DMARC (`lib/mail/rules.ts`). "Check DNS" reads DNS over HTTPS and the identity's
  DKIM and MAIL FROM status; the domain is active with the MX and DKIM verified. Removing it deletes the identity.
- Sending: `deliverOutboxJob` → `sendOrgMail` (`lib/server/mail/deliver.ts`) → SES for an `ses` domain, with the
  configuration set `workinbox` and the org's tenant. Its events go to SNS `workinbox-events`.
- Receiving: receipt rule set `workinbox`, rule `inbound` (every verified domain, spam and virus scan) stores the mail
  in S3 `workinbox-inbound-mail-<account>/mail/` and notifies SNS `workinbox-inbound` with the envelope recipients.
- Both topics post to `/api/ses/webhook?secret=SES_EVENTS_SECRET` (it confirms the subscriptions itself). Received
  mail is queued as `mail.inbound` (`lib/server/mail/ses-inbound.ts`: each recipient through `handleOrgMail`, then the
  object is deleted); delivery events become Cloudflare-shaped events for `handleDeliveryEvent`
  (`lib/mail/ses-events.ts`).
- Virus verdict FAIL drops the mail; spam verdict FAIL sets `x-spam-flag` for our own spam score. Mail to an address
  nobody has is dropped (SES already accepted it, so nothing can be rejected).

## Setting it up

`scripts/ses-setup.sh` does everything with the AWS CLI (`aws login` as an admin) and wrangler, and can be run again:

1. `scripts/ses-setup.sh setup`: bucket, topics, configuration set, receipt rule set (made active; stops if another
   set is active in eu-west-1), IAM user `workinbox-ses` with only the calls the app makes, and the Worker secrets
   `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `SES_EVENTS_SECRET` (kept in
   `.ses.prod.vars`, gitignored). `AWS_SES_REGION` is a var in `wrangler.jsonc`.
2. Deploy, then `scripts/ses-setup.sh subscribe` (needs the webhook live).
3. `scripts/ses-setup.sh access`: asks AWS for production access in eu-west-1 (1 to 3 days). Until then SES only sends
   to verified addresses; receiving works.

Test on a domain of ours: add it in Settings → Mail, add the records, Check DNS until active, send a mail (headers:
DKIM `d=` the domain, Return-Path on `bounce.<domain>`), reply to it, and see the delivery status in the thread.

## Not done yet

- No cron re-checks pending domains: the admin clicks Check DNS.
- Deleting an org leaves its SES identities and tenant (unused, no cost).
- "Connect Cloudflare" (create the records through the customer's API token) is the next step.
