import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { createContact, listContacts } from "@/lib/server/contacts";
import { contactListSchema, contactSchema } from "@/lib/validation-contacts";

/** The team address book: ?view=all|recent|directory&groupId=&q=&offset=&limit= */
export const GET = handler(async (ctx) => {
  const query = contactListSchema.safeParse(Object.fromEntries(ctx.url.searchParams));
  if (!query.success) throw new HttpError(422, query.error.issues[0]?.message ?? "Invalid query");
  return json(await listContacts(ctx.orgId, query.data));
});

export const POST = handler(async (ctx) => {
  const contact = await createContact(ctx.orgId, await parseBody(ctx.request, contactSchema), ctx.locals.user?.id ?? null);
  ctx.audit("contact.create", { target: contact.name || contact.emails[0]?.value });
  return json(contact, 201);
});
