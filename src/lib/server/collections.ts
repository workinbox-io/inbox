/**
 * Collections (custom modules): lists with fields a company defines itself, shared like notes (lib/notes/access.ts):
 * private to the creator, chosen people (collection_access, view or edit) or the whole team. View reads records, edit
 * changes them, manage (the creator; owners and admins for team collections) changes fields, sharing and deletes.
 * Owners and admins create collections. Pure rules in lib/collections/fields.ts.
 */
import { env } from "cloudflare:workers";
import { notify } from "./notifications";
import { getTableColumns } from "drizzle-orm";
import { and, asc, chatChannels, chatMessages, collectionAccess, collectionCommentReactions, collectionComments, collectionRecordLinks, collectionRecords, collectionRelations, collectionSubscriptions, collections, count, db, desc, eq, inArray, isNotNull, isNull, lt, mailMessages, mailThreads, member, notes, or, sql, type SQL } from "@/db";
import { MAX_DESCRIPTION, mentionedPeople } from "@/lib/collections/description";
import { parseLink, type LinkKind } from "@/lib/collections/links";
import { docToText } from "@/lib/mail/doc-render";
import { isValue } from "@/lib/notes/plate";
import { mentionedIds, plainChat } from "@/lib/chat/format";
import { sanitizeRefs } from "@/lib/mentions";
import {
  cleanValues,
  COLLECTION_TEMPLATES,
  defaultValues,
  isClosed,
  statusFieldOf,
  statusKind,
  commentAudience,
  CollectionError,
  findField,
  mergeValues,
  normalizeFields,
  type CollectionField,
  type FieldInput,
  type FieldValue,
  type RecordValues,
  type TemplateId,
} from "@/lib/collections/fields";
import { CREATED, diffRecord } from "@/lib/collections/activity";
import { NONE } from "@/lib/collections/board";
import { settingsSchema, type CollectionSettings, type SettingsInput } from "@/lib/collections/settings";
import { normalizeView, type FilterRule } from "@/lib/collections/view-config";
import { isOrgAttachmentUrl } from "@/lib/uploads";
import { parseId, PREFIX, prefixFrom } from "@/lib/collections/ids";
import { atLeast, canManageNote, noteRole, type NoteRole, type NoteSharing } from "@/lib/notes/access";
import type { RecordList } from "@/lib/validation-collections";
import { HttpError } from "./api";
import { githubState } from "./github-links";
import { publish } from "./chat/sync";
import { logActivity } from "./collection-activity";
import { queueAutomations } from "./collection-automations";
import { visibleWhere } from "./chat/access";
import { viewerMailboxes } from "./mail/access";
import { visibleNotes } from "./notes/access";
import { notePeople } from "./notes/notes";
import { canManage, type OrgRole } from "./roles";

/** A person through the app or MCP, or an API key (no user: team collections only). */
export type CollectionViewer = { orgId: string; userId: string | null; role: OrgRole };
type Role = "view" | "edit";

export type Collection = {
  id: string;
  name: string;
  /** Record IDs' prefix ("TSK"), stored or made from the name. */
  prefix: string;
  /** lib/collections/appearance.ts; empty = the default dot. */
  icon: string;
  color: string;
  fields: CollectionField[];
  count: number;
  updatedAt: string;
  sharing: NoteSharing;
  teamRole: Role;
  ownerId: string | null;
  /** collection_access, for the share dialog. */
  people: { userId: string; role: Role }[];
  /** The viewer's role. */
  role: NoteRole;
  /** May change fields, sharing and delete. */
  canManage: boolean;
  /** Cycles, triage, SLA, record templates. */
  settings: CollectionSettings;
};

export type CollectionRecord = {
  id: string;
  collectionId: string;
  title: string;
  values: RecordValues;
  position: number;
  /** "TSK-12"'s 12. */
  number: number;
  /** The rich-text description (a Plate document); left out of lists (undefined), null when empty. */
  description?: unknown[] | null;
  /** Kinds of the record's links, for the card's icons; only in lists. */
  linkKinds?: LinkKind[];
  /** GitHub pull requests' and issues' states (open, draft, merged, closed); only in lists. */
  linkStates?: string[];
  /** Records that block this one (`blocks` relations); only in lists. */
  blockedBy?: string[];
  parentId: string | null;
  /** Waiting in Triage. */
  triage: boolean;
  cycle: number | null;
  /** In the trash since. */
  deletedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** shortcut: records per collection aren't capped; add a limit in config/plans.ts if D1 size becomes a concern. */
const MAX_COLLECTIONS = 200;

const rules = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof CollectionError) throw new HttpError(422, e.message);
    throw e;
  }
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

type RecordRow = Omit<typeof collectionRecords.$inferSelect, "description"> & { description?: unknown[] | null };
/** Every column but the description (lists don't carry it). */
const { description: _description, ...listColumns } = getTableColumns(collectionRecords);

