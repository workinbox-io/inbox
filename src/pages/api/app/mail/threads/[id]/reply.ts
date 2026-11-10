import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { sendMail } from "@/lib/server/mail/store";
import { mailViewer } from "@/lib/server/mail/viewer";
import { checkAttachments } from "@/lib/server/uploads";
import { mailSendSchema } from "@/lib/validation-mail";

/** A reply in a thread, from the thread's mailbox. */
export const POST = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  const body = await parseBody(ctx.request, mailSendSchema);
  if (!body.text) throw new HttpError(422, "Write a message");
  const files = await checkAttachments(ctx.orgId, body.files);
  return json(await sendMail({ threadId: ctx.params.id!, to: body.to, cc: body.cc, text: body.text, signature: body.signature, files, sendAt: body.sendAt }, boxes, ctx.locals.user!.name, { actorUserId: ctx.locals.user!.id, idempotencyKey: ctx.request.headers.get("Idempotency-Key") ?? body.idempotencyKey }), 202);
});
