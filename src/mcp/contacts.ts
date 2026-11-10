/** MCP tools for the team address book: the same lib/server functions as /api/app/contacts. */
import { z } from "zod";
import { createContact, getContact, listContacts, updateContact } from "@/lib/server/contacts";
import { contactListSchema, contactSchema } from "@/lib/validation-contacts";
import { defineTool, type McpModule, type Tools } from "./define";

const contactId = z.string().uuid().describe("Contact id from contacts_search");
const fields = contactSchema.omit({ groupIds: true });

export const contactsTools: Tools = {
  contacts_search: defineTool({
    title: "Search contacts",
    description:
      "Searches the organization's shared address book by name, company or e-mail. `view: recent` lists people the team wrote to lately; `view: directory` lists the organization's own people and shared mailboxes. A search of `all` includes matching directory entries too.",
    input: contactListSchema.pick({ view: true, q: true, limit: true }),
    async run(input, ctx) {
      return listContacts(ctx.orgId, { ...input, offset: 0, limit: input.limit ?? 25 });
    },
  }),

  contacts_get: defineTool({
    title: "Read contact",
    description: "One contact with all its e-mail addresses, phone numbers, company, job title, note and group ids.",
    input: z.object({ id: contactId }),
    async run({ id }, ctx) {
      return getContact(ctx.orgId, id);
    },
  }),

  contacts_create: defineTool({
    title: "Create contact",
    description: "Adds a contact to the shared address book (everyone in the organization sees it). Fails if one of its e-mail addresses already belongs to another contact; search first.",
    input: fields,
    scope: "write",
    async run(input, ctx) {
      const contact = await createContact(ctx.orgId, input, ctx.userId ?? null);
      ctx.audit("contact.create", { target: contact.name || contact.emails[0]?.value });
      return contact;
    },
  }),

  contacts_update: defineTool({
    title: "Edit contact",
    description: "Changes a contact. Only the fields sent change; `emails` and `phones` replace the whole list, so send the existing entries too (contacts_get returns them).",
    input: fields.extend({ id: contactId }),
    scope: "write",
    async run({ id, ...input }, ctx) {
      const contact = await updateContact(ctx.orgId, id, input);
      ctx.audit("contact.update", { target: contact.name || contact.emails[0]?.value });
      return contact;
    },
  }),
};

export const contactsModule: McpModule = {
  name: "contacts",
  instructions: "Contacts: the organization's shared address book; search before creating, since one address belongs to one contact.",
  tools: contactsTools,
};
