import { z } from "zod";
export const labelInput = z.object({ mailboxId: z.string().uuid(), name: z.string().trim().min(1).max(80), id: z.string().uuid().optional() });
export const labelPatch = z.object({ labelId: z.string().uuid(), threadIds: z.array(z.string().uuid()).min(1).max(200), remove: z.boolean().default(false) });
export const filterInput = z.object({
  id: z.string().uuid().optional(), mailboxId: z.string().uuid(), name: z.string().trim().min(1).max(80),
  position: z.number().int().min(0).max(10000).default(0), enabled: z.boolean().default(true),
  conditions: z.array(z.discriminatedUnion("field", [
    z.object({ field: z.enum(["from", "to", "subject", "text"]), value: z.string().trim().min(1).max(500) }),
    z.object({ field: z.literal("attachment"), value: z.enum(["true", "false"]) }),
  ])).min(1).max(10),
  actions: z.object({ labelId: z.string().uuid().optional(), archive: z.boolean().optional(), forwardTargetId: z.string().uuid().optional() }).refine(a => a.labelId || a.archive || a.forwardTargetId, "Choose an action"),
});
export const targetInput = z.object({ mailboxId: z.string().uuid(), address: z.string().trim().toLowerCase().email().max(254) });
export const templateInput = z.object({
  id: z.string().uuid().optional(), mailboxId: z.string().uuid(), name: z.string().trim().min(1).max(80),
  subject: z.string().trim().max(300).default(""), text: z.string().trim().min(1).max(20_000),
});
const when = z.number().int().nullable().default(null).transform(v => (v === null ? null : new Date(v)));
export const autoReplyInput = z.object({
  mailboxId: z.string().uuid(), enabled: z.boolean(), subject: z.string().trim().max(300).default(""),
  text: z.string().trim().max(10_000).default(""), startsAt: when, endsAt: when,
}).refine(a => !a.enabled || a.text, { message: "Write the reply", path: ["text"] })
  .refine(a => !a.startsAt || !a.endsAt || a.endsAt > a.startsAt, { message: "The end must be after the start", path: ["endsAt"] });
