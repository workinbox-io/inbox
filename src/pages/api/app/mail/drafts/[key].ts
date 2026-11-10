import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { deleteDraft, saveDraft } from "@/lib/server/mail/drafts";
import { mailViewer } from "@/lib/server/mail/viewer";
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
  const body = await parseBody(ctx.request, mailDraftSchema);
  return json(await saveDraft({ orgId: ctx.orgId, userId: viewer.userId, boxes: await resolveMailboxes(viewer) }, key, body));
});

/** Discarded or sent. */
export const DELETE = handler(async (ctx) => {
  const viewer = mailViewer(ctx);
  await deleteDraft({ orgId: ctx.orgId, userId: viewer.userId }, keyOf(ctx.params.key));
  return json({ ok: true });
});
