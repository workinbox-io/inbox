/**
 * How a collection is shown: layout (list, table, board, timeline, calendar), grouping and swimlanes, ordering (and a
 * second key), the fields on cards and as columns, empty and collapsed groups, closed records, filters with operators.
 * Kept per collection in the browser and as saved views (collection_views). Pure, tested in test/collections.test.ts.
 */
import { NONE } from "./board";
import { isClosed, statusFieldOf, type CollectionField, type FieldValue, type RecordValues } from "./fields";

export const ORDERS = ["manual", "updated", "created", "title"] as const;
export const LAYOUTS = ["list", "table", "board", "timeline", "calendar"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const FILTER_OPS = ["is", "not", "empty", "filled", "before", "after", "overdue", "lt", "gt", "contains", "checked", "unchecked"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];
/** `value`: picked choices / people / records (is, not), a date (before, after), a number (lt, gt) or text (contains). */
export type FilterRule = { field: string; op: FilterOp; value?: string[] | string | number };

export type ViewConfig = {
  layout: Layout;
  /** Board columns and list groups: a select or person field (lists may also go without, null). */
  group: string | null;
  /** Swimlanes: another select or person field. */
  lanes: string | null;
  /** manual (the board's saved order), updated, created, title, or a field id. */
  order: string;
  dir: 1 | -1;
  /** A second key for ties; null = none. */
  then: string | null;
  thenDir: 1 | -1;
  /** Fields shown on cards and as table columns; null = the default set. */
  props: string[] | null;
  hideEmpty: boolean;
  /** Collapsed column or group keys (a choice, a person id or NONE). */
  collapsed: string[];
  filters: FilterRule[];
  /** Show done and cancelled records. */
  closed: boolean;
  /** Timeline and calendar: the date field records sit on, and (timeline) where they end. */
  start: string | null;
  end: string | null;
};

/** Fields a board can group by or split into lanes. */
export const groupFields = (fields: CollectionField[]) => fields.filter((f) => f.type === "select" || f.type === "person");
export const dateFields = (fields: CollectionField[]) => fields.filter((f) => f.type === "date");

/** Which operators a field type takes, the first being the default. */
export function opsFor(f: CollectionField): FilterOp[] {
  switch (f.type) {
    case "select":
    case "person":
    case "relation":
    case "multiselect":
      return ["is", "not"];
    case "date":
      return ["before", "after", "overdue", "empty", "filled"];
    case "number":
      return ["gt", "lt", "empty", "filled"];
    case "checkbox":
      return ["checked", "unchecked"];
    default:
      return ["contains", "empty", "filled"];
  }
}

export function defaultView(fields: CollectionField[]): ViewConfig {
  const group = statusFieldOf(fields)?.id ?? fields.find((f) => f.type === "select")?.id ?? null;
  const start = dateFields(fields)[0]?.id ?? null;
  return { layout: "list", group, lanes: null, order: "manual", dir: 1, then: null, thenDir: 1, props: null, hideEmpty: false, collapsed: [], filters: [], closed: true, start, end: null };
}

const strings = (v: unknown, max = 100) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);

/** One filter as stored, or null when it doesn't fit the field (removed, retyped). */
function cleanRule(raw: unknown, fields: CollectionField[]): FilterRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const field = fields.find((f) => f.id === r.field);
  if (!field || !opsFor(field).includes(r.op as FilterOp)) return null;
  const op = r.op as FilterOp;
  if (op === "is" || op === "not") return strings(r.value).length ? { field: field.id, op, value: strings(r.value) } : null;
  if (op === "before" || op === "after") return typeof r.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.value) ? { field: field.id, op, value: r.value } : null;
  if (op === "lt" || op === "gt") return typeof r.value === "number" && Number.isFinite(r.value) ? { field: field.id, op, value: r.value } : null;
  // An empty text is kept while it's being typed; it matches every filled value.
  if (op === "contains") return typeof r.value === "string" ? { field: field.id, op, value: r.value.trim().slice(0, 100) } : null;
  return { field: field.id, op };
}

