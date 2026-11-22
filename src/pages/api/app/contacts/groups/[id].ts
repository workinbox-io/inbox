import { handler, json, parseBody } from "@/lib/server/api";
import { deleteGroup, renameGroup } from "@/lib/server/contacts";
import { contactGroupSchema } from "@/lib/validation-contacts";

export const PATCH = handler(async (ctx) => {
  const { name } = await parseBody(ctx.request, contactGroupSchema);
  const group = await renameGroup(ctx.orgId, ctx.params.id!, name);
  ctx.audit("contact_group.change", { target: name, details: { action: "rename" } });
  return json(group);
});

/** Deletes the group; its contacts stay. */
export const DELETE = handler(async (ctx) => {
  const group = await deleteGroup(ctx.orgId, ctx.params.id!);
  ctx.audit("contact_group.change", { target: group.name, details: { action: "delete" } });
  return json({ ok: true });
});
