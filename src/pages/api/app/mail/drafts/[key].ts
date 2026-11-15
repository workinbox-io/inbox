import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { deleteDraft, getDraft, saveDraft } from "@/lib/server/mail/drafts";
import { mailViewer } from "@/lib/server/mail/viewer";
import { z } from "zod";
import { mailDraftKey, mailDraftSchema } from "@/lib/validation-mail";

const keyOf = (raw: string | undefined) => {
  const key = mailDraftKey.safeParse(raw);
  if (!key.success) throw new HttpError(404, "Not found");
  return key.data;
};

/** Saves the composer's draft (the browser debounces). */
export const PUT = handler(async (ctx) => {
  const key = keyOf(ctx.params.key);
  const viewer = mailViewer(ctx);
  const body = await parseBody(ctx.request, mailDraftSchema.extend({ expectedUpdatedAt: z.number().int().nonnegative().nullable() }));
  const { expectedUpdatedAt, ...draft } = body;
  return json(await saveDraft({ orgId: ctx.orgId, userId: viewer.userId, boxes: await resolveMailboxes(viewer), role: ctx.role }, key, draft, { expectedUpdatedAt }));
});

/** Discarded or sent. */
export const DELETE = handler(async (ctx) => {
  const viewer = mailViewer(ctx);
  const { expectedUpdatedAt } = await parseBody(ctx.request, z.object({ expectedUpdatedAt: z.number().int().nonnegative() }));
  const owner = { orgId: ctx.orgId, userId: viewer.userId, boxes: await resolveMailboxes(viewer) };
  await getDraft(owner, keyOf(ctx.params.key));
  await deleteDraft(owner, keyOf(ctx.params.key), expectedUpdatedAt);
  return json({ ok: true });
});

export const GET = handler(async (ctx) => {
  const viewer = mailViewer(ctx);
  return json(await getDraft({ orgId: ctx.orgId, userId: viewer.userId, boxes: await resolveMailboxes(viewer) }, keyOf(ctx.params.key)));
});
