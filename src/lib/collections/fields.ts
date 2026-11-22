/**
 * Collections (custom modules): a company defines its own lists (equipment, inventory, deals, tasks…) as fields, and
 * every record stores its values as `{ [fieldId]: value }`. Pure module: field definitions, value validation and the
 * starter templates, shared by the server, the browser and MCP. Tested in test/collections.test.ts.
 */
import { z } from "zod";
import { msg } from "@/lib/i18n/panel";

export const FIELD_TYPES = ["text", "number", "date", "select", "multiselect", "checkbox", "person", "url", "email", "relation", "file"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
/** How a choice field reads: plain chips, a workflow (status rings, done and cancelled) or priority bars. */
export const FIELD_STYLES = ["plain", "status", "priority"] as const;
export type FieldStyle = (typeof FIELD_STYLES)[number];

export interface CollectionField {
  /** Stable key in the records' values; renaming a field keeps it. */
  id: string;
  name: string;
  type: FieldType;
  /** `select` and `multiselect`: the choices, in the board's column order. */
  options?: string[];
  /** `select` only; unset = guessed from the name (fieldStyle). */
  style?: FieldStyle;
  /** `relation` only: the collection its records come from. */
  target?: string;
  /** A new record's value when none is given; `"me"` (person) = whoever creates it, `"today"` (date) = that day. */
  default?: FieldValue;
}

/** A multiselect holds its picks as an array; a relation a record id; a file an attachment URL (lib/uploads.ts). */
export type FieldValue = string | number | boolean | string[];
export type RecordValues = Record<string, FieldValue>;

export const MAX_FIELDS = 30;
const FIELD_ID = /^[a-z0-9_]{1,32}$/;

export const fieldInputSchema = z.object({
  id: z.string().regex(FIELD_ID).optional().describe("Keep an existing field's id so its values stay; leave out for a new field"),
  name: z.string().trim().min(1).max(60),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(60)).max(50).optional().describe("Choices of a select or multiselect field"),
  style: z.enum(FIELD_STYLES).optional().describe("select only: status (a workflow: last choice done, Cancelled/Lost closed) or priority"),
  target: z.string().min(1).max(64).optional().describe("relation only: the id of the collection its records come from"),
  default: z.union([z.string().max(5000), z.number(), z.boolean(), z.array(z.string())]).nullish().describe('A new record\'s value when none is given. person: "me" (the creator); date: "today"'),
});
export type FieldInput = z.infer<typeof fieldInputSchema>;
export const fieldsInputSchema = z.array(fieldInputSchema).max(MAX_FIELDS);

/** A rule broken by the input; the server turns it into a 422. */
export class CollectionError extends Error {}

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0142/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "field";

/** Checks a field list and gives new fields an id made from their name; existing ids are kept. */
export function normalizeFields(input: FieldInput[]): CollectionField[] {
  if (input.length > MAX_FIELDS) throw new CollectionError(`Up to ${MAX_FIELDS} fields`);
  const names = new Set<string>();
  const ids = new Set(input.flatMap((f) => (f.id ? [f.id] : [])));
  if (ids.size !== input.filter((f) => f.id).length) throw new CollectionError("Two fields have the same id");
  return input.map((f) => {
    const key = f.name.trim().toLowerCase();
    if (names.has(key)) throw new CollectionError(`Two fields are called "${f.name}"`);
    names.add(key);
    let id = f.id;
    if (!id) {
      const base = slug(f.name);
      id = base;
      for (let n = 2; ids.has(id); n++) id = `${base}_${n}`;
      ids.add(id);
    }
    const field: CollectionField = { id, name: f.name.trim(), type: f.type };
    if (f.type === "select" || f.type === "multiselect") {
      const options = [...new Set((f.options ?? []).map((o) => o.trim()).filter(Boolean))];
      if (!options.length) throw new CollectionError(`"${f.name}" needs at least one choice`);
      field.options = options;
    }
    if (f.type === "select" && f.style && f.style !== "plain") field.style = f.style;
    if (f.type === "select" && f.style === "plain") field.style = "plain";
    if (f.type === "relation") {
      if (!f.target) throw new CollectionError(`"${f.name}" needs the collection it links to`);
      field.target = f.target;
    }
    const def = cleanDefault(field, f.default);
    if (def !== null) field.default = def;
    return field;
  });
}

/** Fields that can hold a default: not labels, records or files; a person is only ever "me", a date only "today". */
export const hasDefault = (type: FieldType) => !["multiselect", "relation", "file"].includes(type);