const toRecord = (r: RecordRow): CollectionRecord => ({
  id: r.id,
  collectionId: r.collectionId,
  title: r.title,
  values: r.values,
  position: r.position,
  number: r.number,
  parentId: r.parentId,
  triage: r.triage,
  cycle: r.cycle,
  deletedAt: r.deletedAt?.toISOString() ?? null,
  createdBy: r.createdBy,
  ...("description" in r ? { description: (r as { description: unknown[] | null }).description ?? null } : {}),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

type Row = { id: string; name: string; prefix: string; icon: string; color: string; fields: CollectionField[]; settings: CollectionSettings; updatedAt: Date; sharing: NoteSharing; teamRole: Role; createdBy: string | null; count: number };

/** The viewer's view of a row, or null when they may not open it. */
function shape(row: Row, access: { collectionId: string; userId: string; role: Role }[], v: CollectionViewer): Collection | null {
  const facts = { ownerId: row.createdBy, sharing: row.sharing, teamRole: row.teamRole };
  const viewer = { userId: v.userId ?? "", manager: canManage(v.role) };
  const people = access.filter((a) => a.collectionId === row.id).map(({ userId, role }) => ({ userId, role }));
  const role = noteRole(facts, viewer, people.find((p) => p.userId === v.userId)?.role);
  if (!role) return null;
  return {
    id: row.id, name: row.name, prefix: row.prefix || prefixFrom(row.name), icon: row.icon, color: row.color, fields: row.fields, count: row.count, updatedAt: row.updatedAt.toISOString(),
    sharing: row.sharing, teamRole: row.teamRole, ownerId: row.createdBy, people, role,
    canManage: canManageNote(facts, viewer, role),
    settings: row.settings ?? {},
  };
}

const rowColumns = {
  id: collections.id, name: collections.name, prefix: collections.prefix, icon: collections.icon, color: collections.color, fields: collections.fields, settings: collections.settings, updatedAt: collections.updatedAt,
  sharing: collections.sharing, teamRole: collections.teamRole, createdBy: collections.createdBy, count: count(collectionRecords.id),
};

/** Records counted: not in the trash, not waiting in triage. */
const liveJoin = and(eq(collectionRecords.collectionId, collections.id), isNull(collectionRecords.deletedAt), eq(collectionRecords.triage, false));

/**
 * A collection as the system sees it (crons acting for its creator): every role, no viewer check. Never hand it to a
 * person's request.
 */
export async function systemCollection(orgId: string, id: string): Promise<Collection | null> {
  const [row] = await db.select(rowColumns).from(collections).leftJoin(collectionRecords, liveJoin).where(and(eq(collections.orgId, orgId), eq(collections.id, id))).groupBy(collections.id);
  if (!row) return null;
  const access = await accessFor([id]);
  return {
    id: row.id, name: row.name, prefix: row.prefix || prefixFrom(row.name), icon: row.icon, color: row.color, fields: row.fields, count: row.count, updatedAt: row.updatedAt.toISOString(),
    sharing: row.sharing, teamRole: row.teamRole, ownerId: row.createdBy, people: access.map(({ userId, role }) => ({ userId, role })), role: "edit", canManage: true, settings: row.settings ?? {},
  };
}

const accessFor = (ids: string[]) =>
  ids.length ? db.select().from(collectionAccess).where(inArray(collectionAccess.collectionId, ids.slice(0, 90))) : Promise.resolve([]);

/** The collections the viewer may open, by name. */
export async function listCollections(v: CollectionViewer): Promise<Collection[]> {
  const rows = await db
    .select(rowColumns)
    .from(collections)
    .leftJoin(collectionRecords, liveJoin)
    .where(eq(collections.orgId, v.orgId))
    .groupBy(collections.id)
    .orderBy(asc(collections.name));
  // Access rows only matter for collections shared with chosen people.
  const shared = rows.filter((r) => r.sharing === "people").map((r) => r.id);
  const access = (await Promise.all(Array.from({ length: Math.ceil(shared.length / 90) }, (_, i) => accessFor(shared.slice(i * 90, i * 90 + 90))))).flat();
  return rows.map((r) => shape(r, access, v)).filter((c): c is Collection => c !== null);
}

/** One collection the viewer may open (404 otherwise), checked for `need`. */
export async function getCollection(v: CollectionViewer, id: string, need: "view" | "edit" | "manage" = "view"): Promise<Collection> {
  const [row] = await db
    .select(rowColumns)
    .from(collections)
    .leftJoin(collectionRecords, liveJoin)
    .where(and(eq(collections.orgId, v.orgId), eq(collections.id, id)))
    .groupBy(collections.id);
  const c = row ? shape(row, await accessFor([id]), v) : null;
  if (!c) throw new HttpError(404, "Collection not found");
  if (need === "edit" && !atLeast(c.role, "edit")) throw new HttpError(403, "You can only view this collection");
  if (need === "manage" && !c.canManage) throw new HttpError(403, "Only the collection's owner can change it");
  return c;
}

/** By id, or by name (any case) for AI apps; only collections the viewer may open. */
export async function findCollection(v: CollectionViewer, ref: string, need: "view" | "edit" | "manage" = "view"): Promise<Collection> {
  const all = await listCollections(v);
  const lower = ref.trim().toLowerCase();
  const found = all.find((c) => c.id === ref) ?? all.find((c) => c.name.toLowerCase() === lower);
  if (!found) throw new HttpError(404, `No collection "${ref}". Collections: ${all.map((c) => c.name).join(", ") || "none yet"}`);
  return getCollection(v, found.id, need);
}

/** Owners and admins (checked by the route and the MCP tool); the creator owns it, the team edits it by default. */
export async function createCollection(v: CollectionViewer, input: { name?: string; template?: TemplateId; fields?: FieldInput[]; icon?: string; color?: string }) {
  const [{ n }] = (await db.select({ n: count() }).from(collections).where(eq(collections.orgId, v.orgId))) as [{ n: number }];
  if (n >= MAX_COLLECTIONS) throw new HttpError(422, `Up to ${MAX_COLLECTIONS} collections`);
  const template = input.template ? COLLECTION_TEMPLATES[input.template] : null;
  const fields = rules(() => normalizeFields(input.fields ?? template?.fields ?? []));
  const [row] = await db
    .insert(collections)
    .values({ orgId: v.orgId, name: input.name ?? template!.name, fields, icon: input.icon ?? "", color: input.color ?? "", createdBy: v.userId })
    .returning({ id: collections.id });
  return getCollection(v, row!.id);
}

export async function updateCollection(v: CollectionViewer, id: string, input: { name?: string; prefix?: string; icon?: string; color?: string; fields?: FieldInput[]; settings?: Partial<SettingsInput> }) {
  const c = await getCollection(v, id, "manage");
  const set: Partial<typeof collections.$inferInsert> = { updatedAt: new Date() };
  if (input.name) set.name = input.name;
  // IDs keep their prefix when the collection is renamed: the one made from the old name is stored first.
  if (input.name && input.name !== c.name) set.prefix = c.prefix;
  if (input.prefix !== undefined) {
    if (!PREFIX.test(input.prefix)) throw new HttpError(422, "The ID prefix is 1–5 letters or digits, starting with a letter");
    set.prefix = input.prefix;
  }
  if (input.icon !== undefined) set.icon = input.icon;
  if (input.color !== undefined) set.color = input.color;
  // Values of removed fields stay in the rows until the record is next saved (mergeValues drops them); reads ignore them.
  if (input.fields) set.fields = rules(() => normalizeFields(input.fields!));
  if (input.settings) set.settings = await cleanSettings(v.orgId, set.fields ?? c.fields, c.settings, input.settings);
  await db.update(collections).set(set).where(and(eq(collections.orgId, v.orgId), eq(collections.id, id)));
  return getCollection(v, id);
}

/** Settings merged key by key; templates' values checked like a record's, the SLA's field must be a choice field. */
async function cleanSettings(orgId: string, fields: CollectionField[], current: CollectionSettings, patch: Partial<SettingsInput>): Promise<CollectionSettings> {
  const parsed = settingsSchema.partial().safeParse(patch);
  if (!parsed.success) throw new HttpError(422, parsed.error.issues[0]?.message ?? "Invalid settings");
  const next: CollectionSettings = { ...current };
  const p = parsed.data;
  if (p.cycles !== undefined) next.cycles = p.cycles;
  if (p.triage !== undefined) next.triage = p.triage;
  if (p.sla !== undefined) {
    const field = p.sla ? fields.find((f) => f.id === p.sla!.field && f.type === "select") : undefined;
    if (p.sla && !field) throw new HttpError(422, "The SLA follows a choice field");
    next.sla = p.sla && field ? { field: field.id, hours: Object.fromEntries(Object.entries(p.sla.hours).filter(([o]) => field.options?.includes(o))) } : null;
  }
  if (p.templates !== undefined) {
    next.templates = [];
    for (const t of p.templates) {
      const values = mergeValues(fields, {}, await checkValues(orgId, fields, t.values));
      const desc = t.description ? cleanDescription(t.description) : null;
      next.templates.push({ id: t.id ?? crypto.randomUUID(), name: t.name, title: t.title, values, description: desc?.description ?? null });
    }
  }
  return next;
}

/** Who may open it: private, chosen people (view or edit) or the whole team. */
export async function shareCollection(v: CollectionViewer, id: string, input: { sharing: NoteSharing; teamRole: Role; people: { userId: string; role: Role }[] }) {
  const c = await getCollection(v, id, "manage");
  if (!v.userId && input.sharing !== "team") throw new HttpError(422, "API keys can only keep collections shared with the team");
  const people = input.sharing === "people" ? input.people.filter((p) => p.userId !== c.ownerId) : [];
  if (people.length) {
    const ids = people.map((p) => p.userId);
    const members = await db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, v.orgId), inArray(member.userId, ids)));
    if (members.length !== new Set(ids).size) throw new HttpError(422, "Share with members of this organization only");
  }
  await db.batch([
    db.update(collections).set({ sharing: input.sharing, teamRole: input.teamRole, updatedAt: new Date() }).where(eq(collections.id, id)),
    db.delete(collectionAccess).where(eq(collectionAccess.collectionId, id)),
    ...(people.length ? [db.insert(collectionAccess).values(people.map((p) => ({ collectionId: id, userId: p.userId, role: p.role })))] : []),
  ]);
  const before = new Set(c.people.map((p) => p.userId));
  await notify(v.orgId, people.filter((p) => !before.has(p.userId)).map((p) => p.userId), { kind: "share", app: "collections", actorId: v.userId, title: c.name, body: "a collection", href: `/app/collections/${id}`, groupKey: `collection:${id}` });
  // A manager who made it private for its owner may no longer open it.
  return getCollection(v, id).catch(() => ({ ...c, sharing: input.sharing, teamRole: input.teamRole, people }));
}

