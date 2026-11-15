import { handler, json, parseBody, HttpError } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { listTemplates, saveTemplate, deleteTemplate } from "@/lib/server/mail/filters";
import { templateInput } from "@/lib/validation-mail-filters";
export const GET = handler(async ctx => json({ templates: await listTemplates(await resolveMailboxes(mailViewer(ctx))) }));
export const POST = handler(async ctx => {
  const body = await parseBody(ctx.request, templateInput);
  const result = await saveTemplate(await resolveMailboxes(mailViewer(ctx)), body);
  ctx.audit("mail_template.change", { target: result!.id, details: { operation: body.id ? "update" : "create" } });
  return json(result, 201);
});
export const DELETE = handler(async ctx => {
  const id = ctx.url.searchParams.get("id");
  if (!id) throw new HttpError(422, "Choose a template");
  await deleteTemplate(await resolveMailboxes(mailViewer(ctx)), id);
  ctx.audit("mail_template.change", { target: id, details: { operation: "delete" } });
  return json({ ok: true });
});
