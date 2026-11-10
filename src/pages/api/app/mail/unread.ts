import { handler, json } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { unreadCounts } from "@/lib/server/mail/store";
import { mailViewer } from "@/lib/server/mail/viewer";

/** Unread inbox threads across the viewer's mailboxes, for the "Mail" badge in the sidebar and app rail. */
export const GET = handler(async (ctx) => {
  const counts = await unreadCounts(await resolveMailboxes(mailViewer(ctx)));
  return json({ total: Object.values(counts).reduce((a, b) => a + b, 0) });
});