/** Deletes the collection and all its records. */
export async function deleteCollection(v: CollectionViewer, id: string) {
  const c = await getCollection(v, id, "manage");
  await db.delete(collections).where(and(eq(collections.orgId, v.orgId), eq(collections.id, id)));
  return c;
}

/** One view filter as SQL over the JSON values (lib/collections/view-config.ts `matchesRule`, the browser's twin). */
function ruleSql(field: CollectionField, rule: FilterRule): SQL {
  // Field ids are [a-z0-9_] (normalizeFields), so the JSON path is safe; it is still passed as a parameter.
  const path = `$."${field.id}"`;
  const val = sql`json_extract(${collectionRecords.values}, ${path})`;
  const blank = sql`(${val} IS NULL OR ${val} = '' OR ${val} = '[]')`;
  const list = (xs: (string | number)[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
  switch (rule.op) {
    case "empty":
      return blank;
    case "filled":
      return sql`NOT ${blank}`;
    case "checked":
      return sql`coalesce(${val}, 0) = 1`;
    case "unchecked":
      return sql`coalesce(${val}, 0) = 0`;
    case "is":
    case "not": {
      const picked = (rule.value as string[]).slice(0, 50);
      const vals = picked.filter((x) => x !== NONE);
      const has = vals.length
        ? field.type === "multiselect"
          ? sql`EXISTS (SELECT 1 FROM json_each(${collectionRecords.values}, ${path}) WHERE value IN (${list(vals)}))`
          : sql`coalesce(${val} IN (${list(vals)}), 0)`
        : sql`0`;
      const cond = picked.includes(NONE) ? sql`(${has} OR ${blank})` : has;
      return rule.op === "is" ? cond : sql`NOT ${cond}`;
    }
    case "before":
      return sql`${val} < ${String(rule.value)}`;
    case "after":
      return sql`${val} > ${String(rule.value)}`;
    case "overdue":
      return sql`${val} < ${new Date().toISOString().slice(0, 10)}`;
    case "lt":
      return sql`${val} < ${Number(rule.value)}`;
    case "gt":
      return sql`${val} > ${Number(rule.value)}`;
    case "contains":
      // D1 caps LIKE patterns at 50 characters.
      return sql`${val} LIKE ${`%${escapeLike(String(rule.value).slice(0, 40))}%`} ESCAPE '\\'`;
  }
}

/** Done and cancelled records left out (the view's "closed" off). */
function openOnly(fields: CollectionField[]) {
  const f = statusFieldOf(fields);
  const closed = (f?.options ?? []).filter((o) => ["done", "canceled"].includes(statusKind(f!, o) ?? ""));
  if (!f || !closed.length) return null;
  return sql`coalesce(json_extract(${collectionRecords.values}, ${`$."${f.id}"`}) NOT IN (${sql.join(closed.map((o) => sql`${o}`), sql`, `)}), 1)`;
}

export async function listRecords(orgId: string, collection: Collection, q: RecordList) {
  const where = [eq(collectionRecords.orgId, orgId), eq(collectionRecords.collectionId, collection.id)];
  where.push(q.scope === "trash" ? isNotNull(collectionRecords.deletedAt) : isNull(collectionRecords.deletedAt));
  if (q.scope !== "trash") where.push(eq(collectionRecords.triage, q.scope === "triage"));
  if (q.parent) where.push(eq(collectionRecords.parentId, q.parent));
  if (q.cycle) where.push(eq(collectionRecords.cycle, q.cycle));
  if (q.ids) where.push(q.ids.length ? inArray(collectionRecords.id, q.ids) : sql`0`);
  if (q.q) {
    const pattern = `%${escapeLike(q.q)}%`;
    const id = parseId(q.q);
    where.push(or(sql`${collectionRecords.title} LIKE ${pattern} ESCAPE '\\'`, sql`${collectionRecords.values} LIKE ${pattern} ESCAPE '\\'`, sql`${collectionRecords.descriptionText} LIKE ${pattern} ESCAPE '\\'`, ...(id?.prefix === collection.prefix ? [eq(collectionRecords.number, id.number)] : []))!);
  }
  for (const [key, raw] of Object.entries(q.filter ?? {})) {
    const field = findField(collection.fields, key);
    if (!field) throw new HttpError(422, `No field "${key}"`);
    const value = rules(() => cleanValues([field], { [field.id]: raw })[field.id]);
    const path = `$."${field.id}"`;
    where.push(
      value === null ? sql`json_extract(${collectionRecords.values}, ${path}) IS NULL`
      : Array.isArray(value) ? sql`EXISTS (SELECT 1 FROM json_each(${collectionRecords.values}, ${path}) WHERE value IN (${sql.join(value.map((x) => sql`${x}`), sql`, `)}))`
      : sql`json_extract(${collectionRecords.values}, ${path}) = ${typeof value === "boolean" ? Number(value) : value}`,
    );
  }
  if (q.view) {
    const view = normalizeView({ filters: q.view.filters, closed: q.view.closed }, collection.fields);
    for (const rule of view.filters) where.push(ruleSql(collection.fields.find((f) => f.id === rule.field)!, rule));
    const open = !view.closed ? openOnly(collection.fields) : null;
    if (open) where.push(open);
  }
  const inCollection = and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.collectionId, collection.id));
  const [rows, links, blocks] = await Promise.all([
    db
      .select(listColumns)
      .from(collectionRecords)
      .where(and(...where))
      .orderBy(q.scope === "trash" ? desc(collectionRecords.deletedAt) : desc(collectionRecords.updatedAt))
      .limit(q.limit + 1)
      .offset(q.offset),
    db
      .select({ recordId: collectionRecordLinks.recordId, kind: collectionRecordLinks.kind, state: collectionRecordLinks.state })
      .from(collectionRecordLinks)
      .innerJoin(collectionRecords, eq(collectionRecords.id, collectionRecordLinks.recordId))
      .where(and(eq(collectionRecordLinks.orgId, orgId), eq(collectionRecords.collectionId, collection.id))),
    db
      .select({ to: collectionRelations.toId, from: collectionRelations.fromId })
      .from(collectionRelations)
      .innerJoin(collectionRecords, eq(collectionRecords.id, collectionRelations.toId))
      .where(and(inCollection, eq(collectionRelations.kind, "blocks"))),
  ]);
  const kinds = new Map<string, LinkKind[]>();
  const states = new Map<string, string[]>();
  for (const l of links) {
    kinds.set(l.recordId, [...(kinds.get(l.recordId) ?? []), l.kind]);
    if (typeof l.state?.state === "string") states.set(l.recordId, [...(states.get(l.recordId) ?? []), l.state.state]);
  }
  const blockers = new Map<string, string[]>();
  for (const b of blocks) blockers.set(b.to, [...(blockers.get(b.to) ?? []), b.from]);
  return { records: rows.slice(0, q.limit).map((r) => ({ ...toRecord(r), linkKinds: kinds.get(r.id) ?? [], linkStates: states.get(r.id) ?? [], blockedBy: blockers.get(r.id) ?? [] })), hasMore: rows.length > q.limit };
}

