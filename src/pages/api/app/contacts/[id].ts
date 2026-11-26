import { handler, json, parseBody } from "@/lib/server/api";
import { deleteContact, getContact, updateContact } from "@/lib/server/contacts";
import { contactUpdateSchema } from "@/lib/validation-contacts";

export const GET = handler(async (ctx) => json(await getContact(ctx.orgId, ctx.params.id!)));

export const PATCH = handler(async (ctx) => {
  const contact = await updateContact(ctx.orgId, ctx.params.id!, await parseBody(ctx.request, contactUpdateSchema));
  ctx.audit("contact.update", { target: contact.name || contact.emails[0]?.value });
  return json(contact);
});

export const DELETE = handler(async (ctx) => {
  const contact = await deleteContact(ctx.orgId, ctx.params.id!);
  ctx.audit("contact.delete", { target: contact.name || contact.emails[0]?.value });
  return json({ ok: true });
});
