import { handler, json } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { getThread } from "@/lib/server/mail/store";
import { contactByEmail } from "@/lib/server/contacts";
import { mailViewer } from "@/lib/server/mail/viewer";

/** A thread with its messages, the person's other threads and their address-book entry; opening it marks it read. */
export const GET = handler(async (ctx) => {
  const detail = await getThread(ctx.params.id!, await resolveMailboxes(mailViewer(ctx)));
  return json({ ...detail, contact: await contactByEmail(ctx.orgId, detail.thread.contactEmail) });
});