/** A record of the collection; one in the trash only with `deleted`. */
export async function getRecord(orgId: string, collectionId: string, id: string, opts: { deleted?: boolean } = {}) {
  const [row] = await db
    .select()
    .from(collectionRecords)
    .where(and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.collectionId, collectionId), eq(collectionRecords.id, id), opts.deleted ? undefined : isNull(collectionRecords.deletedAt)));
  if (!row) throw new HttpError(404, "Record not found");
  return toRecord(row);
}

type Member = { id: string; name: string; email: string };

/** Person values (an id, an e-mail, or a name for AI apps and spreadsheets) become the id of someone in the org. */
function resolvePeople(fields: CollectionField[], values: Record<string, FieldValue | null>, members: Member[]) {
  for (const f of fields) {
    if (f.type !== "person" || typeof values[f.id] !== "string") continue;
    const v = String(values[f.id]).toLowerCase();
    const person = members.find((m) => m.id === values[f.id]) ?? members.find((m) => m.email.toLowerCase() === v) ?? members.find((m) => m.name.toLowerCase() === v);
    if (!person) throw new HttpError(422, `"${f.name}": no one in the organization matches ${values[f.id]}`);
    values[f.id] = person.id;
  }
  return values;
}

async function checkValues(orgId: string, fields: CollectionField[], input: Record<string, unknown>) {
  const values = rules(() => cleanValues(fields, input));
  const needsPeople = fields.some((f) => f.type === "person" && typeof values[f.id] === "string");
  resolvePeople(fields, values, needsPeople ? await notePeople(orgId) : []);
  for (const f of fields) {
    const v = values[f.id];
    if (typeof v !== "string") continue;
    if (f.type === "file" && !isOrgAttachmentUrl(v, orgId)) throw new HttpError(422, `"${f.name}": upload the file first`);
    if (f.type === "relation") values[f.id] = await resolveRelation(orgId, f, v);
  }
  return values;
}

/** A relation value: a record id, or its "PRJ-3", in the field's collection (not in the trash). */
async function resolveRelation(orgId: string, f: CollectionField, ref: string) {
  const [target] = await db.select({ name: collections.name, prefix: collections.prefix }).from(collections).where(and(eq(collections.orgId, orgId), eq(collections.id, f.target ?? "")));
  if (!target) throw new HttpError(422, `"${f.name}": its collection is gone`);
  const key = parseId(ref);
  const prefix = target.prefix || prefixFrom(target.name);
  const [row] = await db
    .select({ id: collectionRecords.id })
    .from(collectionRecords)
    .where(and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.collectionId, f.target!), isNull(collectionRecords.deletedAt), key?.prefix === prefix ? eq(collectionRecords.number, key.number) : eq(collectionRecords.id, ref)));
  if (!row) throw new HttpError(422, `"${f.name}": no record ${ref} in ${target.name}`);
  return row.id;
}

/** A parent in the same collection, not the record itself or one of its own sub-records. */
async function checkParent(orgId: string, collectionId: string, id: string | null, parentId: string) {
  let at: string | null = parentId;
  for (let hops = 0; at; hops++) {
    if (at === id || hops > 20) throw new HttpError(422, "A record can't be inside its own sub-record");
    const [row] = await db.select({ parentId: collectionRecords.parentId }).from(collectionRecords).where(and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.collectionId, collectionId), eq(collectionRecords.id, at), isNull(collectionRecords.deletedAt)));
    if (!row) throw new HttpError(422, "The parent record isn't in this collection");
    at = row.parentId;
  }
}

/**
 * Spreadsheet rows (IMPORT_CHUNK per call). Owners and admins (`addChoices`) get unknown choice values added to their
 * select fields first. A bad row is reported by its index and the rest still go in.
 */
