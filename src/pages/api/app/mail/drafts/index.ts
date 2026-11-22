import { handler, json, parseBody } from "@/lib/server/api";
import { z } from "zod";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { listDrafts, takeOverDraft, teamDrafts } from "@/lib/server/mail/drafts";
import { draftListSchema, mailDraftKey } from "@/lib/validation-mail";
import { mailViewer } from "@/lib/server/mail/viewer";

/** The signed-in person's drafts (the composer's and AI apps'), newest first. */
export const GET = handler(async (ctx) => {
  const viewer = mailViewer(ctx);
  if (ctx.url.searchParams.get("team") === "1") return json({ drafts: await teamDrafts({ orgId: ctx.orgId, userId: viewer.userId, boxes: await resolveMailboxes(viewer) }) });
  const query = draftListSchema.parse(Object.fromEntries(ctx.url.searchParams));
  return json(await listDrafts({ orgId: ctx.orgId, userId: viewer.userId, boxes: await resolveMailboxes(viewer) }, query));
});

/** Take over a colleague's draft in a shared mailbox. */
export const POST = handler(async (ctx) => {
  const viewer = mailViewer(ctx);
  const body = await parseBody(ctx.request, z.object({ action: z.literal("takeOver"), authorId: z.string().min(1), key: mailDraftKey, expectedUpdatedAt: z.number().int().nonnegative() }));
  return json(await takeOverDraft({ orgId: ctx.orgId, userId: viewer.userId, boxes: await resolveMailboxes(viewer) }, body.authorId, body.key, body.expectedUpdatedAt));
});
