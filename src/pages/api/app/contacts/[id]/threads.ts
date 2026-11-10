import { handler, json } from "@/lib/server/api";
import { contactThreads } from "@/lib/server/contacts";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";

/** The latest conversations with a contact, only from mailboxes the viewer may open. */
export const GET = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  return json(await contactThreads(ctx.orgId, ctx.params.id!, boxes.map((b) => b.id)));
});