export async function importRecords(orgId: string, collection: Collection, userId: string | null, rows: { title: string; values: Record<string, string> }[], opts: { addChoices: boolean }) {
  let fields = collection.fields;
  if (opts.addChoices) {
    let changed = false;
    const next = fields.map((f) => {
      if (f.type !== "select") return f;
      const known = new Set((f.options ?? []).map((o) => o.toLowerCase()));
      const add = [...new Set(rows.map((r) => r.values[f.id]?.trim()).filter((v): v is string => !!v && !known.has(v.toLowerCase())))];
      if (!add.length) return f;
      changed = true;
      return { ...f, options: [...(f.options ?? []), ...add].slice(0, 50) };
    });
    if (changed) {
      fields = rules(() => normalizeFields(next));
      await db.update(collections).set({ fields, updatedAt: new Date() }).where(and(eq(collections.orgId, orgId), eq(collections.id, collection.id)));
    }
  }
  const members = fields.some((f) => f.type === "person") ? await notePeople(orgId) : [];
  const failed: { row: number; error: string }[] = [];
  const good: { title: string; values: RecordValues }[] = [];
  for (const [i, r] of rows.entries()) {
    try {
      good.push({ title: r.title, values: mergeValues(fields, {}, resolvePeople(fields, rules(() => cleanValues(fields, r.values)), members)) });
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      failed.push({ row: i, error: e.message });
    }
  }
  const first = good.length ? await reserveNumbers(orgId, collection.id, good.length) : 0;
  // In file order: the first row gets the lowest number and sits on top of the board.
  const top = -Date.now();
  const batch = good.map((r, i) => db.insert(collectionRecords).values({ orgId, collectionId: collection.id, title: r.title, values: r.values, number: first + i, position: top - good.length + i, createdBy: userId }));
  if (batch.length) await db.batch(batch as [(typeof batch)[number], ...typeof batch]);
  if (batch.length) await publishRecords(orgId, collection, [], userId, { reload: true });
  return { created: batch.length, failed };
}

/** Every record, newest change first, with the org's people for the CSV's e-mails. */
export async function exportRecords(orgId: string, collection: Collection) {
  const rows = await db
    .select({ title: collectionRecords.title, values: collectionRecords.values })
    .from(collectionRecords)
    .where(and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.collectionId, collection.id), isNull(collectionRecords.deletedAt)))
    .orderBy(desc(collectionRecords.updatedAt));
  return { records: rows, people: await notePeople(orgId) };
}

/**
 * Tells open boards that records changed: everyone in the org for team collections, else the creator and the people
 * it's shared with (owners and admins stay out of private ones, like reading). Ids only; browsers refetch. Never throws.
 */
async function publishRecords(orgId: string, c: Collection, recordIds: string[], by: string | null, opts: { deleted?: boolean; reload?: boolean } = {}) {
  const to = c.sharing === "team" ? undefined : [...new Set([c.ownerId, ...c.people.map((p) => p.userId)].filter((id): id is string => !!id))];
  await publish(orgId, { type: "collection", collectionId: c.id, recordIds, by, ...opts }, to);
}

/** Reserves `n` record numbers in one statement (D1 has no transactions); returns the first. */
async function reserveNumbers(orgId: string, collectionId: string, n: number) {
  const [row] = await db
    .update(collections)
    .set({ nextNumber: sql`${collections.nextNumber} + ${n}` })
    .where(and(eq(collections.orgId, orgId), eq(collections.id, collectionId)))
    .returning({ next: collections.nextNumber });
  if (!row) throw new HttpError(404, "Not found");
  return row.next - n;
}

/** A record by its id or its "TSK-12" (AI apps, mentions). */
export async function findRecord(orgId: string, collection: Collection, ref: string) {
  const id = parseId(ref);
  if (!id || id.prefix !== collection.prefix) return getRecord(orgId, collection.id, ref);
  const [row] = await db
    .select()
    .from(collectionRecords)
    .where(and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.collectionId, collection.id), eq(collectionRecords.number, id.number), isNull(collectionRecords.deletedAt)));
  if (!row) throw new HttpError(404, "Record not found");
  return toRecord(row);
}

/** People newly put in a person field of a record hear about it (not themselves, not on imports). */
async function notifyAssigned(orgId: string, collection: Collection, record: { id: string; title: string }, before: RecordValues, after: RecordValues, actorId: string | null) {
  for (const f of collection.fields.filter((x) => x.type === "person")) {
    const who = after[f.id];
    if (typeof who === "string" && who !== before[f.id])
      await notify(orgId, [who], { kind: "assign", app: "collections", actorId, title: record.title, body: `${f.name} in ${collection.name}`, href: `/app/open/record/${record.id}`, groupKey: `record:${record.id}` });
  }
}

/**
 * `triage`: the record waits in Triage (a viewer's request, an API key or an AI app while the collection has triage on);
 * the collection's owner hears about it, automations and assignment notices wait until it's accepted.
 */
export async function createRecord(orgId: string, collection: Collection, userId: string | null, input: { title: string; values: Record<string, unknown>; description?: unknown; parentId?: string | null; cycle?: number | null }, opts: { triage?: boolean } = {}) {
  const given = { ...defaultValues(collection.fields, input.values, { userId, today: new Date().toISOString().slice(0, 10) }), ...input.values };
  const values = mergeValues(collection.fields, {}, await checkValues(orgId, collection.fields, given));
  const desc = input.description !== undefined ? cleanDescription(input.description) : {};
  if (input.parentId) await checkParent(orgId, collection.id, null, input.parentId);
  const triage = !!opts.triage && !!collection.settings.triage;
  const number = await reserveNumbers(orgId, collection.id, 1);
  const [row] = await db
    .insert(collectionRecords)
    .values({ orgId, collectionId: collection.id, title: input.title, values, number, ...desc, parentId: input.parentId ?? null, cycle: input.cycle ?? null, triage, createdBy: userId })
    .returning();
  await logActivity(orgId, collection.id, row!.id, userId, [{ field: CREATED, from: null, to: null }]);
  await publishRecords(orgId, collection, [row!.id], userId);
  if (triage) {
    const to = [collection.ownerId].filter((id): id is string => !!id && id !== userId);
    await notify(orgId, to, { kind: "update", app: "collections", actorId: userId, title: input.title, body: `Triage · ${collection.name}`, href: `/app/open/record/${row!.id}`, groupKey: `triage:${collection.id}` });
  } else {
    await queueAutomations(orgId, collection.id, row!.id, null, values);
    await notifyAssigned(orgId, collection, row!, {}, values, userId);
  }
  return toRecord(row!);
}

/** A description from the editor or an AI app: a Plate document under the size cap, or null to clear it. */
function cleanDescription(input: unknown) {
  if (input === null || (Array.isArray(input) && !input.length)) return { description: null, descriptionText: "" };
  if (!isValue(input)) throw new HttpError(422, "The description isn't a document");
  if (JSON.stringify(input).length > MAX_DESCRIPTION) throw new HttpError(422, "The description is too long");
  const text = docToText(input, env.PUBLIC_APP_URL);
  return { description: text.trim() ? input : null, descriptionText: text };
}

