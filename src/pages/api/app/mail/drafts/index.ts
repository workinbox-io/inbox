import { handler, json } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { listDrafts } from "@/lib/server/mail/drafts";
import { mailViewer } from "@/lib/server/mail/viewer";

/** The signed-in person's drafts (the composer's and AI apps'), newest first. */
export const GET = handler(async (ctx) => {
  const viewer = mailViewer(ctx);
  return json({ drafts: await listDrafts({ orgId: ctx.orgId, userId: viewer.userId, boxes: await resolveMailboxes(viewer) }) });
});
