import { z } from "zod";
import { handler, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { getOutboxJob, cancelOutboxJob, rescheduleOutboxJob } from "@/lib/server/mail/outbox";
export const GET = handler(async ctx => json(await getOutboxJob(ctx.params.id!, await resolveMailboxes(mailViewer(ctx)))));
export const DELETE = handler(async ctx => {
  const result = await cancelOutboxJob(ctx.params.id!, await resolveMailboxes(mailViewer(ctx)));
  ctx.audit("mail_send.cancel", { target: result.id });
  return json(result);
});
export const PATCH = handler(async ctx => {
  const body = await parseBody(ctx.request, z.object({ sendAt: z.number().int().positive() }));
  const result = await rescheduleOutboxJob(ctx.params.id!, body.sendAt, await resolveMailboxes(mailViewer(ctx)));
  ctx.audit("mail_send.schedule", { target: result.id, details: { sendAt: body.sendAt } });
  return json(result);
});