/** People newly @mentioned in a description who can open the collection hear about it. */
async function notifyDescriptionMentions(orgId: string, collection: Collection, record: { id: string; title: string }, before: unknown, after: unknown, actorId: string | null) {
  const old = new Set(mentionedPeople(before));
  const fresh = mentionedPeople(after).filter((id) => !old.has(id) && id !== actorId);
  if (!fresh.length) return;
  const people = new Set((await notePeople(orgId)).map((p) => p.id));
  const facts = { ownerId: collection.ownerId, sharing: collection.sharing, teamRole: collection.teamRole };
  const to = fresh.filter((id) => people.has(id) && !!noteRole(facts, { userId: id, manager: false }, collection.people.find((p) => p.userId === id)?.role));
  await notify(orgId, to, { kind: "mention", app: "collections", actorId, title: record.title, body: `${collection.name}`, href: `/app/open/record/${record.id}`, groupKey: `record:${record.id}` });
}

export async function updateRecord(orgId: string, collection: Collection, id: string, input: { title?: string; values?: Record<string, unknown>; position?: number; description?: unknown; parentId?: string | null; cycle?: number | null; triage?: false }, actorId: string | null = null) {
  const current = await getRecord(orgId, collection.id, id);
  const patch = input.values ? await checkValues(orgId, collection.fields, input.values) : {};
  const values = mergeValues(collection.fields, current.values, patch);
  const desc = input.description !== undefined ? cleanDescription(input.description) : null;
  if (input.parentId) await checkParent(orgId, collection.id, id, input.parentId);
  const [row] = await db
    .update(collectionRecords)
    .set({
      title: input.title ?? current.title, values, position: input.position ?? current.position, ...(desc ?? {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}), ...(input.cycle !== undefined ? { cycle: input.cycle } : {}),
      ...(input.triage === false ? { triage: false } : {}), updatedAt: new Date(),
    })
    .where(and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.id, id)))
    .returning();
  const described = desc && JSON.stringify(desc.description) !== JSON.stringify(current.description ?? null) ? [{ field: "description", from: null, to: null }] : [];
  const moved = [
    ...(input.parentId !== undefined && input.parentId !== current.parentId ? [{ field: "parent", from: current.parentId, to: input.parentId }] : []),
    ...(input.cycle !== undefined && input.cycle !== current.cycle ? [{ field: "cycle", from: current.cycle, to: input.cycle }] : []),
    ...(input.triage === false && current.triage ? [{ field: "accepted", from: null, to: null }] : []),
  ];
  await logActivity(orgId, collection.id, id, actorId, diffRecord(current, { title: row!.title, values }, [...described, ...moved]));
  if (desc) await notifyDescriptionMentions(orgId, collection, row!, current.description, desc.description, actorId);
  await publishRecords(orgId, collection, [id], actorId);
  // A record still in triage stays quiet; accepting it counts as it being added.
  if (!row!.triage) {
    await queueAutomations(orgId, collection.id, id, current.triage ? null : current.values, values);
    await notifyAssigned(orgId, collection, row!, current.triage ? {} : current.values, values, actorId);
    await notifyFollowers(orgId, collection, row!, current.values, values, actorId);
  }
  return toRecord(row!);
}

/** People following a record hear when its status changes (not who changed it). */
async function notifyFollowers(orgId: string, collection: Collection, record: { id: string; title: string }, before: RecordValues, after: RecordValues, actorId: string | null) {
  const f = statusFieldOf(collection.fields);
  if (!f || before[f.id] === after[f.id]) return;
  const rows = await db.select({ userId: collectionSubscriptions.userId }).from(collectionSubscriptions).where(and(eq(collectionSubscriptions.recordId, record.id), eq(collectionSubscriptions.on, true)));
  const to = rows.map((r) => r.userId).filter((id) => id !== actorId);
  await notify(orgId, to, { kind: "update", app: "collections", actorId, title: record.title, body: `${f.name}: ${String(after[f.id] ?? "—")}`, href: `/app/open/record/${record.id}`, groupKey: `record:${record.id}` });
}

/**
 * The board's selection: the same values (and/or a position each) for up to 200 records in one batch, or delete them.
 * Automations and assignment notices run per record, like single changes.
 */
export async function batchRecords(orgId: string, collection: Collection, actorId: string | null, input: { ids: string[]; values?: Record<string, unknown>; positions?: Record<string, number>; cycle?: number | null; delete?: boolean; restore?: boolean; purge?: boolean; accept?: boolean }) {
  // D1 binds at most 100 parameters per query: ids go in chunks.
  const chunks: string[][] = [];
  for (let i = 0; i < input.ids.length; i += 90) chunks.push(input.ids.slice(i, i + 90));
  const trashed = input.restore || input.purge;
  const where = (ids: string[]) => and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.collectionId, collection.id), inArray(collectionRecords.id, ids), trashed ? isNotNull(collectionRecords.deletedAt) : isNull(collectionRecords.deletedAt));
  const rows = (await Promise.all(chunks.map((ids) => db.select(listColumns).from(collectionRecords).where(where(ids))))).flat().map(toRecord);
  if (!rows.length) return { records: [] as CollectionRecord[], deleted: 0 };
  const run = async <T>(make: (ids: string[]) => T) => {
    const stmts = chunks.map(make);
    await db.batch(stmts as never);
  };
  if (input.delete || input.purge) {
    // To the trash (emptied after 30 days by `purgeTrash`), or for good from there.
    await run((ids) => (input.purge ? db.delete(collectionRecords).where(where(ids)) : db.update(collectionRecords).set({ deletedAt: new Date() }).where(where(ids))));
    await publishRecords(orgId, collection, rows.map((r) => r.id), actorId, { deleted: true });
    return { records: [] as CollectionRecord[], deleted: rows.length };
  }
  if (input.restore) {
    await run((ids) => db.update(collectionRecords).set({ deletedAt: null, updatedAt: new Date() }).where(where(ids)));
    await publishRecords(orgId, collection, rows.map((r) => r.id), actorId, { reload: true });
    return { records: rows.map((r) => ({ ...r, deletedAt: null })), deleted: 0 };
  }
  if (input.accept || input.cycle !== undefined) {
    const saved = (await Promise.all(rows.map((r) => updateRecord(orgId, collection, r.id, { ...(input.accept ? { triage: false as const } : {}), ...(input.cycle !== undefined ? { cycle: input.cycle } : {}) }, actorId)))).map((r) => r);
    return { records: saved, deleted: 0 };
  }
  const patch = input.values ? await checkValues(orgId, collection.fields, input.values) : {};
  const now = new Date();
  const next = rows.map((r) => ({ before: r, values: mergeValues(collection.fields, r.values, patch), position: input.positions?.[r.id] ?? r.position }));
  const updates = next.map((n) =>
    db.update(collectionRecords).set({ values: n.values, position: n.position, updatedAt: now }).where(and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.id, n.before.id))).returning(listColumns),
  );
  const saved = (await db.batch(updates as [(typeof updates)[number], ...typeof updates])).map((r) => toRecord(r[0]!));
  for (const n of next) {
    await logActivity(orgId, collection.id, n.before.id, actorId, diffRecord(n.before, { title: n.before.title, values: n.values }));
    await queueAutomations(orgId, collection.id, n.before.id, n.before.values, n.values);
    await notifyAssigned(orgId, collection, n.before, n.before.values, n.values, actorId);
  }
  await publishRecords(orgId, collection, saved.map((r) => r.id), actorId);
  return { records: saved, deleted: 0 };
}

