import { handler, json, parseBody, HttpError } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { getAutoReply, saveAutoReply } from "@/lib/server/mail/auto-reply";
import { autoReplyInput } from "@/lib/validation-mail-filters";
export const GET = handler(async ctx => {
  const mailboxId = ctx.url.searchParams.get("mailbox");
  if (!mailboxId) throw new HttpError(422, "Choose a mailbox");
  return json(await getAutoReply(await resolveMailboxes(mailViewer(ctx)), mailboxId));
});
export const PUT = handler(async ctx => {
  const body = await parseBody(ctx.request, autoReplyInput);
  const result = await saveAutoReply(await resolveMailboxes(mailViewer(ctx)), body);
  ctx.audit("mail_auto_reply.change", { target: body.mailboxId, details: { enabled: body.enabled } });
  return json(result);
});
