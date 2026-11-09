# Mail operations (phase 1)

## Deployment

1. Run pnpm test, pnpm typecheck and pnpm build.
2. Create queues inbox-jobs-dlq, inbox-mail-events and inbox-mail-events-dlq.
3. Generate one VAPID key pair (web-push generateVAPIDKeys). Store VAPID_PRIVATE_KEY
   and VAPID_PUBLIC_KEY with wrangler secret put; set VAPID_SUBJECT to a mailto: contact.
   Preserve this pair across deployments, otherwise existing device subscriptions break.
4. Apply D1 migrations using pnpm db:migrate:remote, then deploy the Worker.
   Migrations 0005–0009 preserve existing messages. FTS indexing runs during migration;
   body migration runs in bounded batches on the minute cron. Do not edit migrations
   after production application.
5. In Cloudflare Email Service Event Subscriptions, subscribe each sending domain's
   message.delivered, message.deferred, message.bounced, message.failed,
   message.rejected and message.complained to inbox-mail-events.
6. Verify both the minute cron and daily cron, all queue consumers and error queues.
   No Cloudflare API token is stored in the application for provisioning infrastructure.

## Expected behavior

- Default quotas: 10 GiB per mailbox, 500 unique To/CC recipients per mailbox per UTC
  day, 5000 per organization. Mail settings lets admins change them.
- A queued send survives closed tabs. The default undo window is 10 seconds.
  Scheduled times are stored as UTC milliseconds; the UI uses local device time.
- Cancellation wins only before a consumer atomically claims the job. A provider call
  with an uncertain result is not retried automatically. Review its reference in
  the Outbox against Cloudflare Email Service activity before initiating another send.
- Message acceptance by Email Service is distinct from delivery. Recipient events
  update the thread's delivery status. Complaints and permanent bounces suppress
  future sends to that recipient within the organization.
- API keys have no mail access initially, including admin keys. Settings → API keys →
  Mail access selects allowed mailboxes. OAuth uses the current user's access.
- Enable notifications explicitly on each device. VAPID must be configured first.
  Notifications contain no subject, sender or body; display rechecks the current
  session and mailbox access. The service worker does not cache mail or API responses.
- Removing a member retains their mailbox as shared. Reassign the owner in Mail
  settings first if a specific person should receive the mailbox.
- Temporary passwords require replacement before accessing mail or API integrations.
  A private recovery address is used only after verification.

## Storage and recovery

Large HTML bodies move to R2. Minute cron backfills up to 20 old messages per pass,
recovering omitted HTML and inline images from the raw original where possible.
Original rows stay available until the R2 operation and guarded database update
succeed. Missing original objects surface as errors instead of silently losing content.
Previously orphaned inline files from before this change cannot reliably be attributed;
they may require a separate R2 inventory cleanup.

Trash still counts toward quota. Permanent deletion removes message-owned R2 files
and releases its storage reservation. Outgoing jobs own copies of attachments.
Monitor the minute cron and Cloudflare errors during the backfill.

## Final real-mail acceptance test

Use a real Gmail account and a mailbox on notelio.pl:
1. Send a unique subject and a small attachment from Gmail.
2. Confirm delivery into the correct WorkInbox mailbox and download the attachment.
3. Reply from WorkInbox; ensure Gmail places the response in the same thread.
4. In Gmail's Show original, verify SPF, DKIM and DMARC pass and aligned identities.
5. Confirm the delivery receipt, undo another send, and test a short scheduled send.
6. Enable notifications on a real device, receive a non-spam test message and open it.
7. Revoke shared-mailbox access and confirm neither API nor device notification
   displays subsequent messages.

Do not mark the end-to-end roadmap item complete using local fixtures alone.

## Deployment record — 2026-11-09

- Production database backed up before migration to a local temporary SQL export.
- Migrations 0005–0009 applied successfully; existing four messages indexed.
- Queues inbox-jobs-dlq, inbox-mail-events and inbox-mail-events-dlq provisioned.
- Email event subscriptions enabled for notelio.pl and workinbox.io.
- VAPID key pair installed as Worker secrets; private material is not committed.
- 93 automated tests, full typecheck, build and a local Worker HTTP send/cancel
  acceptance test passed.
- Real Gmail and real-device notification acceptance remain pending user participation.

Production Worker version: 17ffc988-c53a-4817-989d-09081d3a2f1f.
Both cron triggers and queue consumers deployed successfully. Production manifest and OpenAPI returned HTTP 200.

At the first post-deploy check, all four existing messages were preserved and indexed;
their bounded HTML backfill was still awaiting the first minute-cron execution.
No new application errors were recorded at that check. Cron propagation must be
confirmed before considering rollout acceptance complete.