export type RecordLink = { id: string; url: string; kind: LinkKind; title: string; state: Record<string, unknown> | null; createdBy: string | null; createdAt: string };

const toLink = (l: typeof collectionRecordLinks.$inferSelect): RecordLink => ({ id: l.id, url: l.url, kind: l.kind, title: l.title, state: l.state ?? null, createdBy: l.createdBy, createdAt: l.createdAt.toISOString() });

export async function listLinks(orgId: string, recordId: string) {
  const rows = await db.select().from(collectionRecordLinks).where(and(eq(collectionRecordLinks.orgId, orgId), eq(collectionRecordLinks.recordId, recordId))).orderBy(asc(collectionRecordLinks.createdAt));
  return rows.map(toLink);
}

/** A pasted URL on a record (kind and title read from it); the same URL twice is kept once. */
export async function addLink(orgId: string, collection: Collection, recordId: string, raw: string, userId: string | null) {
  await getRecord(orgId, collection.id, recordId);
  const link = parseLink(raw);
  if (!link) throw new HttpError(422, "Paste a web address (https://…)");
  const existing = await listLinks(orgId, recordId);
  const same = existing.find((l) => l.url === link.url);
  if (same) return same;
  if (existing.length >= 50) throw new HttpError(422, "Up to 50 links on a record");
  const state = link.kind === "github_pr" || link.kind === "github_issue" ? await githubState(link.url) : null;
  const [row] = await db.insert(collectionRecordLinks).values({ orgId, recordId, ...link, state, createdBy: userId }).returning();
  await logActivity(orgId, collection.id, recordId, userId, [{ field: "link", from: null, to: link.title }]);
  await publishRecords(orgId, collection, [recordId], userId);
  return toLink(row!);
}

export async function deleteLink(orgId: string, collection: Collection, recordId: string, linkId: string, userId: string | null) {
  await getRecord(orgId, collection.id, recordId);
  const [row] = await db
    .delete(collectionRecordLinks)
    .where(and(eq(collectionRecordLinks.orgId, orgId), eq(collectionRecordLinks.recordId, recordId), eq(collectionRecordLinks.id, linkId)))
    .returning();
  if (!row) throw new HttpError(404, "Link not found");
  await logActivity(orgId, collection.id, recordId, userId, [{ field: "link", from: row.title, to: null }]);
  await publishRecords(orgId, collection, [recordId], userId);
}

/** To the trash; `restore` brings it back within 30 days (batchRecords), `purgeTrash` empties it. */
export async function deleteRecord(orgId: string, collection: Collection, id: string, by: string | null = null) {
  const record = await getRecord(orgId, collection.id, id);
  await db.update(collectionRecords).set({ deletedAt: new Date() }).where(and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.id, id)));
  await publishRecords(orgId, collection, [id], by, { deleted: true });
  return record;
}

/** Daily: records in the trash for 30 days are deleted for good (comments, links and history go with them). */
export async function purgeTrash() {
  await db.delete(collectionRecords).where(and(isNotNull(collectionRecords.deletedAt), lt(collectionRecords.deletedAt, new Date(Date.now() - 30 * 86_400_000))));
}

export type RecordComment = { id: string; authorId: string | null; parentId: string | null; text: string; createdAt: string; editedAt: string | null; reactions: { emoji: string; userIds: string[] }[] };

const toComment = (c: typeof collectionComments.$inferSelect, reactions: { emoji: string; userIds: string[] }[] = []): RecordComment => ({
  id: c.id, authorId: c.authorId, parentId: c.parentId, text: c.text, createdAt: c.createdAt.toISOString(), editedAt: c.editedAt?.toISOString() ?? null, reactions,
});

/** Reactions of these comments, grouped by emoji in the order first used. */
async function reactionsOf(ids: string[]) {
  const out = new Map<string, { emoji: string; userIds: string[] }[]>();
  for (let i = 0; i < ids.length; i += 90) {
    const rows = await db.select().from(collectionCommentReactions).where(inArray(collectionCommentReactions.commentId, ids.slice(i, i + 90))).orderBy(asc(collectionCommentReactions.createdAt));
    for (const r of rows) {
      const list = out.get(r.commentId) ?? [];
      const g = list.find((x) => x.emoji === r.emoji);
      if (g) g.userIds.push(r.userId);
      else list.push({ emoji: r.emoji, userIds: [r.userId] });
      out.set(r.commentId, list);
    }
  }
  return out;
}

const MAX_COMMENT = 5000;

/** Oldest first, like a conversation. */
export async function listComments(orgId: string, collection: Collection, recordId: string) {
  await getRecord(orgId, collection.id, recordId);
  const rows = await db
    .select()
    .from(collectionComments)
    .where(and(eq(collectionComments.orgId, orgId), eq(collectionComments.recordId, recordId)))
    .orderBy(asc(collectionComments.createdAt))
    .limit(500);
  const reactions = await reactionsOf(rows.map((r) => r.id));
  return rows.map((r) => toComment(r, reactions.get(r.id)));
}

/** Adds the viewer's reaction, or takes it back when it's there. */
export async function toggleReaction(v: CollectionViewer & { userId: string }, recordId: string, commentId: string, emoji: string) {
  await ownComment(v, recordId, commentId);
  const key = and(eq(collectionCommentReactions.commentId, commentId), eq(collectionCommentReactions.userId, v.userId), eq(collectionCommentReactions.emoji, emoji));
  const [had] = await db.select({ e: collectionCommentReactions.emoji }).from(collectionCommentReactions).where(key);
  if (had) await db.delete(collectionCommentReactions).where(key);
  else await db.insert(collectionCommentReactions).values({ commentId, userId: v.userId, emoji });
  return (await reactionsOf([commentId])).get(commentId) ?? [];
}

/** Whether the viewer follows the record: true / false as they chose, null = by default (assigned, created, commented). */
export async function getFollow(recordId: string, userId: string) {
  const [row] = await db.select({ on: collectionSubscriptions.on }).from(collectionSubscriptions).where(and(eq(collectionSubscriptions.recordId, recordId), eq(collectionSubscriptions.userId, userId)));
  return row ? row.on : null;
}

export async function setFollow(orgId: string, collection: Collection, recordId: string, userId: string, on: boolean) {
  await getRecord(orgId, collection.id, recordId);
  await db.insert(collectionSubscriptions).values({ recordId, userId, on }).onConflictDoUpdate({ target: [collectionSubscriptions.recordId, collectionSubscriptions.userId], set: { on } });
  return on;
}

