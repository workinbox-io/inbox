/** Request bodies of the contacts API (/api/app/contacts, /api/v1/contacts, MCP). */
import { z } from "zod";

const value = z.object({ value: z.string().trim().min(1).max(320), label: z.string().trim().max(40).optional() });
const field = z.string().trim().max(200);

export const contactListSchema = z.object({
  /** all: the address book; recent: people written to lately; directory: our own people and shared mailboxes. */
  view: z.enum(["all", "recent", "directory"]).default("all"),
  groupId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const fields = {
  name: field,
  company: field,
  title: field,
  note: z.string().max(5000),
  emails: z.array(value.extend({ value: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(254) })).max(10),
  phones: z.array(value).max(10),
  groupIds: z.array(z.string().uuid()).max(50),
};

export const contactSchema = z.object(fields).partial();

// No defaults here: zod 4 would fill them in for missing keys and a PATCH would wipe those fields.
export const contactUpdateSchema = contactSchema.refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });

export const contactGroupSchema = z.object({ name: z.string().trim().min(1, "Enter a name").max(80) });

export type ContactList = z.output<typeof contactListSchema>;
export type ContactInput = z.output<typeof contactSchema>;
export type ContactUpdate = z.output<typeof contactUpdateSchema>;
