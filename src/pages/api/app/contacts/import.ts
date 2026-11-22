import { z } from "zod";
import { handler, json, parseBody } from "@/lib/server/api";
import { importContacts } from "@/lib/server/contacts";

const value = z.object({ value: z.string().max(320), label: z.string().max(40).optional() });
const row = z.object({
  name: z.string().max(500).default(""),
  company: z.string().max(500).default(""),
  title: z.string().max(500).default(""),
  note: z.string().max(10_000).default(""),
  emails: z.array(value).max(20).default([]),
  phones: z.array(value).max(20).default([]),
  groups: z.array(z.string().max(80)).max(20).default([]),
});

/** One chunk of an import: the browser parses the CSV / vCard file (lib/contacts/import.ts) and sends rows. */
export const POST = handler(async (ctx) => {
  const { contacts } = await parseBody(ctx.request, z.object({ contacts: z.array(row).min(1).max(200) }));
  const result = await importContacts(ctx.orgId, contacts, ctx.locals.user?.id ?? null);
  ctx.audit("contact.import", { details: result });
  return json(result);
});