function cleanDefault(field: CollectionField, raw: unknown): FieldValue | null {
  if (raw === null || raw === undefined || raw === "" || raw === false || !hasDefault(field.type)) return null;
  if (field.type === "person" || field.type === "date") {
    const token = field.type === "person" ? "me" : "today";
    if (raw !== token) throw new CollectionError(`"${field.name}": the default can only be "${token}"`);
    return token;
  }
  return cleanValue(field, raw);
}

/**
 * A new record's values for the fields not given (by id or name; given on purpose, even empty, stays): each field's
 * default, and a status field without one starts at its first choice (Backlog, To do…), as in Linear, so a new card
 * lands in the board's first column. `"me"` without a person (API keys) is left out.
 */
export function defaultValues(fields: CollectionField[], given: Record<string, unknown>, ctx: { userId: string | null; today: string }): RecordValues {
  const out: RecordValues = {};
  for (const f of fields) {
    if (f.id in given || f.name in given) continue;
    const v = f.default ?? (fieldStyle(f) === "status" ? f.options?.[0] : undefined);
    if (v === "me" && f.type === "person") {
      if (ctx.userId) out[f.id] = ctx.userId;
    } else if (v === "today" && f.type === "date") out[f.id] = ctx.today;
    else if (v !== undefined) out[f.id] = v;
  }
  return out;
}

/** A field by its id or its name (any case), so AI apps can write `{ "Status": "Done" }`. */
export function findField(fields: CollectionField[], key: string) {
  const lower = key.trim().toLowerCase();
  return fields.find((f) => f.id === key) ?? fields.find((f) => f.name.toLowerCase() === lower);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const DMY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
export const YES = /^(true|yes|tak|1)$/i;
export const NO = /^(false|no|nie|0)$/i;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One value, checked against its field. `null`/"" clears it. Person values are checked against the org by the server. */
export function cleanValue(field: CollectionField, raw: unknown): FieldValue | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const bad = () => new CollectionError(`"${field.name}": ${JSON.stringify(raw)} is not a valid ${field.type}`);
  switch (field.type) {
    case "text": {
      if (typeof raw !== "string" && typeof raw !== "number") throw bad();
      const s = String(raw).trim();
      if (s.length > 5000) throw new CollectionError(`"${field.name}" is too long`);
      return s || null;
    }
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/[\s\u00a0]/g, "").replace(",", ".")) : NaN;
      if (!Number.isFinite(n)) throw bad();
      return n;
    }
    case "date": {
      // ISO, or day.month.year as European spreadsheets write it.
      const dmy = typeof raw === "string" ? DMY.exec(raw.trim()) : null;
      const s = dmy ? `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}` : typeof raw === "string" ? raw.trim().slice(0, 10) : "";
      if (!DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw bad();
      return s;
    }
    case "select": {
      const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const match = field.options?.find((o) => o.toLowerCase() === s);
      if (!match) throw new CollectionError(`"${field.name}" must be one of: ${(field.options ?? []).join(", ")}`);
      return match;
    }
    case "multiselect": {
      // An array, or "a, b" as a spreadsheet or an AI app writes it; kept in the field's order.
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;]/) : null;
      if (!list || list.some((x) => typeof x !== "string")) throw bad();
      const picked = new Set(
        (list as string[]).map((x) => x.trim().toLowerCase()).filter(Boolean).map((x) => {
          const match = field.options?.find((o) => o.toLowerCase() === x);
          if (!match) throw new CollectionError(`"${field.name}" takes: ${(field.options ?? []).join(", ")}`);
          return match;
        }),
      );
      const out = (field.options ?? []).filter((o) => picked.has(o));
      return out.length ? out : null;
    }
    case "relation":
      if (typeof raw !== "string" || raw.trim().length > 64) throw bad();
      return raw.trim();
    case "file":
      if (typeof raw !== "string" || !raw.startsWith("/api/files/attachments/") || raw.length > 400) throw bad();
      return raw;
    case "checkbox":
      if (typeof raw === "boolean") return raw;
      if (raw === 1 || (typeof raw === "string" && YES.test(raw.trim()))) return true;
      if (raw === 0 || (typeof raw === "string" && NO.test(raw.trim()))) return false;
      throw bad();
    case "person":
      if (typeof raw !== "string" || raw.length > 320) throw bad();
      return raw.trim();
    case "url": {
      if (typeof raw !== "string") throw bad();
      try {
        const url = new URL(raw.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") throw bad();
        return url.href;
      } catch {
        throw bad();
      }
    }
    case "email": {
      const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      if (!EMAIL.test(s) || s.length > 320) throw bad();
      return s;
    }
  }
}