/** Anything (a saved view, localStorage, a request body) as a config valid for these fields. */
export function normalizeView(input: unknown, fields: CollectionField[]): ViewConfig {
  const base = defaultView(fields);
  if (!input || typeof input !== "object") return base;
  const v = input as Record<string, unknown>;
  const ids = new Set(fields.map((f) => f.id));
  const groupable = new Set(groupFields(fields).map((f) => f.id));
  const dates = new Set(dateFields(fields).map((f) => f.id));
  const group = v.group === null && v.layout === "list" ? null : typeof v.group === "string" && groupable.has(v.group) ? v.group : base.group;
  const lanes = typeof v.lanes === "string" && groupable.has(v.lanes) && v.lanes !== group ? v.lanes : null;
  const sortable = (o: unknown) => typeof o === "string" && ((ORDERS as readonly string[]).includes(o) || ids.has(o));
  const order = sortable(v.order) ? (v.order as string) : "manual";
  const start = typeof v.start === "string" && dates.has(v.start) ? v.start : base.start;
  const end = typeof v.end === "string" && dates.has(v.end) && v.end !== start ? v.end : null;
  // Older views kept filters as { fieldId: [picked] }.
  const rawFilters = Array.isArray(v.filters) ? v.filters : v.filters && typeof v.filters === "object" ? Object.entries(v.filters as Record<string, unknown>).map(([field, value]) => ({ field, op: "is", value })) : [];
  let layout: Layout = (LAYOUTS as readonly string[]).includes(v.layout as string) ? (v.layout as Layout) : base.layout;
  if (layout === "board" && !group) layout = "list";
  if ((layout === "timeline" || layout === "calendar") && !start) layout = "list";
  return {
    layout,
    group,
    lanes,
    order,
    dir: v.dir === -1 ? -1 : 1,
    then: sortable(v.then) && v.then !== order && v.then !== "manual" ? (v.then as string) : null,
    thenDir: v.thenDir === -1 ? -1 : 1,
    props: Array.isArray(v.props) ? strings(v.props).filter((id) => ids.has(id)) : null,
    hideEmpty: v.hideEmpty === true,
    collapsed: strings(v.collapsed),
    filters: rawFilters.map((r) => cleanRule(r, fields)).filter((r): r is FilterRule => !!r).slice(0, 20),
    closed: v.closed !== false,
    start,
    end,
  };
}

export const sameView = (a: ViewConfig, b: ViewConfig) => JSON.stringify(a) === JSON.stringify(b);

const empty = (v: FieldValue | undefined) => v === undefined || v === "" || (Array.isArray(v) && !v.length);

/** Does a record's value pass one filter? `today` is `YYYY-MM-DD` (for "overdue"). */
export function matchesRule(field: CollectionField, rule: FilterRule, v: FieldValue | undefined, today: string): boolean {
  switch (rule.op) {
    case "empty":
      return empty(v);
    case "filled":
      return !empty(v);
    case "checked":
      return v === true;
    case "unchecked":
      return v !== true;
    case "is":
    case "not": {
      const picked = (rule.value as string[]) ?? [];
      const has = empty(v) ? picked.includes(NONE) : Array.isArray(v) ? v.some((x) => picked.includes(x)) : picked.includes(String(v));
      return rule.op === "is" ? has : !has;
    }
    case "before":
      return !empty(v) && String(v) < String(rule.value);
    case "after":
      return !empty(v) && String(v) > String(rule.value);
    case "overdue":
      return !empty(v) && String(v) < today;
    case "lt":
      return !empty(v) && Number(v) < Number(rule.value);
    case "gt":
      return !empty(v) && Number(v) > Number(rule.value);
    case "contains":
      return !empty(v) && (Array.isArray(v) ? v.join(" ") : String(v)).toLowerCase().includes(String(rule.value).toLowerCase());
  }
}

/** Every filter must pass, and closed records only show when the view keeps them. */
export function matchesView(fields: CollectionField[], config: Pick<ViewConfig, "filters" | "closed">, values: RecordValues, today: string) {
  if (!config.closed && isClosed(fields, values)) return false;
  return config.filters.every((rule) => {
    const field = fields.find((f) => f.id === rule.field);
    return !field || matchesRule(field, rule, values[field.id], today);
  });
}

type Sortable = { title: string; values: RecordValues; position: number; createdAt: string; updatedAt: string };

/** Comparable form of a value; null = empty, always last. */
function sortValue(field: CollectionField | undefined, order: string, r: Sortable, names: Map<string, string>): string | number | null {
  if (order === "manual") return r.position;
  if (order === "updated") return r.updatedAt;
  if (order === "created") return r.createdAt;
  if (!field) return r.title.toLowerCase();
  const v = r.values[field.id];
  if (empty(v)) return null;
  if (field.type === "number") return Number(v);
  if (field.type === "checkbox") return v ? 1 : 0;
  if (field.type === "select") return field.options?.indexOf(String(v)) ?? 0;
  if (field.type === "multiselect") return field.options?.indexOf((v as string[])[0]!) ?? 0;
  if (field.type === "person") return (names.get(String(v)) ?? "").toLowerCase();
  return String(v).toLowerCase();
}

function compareOne(order: string, dir: 1 | -1, fields: CollectionField[], names: Map<string, string>) {
  const field = fields.find((f) => f.id === order);
  const sign = order === "updated" || order === "created" ? -dir : dir;
  return (a: Sortable, b: Sortable) => {
    const x = sortValue(field, order, a, names);
    const y = sortValue(field, order, b, names);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  };
}

/** Record order for a view; "updated" and "created" read newest first unless reversed; `then` breaks ties. */
export function compareRecords(order: string, dir: 1 | -1, fields: CollectionField[], people: { id: string; name: string }[] = [], then?: { order: string | null; dir: 1 | -1 }) {
  const names = new Map(people.map((p) => [p.id, p.name]));
  const first = compareOne(order, dir, fields, names);
  const second = then?.order ? compareOne(then.order, then.dir, fields, names) : null;
  return (a: Sortable, b: Sortable) => first(a, b) || (second ? second(a, b) : 0);
}
