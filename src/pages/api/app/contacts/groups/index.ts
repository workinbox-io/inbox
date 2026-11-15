import { handler, json, parseBody } from "@/lib/server/api";
import { createGroup, listGroups } from "@/lib/server/contacts";
import { contactGroupSchema } from "@/lib/validation-contacts";

export const GET = handler(async (ctx) => json({ groups: await listGroups(ctx.orgId) }));

export const POST = handler(async (ctx) => {
  const { name } = await parseBody(ctx.request, contactGroupSchema);
  const group = await createGroup(ctx.orgId, name);
  ctx.audit("contact_group.change", { target: name, details: { action: "create" } });
  return json(group, 201);
});
