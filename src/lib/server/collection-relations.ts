/**
 * How records hang together: a record's parent and sub-records (collection_records.parent_id), its relations
 * (collection_relations: blocks / blocked by, related, duplicate), and the records of other collections whose relation
 * field points at it ("Linked from": tasks of a project). Only records in collections the viewer may open are shown.
 */
import { and, collectionRecords, collectionRelations, db, eq, inArray, isNull, or, sql } from "@/db";
import { isClosed, statusFieldOf, statusKind, type StatusKind } from "@/lib/collections/fields";
import { formatId } from "@/lib/collections/ids";
import { HttpError } from "./api";
import { getRecord, listCollections, type Collection, type CollectionViewer } from "./collections";
import { logActivity } from "./collection-activity";

export type RelatedRecord = { id: string; collectionId: string; collection: string; key: string | null; title: string; status: string | null; kind: StatusKind | null; closed: boolean };
export type RelationKind = "blocks" | "blockedBy" | "related" | "duplicate" | "duplicatedBy";
export type Related = {
  parent: RelatedRecord | null;
  children: RelatedRecord[];
  relations: { id: string; kind: RelationKind; record: RelatedRecord }[];
  linkedFrom: { collectionId: string; collection: string; field: string; records: RelatedRecord[] }[];
};

type Row = { id: string; collectionId: string; number: number; title: string; values: Record<string, unknown>; parentId?: string | null };

function shapeAll(rows: Row[], byId: Map<string, Collection>): RelatedRecord[] {
  return rows.flatMap((r) => {
    const c = byId.get(r.collectionId);
    if (!c) return [];
    const f = statusFieldOf(c.fields);
    const status = f && typeof r.values[f.id] === "string" ? (r.values[f.id] as string) : null;
    return [{ id: r.id, collectionId: c.id, collection: c.name, key: formatId(c.prefix, r.number), title: r.title, status, kind: f && status ? statusKind(f, status) : null, closed: isClosed(c.fields, r.values as never) }];
  });
}

const columns = { id: collectionRecords.id, collectionId: collectionRecords.collectionId, number: collectionRecords.number, title: collectionRecords.title, values: collectionRecords.values, parentId: collectionRecords.parentId };

async function rowsByIds(orgId: string, ids: string[]) {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 90)
    out.push(...(await db.select(columns).from(collectionRecords).where(and(eq(collectionRecords.orgId, orgId), inArray(collectionRecords.id, ids.slice(i, i + 90)), isNull(collectionRecords.deletedAt)))));
  return out;
}

/** Records by id (relation fields, mentions), only from collections the viewer may open. */
export async function lookupRecords(v: CollectionViewer, ids: string[]) {
  const visible = new Map((await listCollections(v)).map((c) => [c.id, c]));
  return shapeAll(await rowsByIds(v.orgId, [...new Set(ids)].slice(0, 200)), visible);
}

export async function relatedOf(v: CollectionViewer, collection: Collection, recordId: string): Promise<Related> {
  const all = await listCollections(v);
  const visible = new Map(all.map((c) => [c.id, c]));
  const [[self], children, rels] = await Promise.all([
    db.select(columns).from(collectionRecords).where(and(eq(collectionRecords.orgId, v.orgId), eq(collectionRecords.collectionId, collection.id), eq(collectionRecords.id, recordId))),
    db.select(columns).from(collectionRecords).where(and(eq(collectionRecords.orgId, v.orgId), eq(collectionRecords.parentId, recordId), isNull(collectionRecords.deletedAt))).orderBy(collectionRecords.number).limit(200),
    db.select().from(collectionRelations).where(and(eq(collectionRelations.orgId, v.orgId), or(eq(collectionRelations.fromId, recordId), eq(collectionRelations.toId, recordId)))).limit(200),
  ]);
  if (!self) throw new HttpError(404, "Record not found");
  const otherIds = rels.map((r) => (r.fromId === recordId ? r.toId : r.fromId));
  const others = new Map(shapeAll(await rowsByIds(v.orgId, [...otherIds, ...(self.parentId ? [self.parentId] : [])]), visible).map((r) => [r.id, r]));
  const relations = rels.flatMap((r) => {
    const out = r.fromId === recordId;
    const record = others.get(out ? r.toId : r.fromId);
    if (!record) return [];
    const kind: RelationKind = r.kind === "related" ? "related" : r.kind === "blocks" ? (out ? "blocks" : "blockedBy") : out ? "duplicate" : "duplicatedBy";
    return [{ id: r.id, kind, record }];
  });
  // Relation fields of visible collections that point at this collection, and their records pointing at this record.
  const pointing = all.flatMap((c) => c.fields.filter((f) => f.type === "relation" && f.target === collection.id).map((f) => ({ c, f })));
  const linkedFrom = (
    await Promise.all(
      pointing.slice(0, 10).map(async ({ c, f }) => {
        const rows = await db
          .select(columns)
          .from(collectionRecords)
          .where(and(eq(collectionRecords.orgId, v.orgId), eq(collectionRecords.collectionId, c.id), isNull(collectionRecords.deletedAt), eq(collectionRecords.triage, false), sql`json_extract(${collectionRecords.values}, ${`$."${f.id}"`}) = ${recordId}`))
          .limit(200);
        return { collectionId: c.id, collection: c.name, field: f.name, records: shapeAll(rows, visible) };
      }),
    )
  ).filter((g) => g.records.length);
  return { parent: self.parentId ? others.get(self.parentId) ?? null : null, children: shapeAll(children, visible), relations, linkedFrom };
}

/** Links two records; `blockedBy` is stored as the other record blocking this one. */
export async function addRelation(v: CollectionViewer, collection: Collection, recordId: string, input: { to: string; kind: "blocks" | "blockedBy" | "related" | "duplicate" }) {
  if (input.to === recordId) throw new HttpError(422, "A record can't relate to itself");
  const [target] = await lookupRecords(v, [input.to]);
  if (!target) throw new HttpError(404, "Record not found");
  const [from, to] = input.kind === "blockedBy" ? [input.to, recordId] : [recordId, input.to];
  const kind = input.kind === "blockedBy" ? "blocks" : input.kind;
  await db.insert(collectionRelations).values({ orgId: v.orgId, fromId: from, toId: to, kind, createdBy: v.userId }).onConflictDoNothing();
  await logActivity(v.orgId, collection.id, recordId, v.userId, [{ field: "relation", from: null, to: `${input.kind}:${target.key ?? target.title}` }]);
}

export async function deleteRelation(v: CollectionViewer, collection: Collection, recordId: string, relationId: string) {
  await getRecord(v.orgId, collection.id, recordId);
  const [row] = await db
    .delete(collectionRelations)
    .where(and(eq(collectionRelations.orgId, v.orgId), eq(collectionRelations.id, relationId), or(eq(collectionRelations.fromId, recordId), eq(collectionRelations.toId, recordId))))
    .returning();
  if (!row) throw new HttpError(404, "Not found");
  await logActivity(v.orgId, collection.id, recordId, v.userId, [{ field: "relation", from: row.kind, to: null }]);
}
