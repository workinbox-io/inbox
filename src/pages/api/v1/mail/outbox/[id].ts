import { handler, json } from "@/lib/server/api";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { getOutboxJob, cancelOutboxJob } from "@/lib/server/mail/outbox";
export const GET = handler(async ctx => json(await getOutboxJob(ctx.params.id!, await viewerMailboxes(mailViewer(ctx)))));
export const DELETE = handler(async ctx => {
  const job = await cancelOutboxJob(ctx.params.id!, await viewerMailboxes(mailViewer(ctx)));
  ctx.audit("mail_send.cancel", { target: job.id });
  return json(job);
});
