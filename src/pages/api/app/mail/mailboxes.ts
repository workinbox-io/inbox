import { handler, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { getSignatureBrand, updateOwnMailbox } from "@/lib/server/mail/admin";
import { listStorage } from "@/lib/server/mail/storage";
import { mailViewer } from "@/lib/server/mail/viewer";
import { ownMailboxSchema } from "@/lib/validation-mail";

/** The viewer's mailboxes with their name and signature. */
export const GET = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  const usage = await listStorage(boxes.map(b=>b.id));
  return json({ mailboxes: boxes.map((b) => ({ id:b.id, storage:usage.find(u=>u.mailboxId===b.id), address: b.address, kind: b.kind, displayName: b.displayName, signature: b.signature, signatureCard: b.signatureCard })), signatureBrand: await getSignatureBrand(ctx.orgId) });
});

/** Changes the signature or sender name of a mailbox the viewer can open. */
export const PUT = handler(async (ctx) => {
  const body = await parseBody(ctx.request, ownMailboxSchema);
  const boxes = await resolveMailboxes(mailViewer(ctx), [body.mailbox]);
  await updateOwnMailbox(boxes.map((b) => b.id), boxes[0]!.id, { signature: body.signature, signatureCard: body.signatureCard, displayName: body.displayName });
  return json({ ok: true });
});
