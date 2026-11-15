import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { sendMail } from "@/lib/server/mail/store";
import { mailViewer } from "@/lib/server/mail/viewer";
import { checkDraftFiles } from "@/lib/server/mail/draft-files";
import { requireDraftVersion } from "@/lib/server/mail/drafts";
import { mailSendSchema } from "@/lib/validation-mail";

/** A reply in a thread, from the thread's mailbox. */
export const POST = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  const body = await parseBody(ctx.request, mailSendSchema);
  if (!body.text) throw new HttpError(422, "Write a message");
  const owner = { orgId: ctx.orgId, userId: ctx.locals.user!.id, role: ctx.role, boxes };
  if (body.draftKey) {
    if (body.expectedUpdatedAt === undefined) throw new HttpError(422, "Provide the draft version");
    await requireDraftVersion(owner, body.draftKey, body.expectedUpdatedAt);
  }
  const files = await checkDraftFiles(owner, body.files);
  const job = await sendMail({ threadId: ctx.params.id!, to: body.to, cc: body.cc, text: body.text, signature: body.signature, files, sendAt: body.sendAt }, boxes, ctx.locals.user!.name, { actorUserId: ctx.locals.user!.id, idempotencyKey: ctx.request.headers.get("Idempotency-Key") ?? body.idempotencyKey });
  return json(job, 202);
});