/** Checks `{ field id or name: value }`; unknown fields are an error (a typo shouldn't be dropped silently). */
export function cleanValues(fields: CollectionField[], input: Record<string, unknown>): Record<string, FieldValue | null> {
  const out: Record<string, FieldValue | null> = {};
  for (const [key, raw] of Object.entries(input)) {
    const field = findField(fields, key);
    if (!field) throw new CollectionError(`No field "${key}". Fields: ${fields.map((f) => f.name).join(", ") || "none"}`);
    out[field.id] = cleanValue(field, raw);
  }
  return out;
}

/** Applies a patch (`null` clears) and drops values of fields that no longer exist. */
export function mergeValues(fields: CollectionField[], current: RecordValues, patch: Record<string, FieldValue | null>): RecordValues {
  const out: RecordValues = {};
  for (const f of fields) {
    const v = Object.hasOwn(patch, f.id) ? patch[f.id] : current[f.id];
    if (v !== null && v !== undefined) out[f.id] = v;
  }
  return out;
}


/** Two values are the same (multiselects compare their picks). */
export const sameValue = (a: FieldValue | null | undefined, b: FieldValue | null | undefined) =>
  Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null) : (a ?? null) === (b ?? null);

/** A value as plain text (CSV, messages, search); multiselects joined with ", ". */
export const valueText = (v: FieldValue | null | undefined) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v));

// ---- Status and priority ----

