import { handler, json, parseBody, HttpError } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { listLabels, saveLabel, deleteLabel, assignLabel } from "@/lib/server/mail/filters";
import { labelInput, labelPatch } from "@/lib/validation-mail-filters";
export const GET = handler(async ctx => json({ labels: await listLabels(await resolveMailboxes(mailViewer(ctx))) }));
export const POST = handler(async ctx => {
  const body = await parseBody(ctx.request, labelInput);
  const result = await saveLabel(await resolveMailboxes(mailViewer(ctx)), body);
  ctx.audit("mail_label.change", { target: result!.id, details: { operation: body.id ? "rename" : "create" } });
  return json(result, 201);
});
export const PATCH = handler(async ctx => {
  const body = await parseBody(ctx.request, labelPatch);
  await assignLabel(await resolveMailboxes(mailViewer(ctx)), body);
  ctx.audit("mail_label.change", { target: body.labelId, details: { operation: body.remove ? "remove" : "assign", threads: body.threadIds.length } });
  return json({ ok: true });
});
export const DELETE = handler(async ctx => {
  const id = ctx.url.searchParams.get("id");
  if (!id) throw new HttpError(422, "Choose a label");
  await deleteLabel(await resolveMailboxes(mailViewer(ctx)), id);
  ctx.audit("mail_label.change", { target: id, details: { operation: "delete" } });
  return json({ ok: true });
});
