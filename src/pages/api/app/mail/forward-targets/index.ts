import { handler, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { requestForwardTarget } from "@/lib/server/mail/filters";
import { targetInput } from "@/lib/validation-mail-filters";
export const POST = handler(async ctx => {
  const body = await parseBody(ctx.request, targetInput);
  const viewer = mailViewer(ctx);
  const result = await requestForwardTarget(await resolveMailboxes(viewer), body, viewer.userId || null);
  ctx.audit("mail_forward.request", { target: result.id });
  return json(result, 201);
});
