import { handler, json, parseBody, HttpError } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { listFilters, saveFilter, deleteFilter } from "@/lib/server/mail/filters";
import { filterInput } from "@/lib/validation-mail-filters";
export const GET = handler(async ctx => json(await listFilters(await resolveMailboxes(mailViewer(ctx)))));
export const POST = handler(async ctx => {
  const body = await parseBody(ctx.request, filterInput);
  const result = await saveFilter(await resolveMailboxes(mailViewer(ctx)), body);
  ctx.audit("mail_filter.change", { target: result!.id, details: { operation: body.id ? "update" : "create" } });
  return json(result, 201);
});
export const DELETE = handler(async ctx => {
  const id = ctx.url.searchParams.get("id");
  if (!id) throw new HttpError(422, "Choose a filter");
  await deleteFilter(await resolveMailboxes(mailViewer(ctx)), id);
  ctx.audit("mail_filter.change", { target: id, details: { operation: "delete" } });
  return json({ ok: true });
});
