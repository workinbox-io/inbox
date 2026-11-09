import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { queueMailSend } from "@/lib/server/mail/outbox";
import { mailSendSchema } from "@/lib/validation-mail";
import { checkAttachments } from "@/lib/server/uploads";
export const POST = handler(async ctx => {
  const input = await parseBody(ctx.request, mailSendSchema);
  if (!input.subject && !input.forwardOf) throw new HttpError(422, "Add a subject");
  const files = await checkAttachments(ctx.orgId, input.files);
  const job = await queueMailSend({ ...input, files }, await viewerMailboxes(mailViewer(ctx)), ctx.locals.user?.name ?? "", {
    actorUserId: ctx.locals.user?.id, apiKeyId: ctx.locals.apiKeyId ?? undefined,
    idempotencyKey: ctx.request.headers.get("Idempotency-Key") ?? undefined,
  });
  ctx.audit("mail_send.queue", { target: job.id });
  return json(job, 202);
});
