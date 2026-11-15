import { handler, json } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { listDrafts } from "@/lib/server/mail/drafts";
import { draftListSchema } from "@/lib/validation-mail";
import { mailViewer } from "@/lib/server/mail/viewer";

/** The signed-in person's drafts (the composer's and AI apps'), newest first. */
export const GET = handler(async (ctx) => {
  const viewer = mailViewer(ctx);
  const query = draftListSchema.parse(Object.fromEntries(ctx.url.searchParams));
  return json(await listDrafts({ orgId: ctx.orgId, userId: viewer.userId, boxes: await resolveMailboxes(viewer) }, query));
});
