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
