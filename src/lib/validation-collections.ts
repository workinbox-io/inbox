/** Request bodies for collections (lib/server/collections.ts), shared by /api/app/collections and MCP. */
import { z } from "zod";
import { IMPORT_CHUNK } from "@/lib/collections/csv";
import { fieldsInputSchema, TEMPLATE_IDS } from "@/lib/collections/fields";
import { REPEAT_UNITS, settingsSchema } from "@/lib/collections/settings";
import { gitEventSchema } from "@/lib/collections/git";
import { COLLECTION_ICONS, HEX_COLOR } from "@/lib/collections/appearance";

const name = z.string().trim().min(1, "Enter a name").max(80);
const icon = z.enum(["", ...COLLECTION_ICONS]).optional().describe(`An icon: ${COLLECTION_ICONS.join(", ")}; empty = none`);
const color = z.union([z.literal(""), z.string().regex(HEX_COLOR)]).optional().describe("A colour as #rrggbb; empty = the default");

export const collectionCreateSchema = z
  .object({
    name: name.optional(),
    template: z.enum(TEMPLATE_IDS).optional().describe("Start from a template: crm, equipment, inventory, projects (tasks) or roadmap (projects)"),
    fields: fieldsInputSchema.optional(),
    icon,
    color,
  })
  .refine((c) => c.name || c.template, { message: "Enter a name or pick a template" });

export const collectionUpdateSchema = z.object({
  name: name.optional(),
  prefix: z.string().trim().toUpperCase().max(5).optional().describe("Record IDs' prefix, e.g. TSK for TSK-12"),
  icon,
  color,
  fields: fieldsInputSchema.optional().describe("The full field list in order; keep each existing field's id so its values stay"),
  settings: settingsSchema.partial().optional().describe("Cycles, triage, SLA and record templates; each key given replaces that setting"),
});

const values = z.record(z.string(), z.unknown()).describe("{ field id or name: value }; null clears a value");

const description = z.array(z.unknown()).nullable().optional().describe("The description as a Plate document; null clears it");
const parentId = z.string().min(1).max(64).nullable().optional().describe("The parent record (same collection) for a sub-record; null takes it out");
const cycle = z.number().int().min(1).max(100_000).nullable().optional().describe("The cycle number it's planned in; null = none");
export const recordCreateSchema = z.object({ title: z.string().trim().min(1, "Enter a title").max(300), values: values.default({}), description, parentId, cycle });
export const recordUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  values: values.optional(),
  position: z.number().finite().optional().describe("Order on the board, ascending"),
  description,
  parentId,
  cycle,
  triage: z.literal(false).optional().describe("false accepts a record waiting in triage"),
});
export const linkSchema = z.object({ url: z.string().trim().min(1).max(2000) });
export const gitEventsSchema = z.object({ events: z.array(gitEventSchema).min(1).max(50) });

/** Several records at once (the selection): the same values for all, positions per id, a cycle, or trash/restore/purge/accept. */
export const recordBatchSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(200),
  values: values.optional(),
  positions: z.record(z.string(), z.number().finite()).optional(),
  cycle,
  delete: z.boolean().optional().describe("Move to the trash (emptied after 30 days)"),
  restore: z.boolean().optional().describe("Back from the trash"),
  purge: z.boolean().optional().describe("Delete for good (records already in the trash)"),
  accept: z.boolean().optional().describe("Accept records waiting in triage"),
});

export const recordListSchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** Comma-separated record ids (live updates refetch just these). */
  ids: z.string().max(8000).transform((v) => v.split(",").filter(Boolean).slice(0, 200)).optional(),
  /** { field id or name: value }, all must match. */
  filter: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  /** The view's filters and closed records (lib/collections/view-config.ts), checked by the server. */
  view: z.object({ filters: z.array(z.unknown()).max(20).default([]), closed: z.boolean().default(true) }).optional(),
  /** all (default), triage (waiting to be accepted) or trash. */
  scope: z.enum(["all", "triage", "trash"]).default("all"),
  /** Sub-records of this record. */
  parent: z.string().min(1).max(64).optional(),
  cycle: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});
export type RecordList = Omit<z.infer<typeof recordListSchema>, "scope"> & { scope?: "all" | "triage" | "trash" };

export const recordImportSchema = z.object({
  rows: z.array(z.object({ title: z.string().trim().min(1).max(300), values: z.record(z.string(), z.string().max(5000)) })).min(1).max(IMPORT_CHUNK),
});

export const commentSchema = z.object({ text: z.string().trim().min(1, "Write something first").max(5000), parentId: z.string().min(1).max(64).optional().describe("Reply in this comment's thread") });
export const reactionSchema = z.object({ emoji: z.string().min(1).max(16) });

export const relationSchema = z.object({
  to: z.string().min(1).max(64).describe("The other record's id"),
  kind: z.enum(["blocks", "blockedBy", "related", "duplicate"]).describe("blocks / blockedBy the other record, related to it, or a duplicate of it"),
});
export const followSchema = z.object({ on: z.boolean() });
export const recurrenceSchema = z.object({
  recordId: z.string().min(1).max(64),
  every: z.number().int().min(1).max(365),
  unit: z.enum(REPEAT_UNITS),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("The first new record's date"),
});

export const viewCreateSchema = z.object({ name: z.string().trim().min(1, "Name the view").max(80), config: z.record(z.string(), z.unknown()), team: z.boolean().default(false) });
export const viewUpdateSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), config: z.record(z.string(), z.unknown()).optional() });
