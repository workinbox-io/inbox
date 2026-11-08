import { handler, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { updateOwnMailbox } from "@/lib/server/mail/admin";
import { mailViewer } from "@/lib/server/mail/viewer";
import { ownMailboxSchema } from "@/lib/validation-mail";

/** The viewer's mailboxes with their name and signature. */
export const GET = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  return json({ mailboxes: boxes.map((b) => ({ address: b.address, kind: b.kind, displayName: b.displayName, signature: b.signature })) });
});

/** Changes the signature or sender name of a mailbox the viewer can open. */
export const PUT = handler(async (ctx) => {
  const body = await parseBody(ctx.request, ownMailboxSchema);
  const boxes = await resolveMailboxes(mailViewer(ctx), [body.mailbox]);
  await updateOwnMailbox(boxes.map((b) => b.id), boxes[0]!.id, { signature: body.signature, displayName: body.displayName });
  return json({ ok: true });
});
