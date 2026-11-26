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

## Connect Cloudflare

For an `ses` domain on Cloudflare, Settings → Mail → **Connect Cloudflare** takes an API token (Zone Read, DNS Edit;
the link opens Cloudflare's token page with them preselected), finds the zone, adds the missing records
(`planDnsChanges` in `lib/mail/rules.ts`) and checks the domain (`connectCloudflare` in `lib/server/mail/admin.ts`).
The token is used for that request only. MX records of the current provider are replaced only when the admin ticks
the box; Email Routing's own MX are locked, so the admin is told to turn Email Routing off first.

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

## Free addresses (`<name>.workinbox.io`)

Settings → Mail → "No domain yet? Start on workinbox.io" (`claimSubdomain` in `lib/server/mail/admin.ts`): one per org,
an SES identity like any hosted domain (`kind: "subdomain"`), its MX, DKIM, MAIL FROM and DMARC records written into
the workinbox.io zone with our own token, the admin's personal mailbox on it, then job `mail.domainCheck` re-checks
every 2 minutes for half an hour until it's active. Names: `isValidSubdomainLabel` (`lib/mail/rules.ts`, reserved
names included). New orgs' sending is capped anyway (`sendingCaps`, `lib/mail/outbox-policy.ts`).

To turn it on: a Cloudflare API token with Zone → DNS → Edit and Zone → Zone → Read on workinbox.io only, then
`wrangler secret put MAIL_ZONE_TOKEN`. `MAIL_BASE_DOMAIN` is a var in `wrangler.jsonc`. Each org adds ~7 records to
the zone: watch the zone's record limit.

## Mail apps' autodiscovery (autoconfig, autodiscover)

Thunderbird, Outlook and most phone apps find `mail.workinbox.io` from the address alone (logins are the mailbox
address plus a tagged device password, see `services/mail-bridge/src/imap-login.mjs`). The Worker answers
`/mail/config-v1.1.xml`, `/.well-known/autoconfig/mail/config-v1.1.xml` and `/autodiscover/autodiscover.xml` on any host
for active domains only (`lib/server/mail/autoconfig.ts`, hooked first in the middleware); the zone routes in
`wrangler.jsonc` bring those paths in from every host of workinbox.io.

- Orgs' own domains: optional records `CNAME autoconfig.<domain> → setup.workinbox.io` and
  `SRV _autodiscover._tcp.<domain> → 0 443 setup.workinbox.io` (`clientDnsRecords`, `lib/mail/rules.ts`; "Connect
  Cloudflare" adds them and never fails on them). `autoconfig.<domain>` is a Cloudflare for SaaS custom hostname, made
  when the domain is added and removed with it (`lib/server/mail/custom-hostnames.ts`). Outlook follows the SRV to our
  own host, so one hostname per domain (100 free, then about $0.10 a month each).
- Free addresses: a proxied `AAAA <name>.workinbox.io → 100::`, so the domain itself serves `/.well-known/autoconfig`
  under the zone's wildcard certificate.

One-time setup on the workinbox.io zone: enable Cloudflare for SaaS (SSL/TLS → Custom Hostnames), add a proxied
`AAAA setup.workinbox.io → 100::` and make it the fallback origin, and give `MAIL_ZONE_TOKEN` Zone → SSL and
Certificates → Edit as well. `MAIL_CLIENT_HOST` and `MAIL_SETUP_ORIGIN` are vars in `wrangler.jsonc`; empty turns the
records and answers off (self-hosted: route those three paths of your own zone to the Worker by hand).

## No lost mail

SES has already accepted a mail (250) before we see it, so nothing may drop it silently (`lib/server/mail/ses-inbound.ts`):

- Unknown address, full mailbox or over 25 MB: a bounce from `mailer-daemon@<domain>` to the sender, only when SPF or
  DKIM passed and the mail isn't automated or spam (`bounceable`), so forged senders don't get backscatter.
- Lost SNS notification, webhook down or a `mail.inbound` job that used up its retries: the mail stays in S3, and
  `sweepInboundMail` (cron `41 * * * *`) queues every object older than 3 h again, envelope read from its headers
  (`recoveredEnvelope`). Still there after a day: an alert (app errors), the bucket expires mail after 14 days.
- Dead jobs in `inbox-jobs-dlq` are logged with their payload and acked.
- Logs: `[mail-in]` (each recipient: stored, duplicate, rejected, failed), `[ses-inbound]`, `[ses-webhook]`.

The sweep needs `s3:ListBucket` on `mail/`: re-run `scripts/ses-setup.sh setup` (it rewrites the IAM policy) once.

## Not done yet

- No cron re-checks pending custom domains: the admin clicks Check DNS (free addresses re-check on their own).
- Removing a free address leaves its DNS records in our zone.
- Deleting an org leaves its SES identities and tenant (unused, no cost).