export type StatusKind = "backlog" | "unstarted" | "started" | "done" | "canceled";
const DONE = /^(done|completed?|closed|won|resolved|shipped|finished|zrobione|gotowe|zako[nń]czon\w*|wygran\w*)$/i;
const CANCELED = /^(cancel+ed|lost|declined|rejected|won'?t do|retired|duplicate|anulowan\w*|przegran\w*|odrzucon\w*)$/i;
const BACKLOG = /^(backlog|icebox|someday|idea|ideas|pomys[lł]y?)$/i;

/** A select field's look: as set, else status for "Status"/"Stage", priority for "Priority". */
export function fieldStyle(f: CollectionField): FieldStyle {
  if (f.type !== "select") return "plain";
  if (f.style) return f.style;
  if (/^(status|stage|state|etap|stan)$/i.test(f.name.trim())) return "status";
  if (/^(priority|priorytet|importance|pilno[sś][cć])$/i.test(f.name.trim())) return "priority";
  return "plain";
}

/**
 * Where a choice sits in a workflow: Done/Won/… are done, Cancelled/Lost/… cancelled, Backlog backlog; otherwise the
 * first choice hasn't started, the last open one is done when nothing is named so, the rest are in progress.
 */
export function statusKind(f: CollectionField, option: string | undefined): StatusKind | null {
  const options = f.options ?? [];
  if (option === undefined || !options.includes(option)) return null;
  if (DONE.test(option.trim())) return "done";
  if (CANCELED.test(option.trim())) return "canceled";
  if (BACKLOG.test(option.trim())) return "backlog";
  const open = options.filter((o) => !CANCELED.test(o.trim()) && !BACKLOG.test(o.trim()));
  const named = options.some((o) => DONE.test(o.trim()));
  if (option === open[0] && open.length > 1) return "unstarted";
  if (!named && option === open.at(-1) && open.length > 1) return "done";
  return "started";
}

/** The field that holds a record's workflow: a status select, else the first select not marked plain on purpose. */
export const statusFieldOf = (fields: CollectionField[]) =>
  fields.find((f) => fieldStyle(f) === "status") ?? fields.find((f) => f.type === "select" && !f.style && fieldStyle(f) === "plain");

export const priorityFieldOf = (fields: CollectionField[]) => fields.find((f) => fieldStyle(f) === "priority");

/** Done or cancelled: closed records aren't overdue, roll over to the next cycle, or count against an SLA. */
export function isClosed(fields: CollectionField[], values: RecordValues) {
  const f = statusFieldOf(fields);
  const kind = f ? statusKind(f, typeof values[f.id] === "string" ? (values[f.id] as string) : undefined) : null;
  return kind === "done" || kind === "canceled";
}

/** 4 urgent, 3 high, 2 medium, 1 low, from the name, else from the place (the first choice is the most important). */
export function priorityLevel(f: CollectionField, option: string | undefined): number {
  const options = f.options ?? [];
  if (option === undefined || !options.includes(option)) return 0;
  const o = option.trim().toLowerCase();
  if (/^(urgent|critical|pilne|krytyczn\w*|p0)$/.test(o)) return 4;
  if (/^(high|wysoki|wysoka|p1)$/.test(o)) return 3;
  if (/^(medium|normal|[sś]redni|[sś]rednia|p2)$/.test(o)) return 2;
  if (/^(low|niski|niska|p3)$/.test(o)) return 1;
  const i = options.indexOf(option);
  return Math.max(1, Math.round(4 - (i * 3) / Math.max(1, options.length - 1)));
}

export const TEMPLATE_IDS = ["crm", "equipment", "inventory", "projects", "roadmap"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Starter collections: a company picks one and edits the fields from there. */
export const COLLECTION_TEMPLATES: Record<TemplateId, { name: string; description: string; fields: FieldInput[] }> = {
  crm: {
    name: msg("Deals"),
    description: msg("A simple CRM: companies, deal value and a pipeline board."),
    fields: [
      { name: "Stage", type: "select", style: "status", options: ["Lead", "Qualified", "Proposal", "Won", "Lost"] },
      { name: "Company", type: "text" },
      { name: "Value", type: "number" },
      { name: "Owner", type: "person" },
      { name: "Contact", type: "email" },
      { name: "Close date", type: "date" },
    ],
  },
  equipment: {
    name: msg("Equipment"),
    description: msg("Laptops, phones and monitors: who has what, serial numbers, repairs."),
    fields: [
      { name: "Status", type: "select", style: "plain", options: ["In use", "In stock", "In repair", "Retired"] },
      { name: "Type", type: "select", options: ["Laptop", "Phone", "Monitor", "Accessory", "Other"] },
      { name: "Serial number", type: "text" },
      { name: "Assigned to", type: "person" },
      { name: "Purchased", type: "date" },
    ],
  },
  inventory: {
    name: msg("Inventory"),
    description: msg("Stock levels: SKU, quantity, location and when to reorder."),
    fields: [
      { name: "Status", type: "select", style: "plain", options: ["In stock", "Low", "Out of stock"] },
      { name: "SKU", type: "text" },
      { name: "Quantity", type: "number" },
      { name: "Reorder at", type: "number" },
      { name: "Location", type: "text" },
    ],
  },
  projects: {
    name: msg("Tasks"),
    description: msg("A project board: status columns, who does it and by when."),
    fields: [
      { name: "Status", type: "select", style: "status", options: ["Backlog", "To do", "In progress", "Review", "Done", "Cancelled"] },
      { name: "Assignee", type: "person" },
      { name: "Due", type: "date" },
      { name: "Priority", type: "select", style: "priority", options: ["Urgent", "High", "Medium", "Low"] },
      { name: "Labels", type: "multiselect", options: ["Bug", "Feature", "Improvement"] },
      { name: "Estimate", type: "number" },
    ],
  },
  roadmap: {
    name: msg("Projects"),
    description: msg("Bigger pieces of work: a lead, dates, health, and the tasks linked to each project."),
    fields: [
      { name: "Status", type: "select", style: "status", options: ["Planned", "In progress", "Paused", "Completed", "Cancelled"] },
      { name: "Lead", type: "person" },
      { name: "Start", type: "date" },
      { name: "Target date", type: "date" },
      { name: "Health", type: "select", options: ["On track", "At risk", "Off track"] },
    ],
  },
};

/**
 * Who hears about a new comment: people @mentioned get a mention, the record's assignees, its creator and earlier
 * commenters get a comment notice, and so do people following the record (muted ones don't). Never the author, never
 * anyone who can't open the collection.
 */
export function commentAudience(input: { mentioned: string[]; assignees: string[]; creator: string | null; commenters: string[]; author: string | null; canView: (userId: string) => boolean; subscribed?: string[]; muted?: string[] }) {
  const ok = (id: string | null): id is string => !!id && id !== input.author && input.canView(id);
  const mention = [...new Set(input.mentioned.filter(ok))];
  const muted = new Set(input.muted ?? []);
  const comment = [...new Set([...input.assignees, input.creator, ...input.commenters].filter(ok).filter((id) => !muted.has(id)).concat((input.subscribed ?? []).filter(ok)))].filter((id) => !mention.includes(id));
  return { mention, comment };
}