/** Anyone who can view the collection may comment; people @mentioned and the record's people hear about it. */
export async function addComment(v: CollectionViewer & { userId: string }, collection: Collection, recordId: string, input: string, parentId?: string) {
  const record = await getRecord(v.orgId, collection.id, recordId);
  const text = sanitizeRefs(input.trim().slice(0, MAX_COMMENT), env.PUBLIC_APP_URL);
  if (!text) throw new HttpError(422, "Write something first");
  // Replies go under the thread's first comment (one level, like Linear).
  const root = parentId ? await ownComment(v, recordId, parentId) : null;
  const [row] = await db.insert(collectionComments).values({ orgId: v.orgId, collectionId: collection.id, recordId, authorId: v.userId, parentId: root ? (root.parentId ?? root.id) : null, text }).returning();
  const [people, earlier, [creator], follows] = await Promise.all([
    notePeople(v.orgId),
    db.selectDistinct({ id: collectionComments.authorId }).from(collectionComments).where(eq(collectionComments.recordId, recordId)),
    db.select({ id: collectionRecords.createdBy }).from(collectionRecords).where(eq(collectionRecords.id, recordId)),
    db.select().from(collectionSubscriptions).where(eq(collectionSubscriptions.recordId, recordId)),
  ]);
  const members = new Map(people.map((p) => [p.id, p.name]));
  const facts = { ownerId: collection.ownerId, sharing: collection.sharing, teamRole: collection.teamRole };
  const canView = (id: string) => members.has(id) && !!noteRole(facts, { userId: id, manager: false }, collection.people.find((p) => p.userId === id)?.role);
  const to = commentAudience({
    mentioned: mentionedIds(text),
    assignees: collection.fields.filter((f) => f.type === "person").map((f) => record.values[f.id]).filter((x): x is string => typeof x === "string"),
    creator: creator?.id ?? null,
    commenters: earlier.flatMap((c) => (c.id ? [c.id] : [])),
    author: v.userId,
    canView,
    subscribed: follows.filter((f) => f.on).map((f) => f.userId),
    muted: follows.filter((f) => !f.on).map((f) => f.userId),
  });
  const base = { app: "collections" as const, actorId: v.userId, title: record.title, body: plainChat(text, (id) => members.get(id)), href: `/app/open/record/${recordId}`, groupKey: `record:${recordId}` };
  await notify(v.orgId, to.mention, { ...base, kind: "mention" });
  await notify(v.orgId, to.comment, { ...base, kind: "comment" });
  return toComment(row!);
}

async function ownComment(v: CollectionViewer, recordId: string, id: string) {
  const [row] = await db
    .select()
    .from(collectionComments)
    .where(and(eq(collectionComments.orgId, v.orgId), eq(collectionComments.recordId, recordId), eq(collectionComments.id, id)));
  if (!row) throw new HttpError(404, "Comment not found");
  return row;
}

export async function editComment(v: CollectionViewer, recordId: string, id: string, input: string) {
  const row = await ownComment(v, recordId, id);
  if (row.authorId !== v.userId) throw new HttpError(403, "You can only edit your own comments");
  const text = sanitizeRefs(input.trim().slice(0, MAX_COMMENT), env.PUBLIC_APP_URL);
  if (!text) throw new HttpError(422, "Write something first");
  const [saved] = await db.update(collectionComments).set({ text, editedAt: new Date() }).where(eq(collectionComments.id, id)).returning();
  return toComment(saved!, (await reactionsOf([id])).get(id));
}

/** The author, or an owner/admin. */
export async function deleteComment(v: CollectionViewer, recordId: string, id: string) {
  const row = await ownComment(v, recordId, id);
  if (row.authorId !== v.userId && !canManage(v.role)) throw new HttpError(403, "You can only delete your own comments");
  await db.delete(collectionComments).where(eq(collectionComments.id, id));
}

export type Backlink = { app: "chat" | "notes" | "mail"; title: string; href: string; at: string };

/**
 * Where the record was @mentioned: chat messages, notes and mail the viewer can open, newest first, 10 per app.
 * D1 caps LIKE patterns at 50 characters: keep each pattern short (a uuid is 36).
 * shortcut: LIKE scans the org's rows; swap for a refs table written on send/save if it gets slow.
 */
export async function recordBacklinks(v: CollectionViewer & { userId: string }, recordId: string): Promise<Backlink[]> {
  const id = escapeLike(recordId);
  const boxes = await viewerMailboxes(v);
  const channels = db.select({ id: chatChannels.id }).from(chatChannels).where(visibleWhere(v));
  const [chat, noteRows, mail] = await Promise.all([
    db
      .select({ id: chatMessages.id, channelId: chatMessages.channelId, text: chatMessages.text, at: chatMessages.createdAt })
      .from(chatMessages)
      .where(and(eq(chatMessages.orgId, v.orgId), isNull(chatMessages.deletedAt), inArray(chatMessages.channelId, channels), sql`${chatMessages.text} LIKE ${`%<@record:${id}|%`} ESCAPE '\\'`))
      .orderBy(desc(chatMessages.createdAt))
      .limit(10),
    db
      .select({ id: notes.id, title: notes.title, at: notes.updatedAt })
      .from(notes)
      .where(and(visibleNotes(v), isNull(notes.archivedAt), sql`${notes.content} LIKE ${`%"record:${id}"%`} ESCAPE '\\'`))
      .orderBy(desc(notes.updatedAt))
      .limit(10),
    boxes.length
      ? db
          .select({ threadId: mailMessages.threadId, subject: mailThreads.subject, at: mailMessages.createdAt })
          .from(mailMessages)
          .innerJoin(mailThreads, eq(mailThreads.id, mailMessages.threadId))
          .where(and(eq(mailMessages.orgId, v.orgId), inArray(mailMessages.mailboxId, boxes.map((b) => b.id).slice(0, 90)), sql`${mailMessages.text} LIKE ${`%/record/${id}%`} ESCAPE '\\'`))
          .orderBy(desc(mailMessages.createdAt))
          .limit(10)
      : [],
  ]);
  const people = new Map((await notePeople(v.orgId)).map((p) => [p.id, p.name]));
  return [
    ...chat.map((m) => ({ app: "chat" as const, title: plainChat(m.text, (u) => people.get(u)).slice(0, 140), href: `/app/chat/${m.channelId}?m=${m.id}`, at: m.at.toISOString() })),
    ...noteRows.map((n) => ({ app: "notes" as const, title: n.title || "Untitled", href: `/app/notes/${n.id}`, at: n.at.toISOString() })),
    ...[...new Map(mail.map((m) => [m.threadId, m])).values()].map((m) => ({ app: "mail" as const, title: m.subject || "(no subject)", href: `/app/open/thread/${m.threadId}`, at: m.at.toISOString() })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
