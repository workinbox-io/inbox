/**
 * A record's history (collection_activity): who changed which field from what to what. Written by record creates,
 * edits and the board's batch changes (not imports or reordering); a quick repeat by the same person on the same field
 * updates the last row (`mergesInto`), and one that puts the old value back removes it. Never fails the write itself.
 */
import { and, collectionActivity, db, desc, eq } from "@/db";
import { mergesInto, type Change } from "@/lib/collections/activity";
import { reportError } from "./errors";

export type ActivityEntry = { id: string; actorId: string | null; field: string; from: unknown; to: unknown; createdAt: string };

export async function logActivity(orgId: string, collectionId: string, recordId: string, actorId: string | null, changes: Change[]) {
  if (!changes.length) return;
  try {
    const now = Date.now();
    const [last] = await db.select().from(collectionActivity).where(eq(collectionActivity.recordId, recordId)).orderBy(desc(collectionActivity.createdAt)).limit(1);
    const rest = [...changes];
    if (last && changes.length === 1 && mergesInto({ actorId: last.actorId, field: last.field, at: last.createdAt.getTime() }, actorId, changes[0]!.field, now)) {
      const c = rest.shift()!;
      if (JSON.stringify(last.from ?? null) === JSON.stringify(c.to) && c.field !== "description") await db.delete(collectionActivity).where(eq(collectionActivity.id, last.id));
      else await db.update(collectionActivity).set({ to: c.to, createdAt: new Date(now) }).where(eq(collectionActivity.id, last.id));
    }
    if (!rest.length) return;
    const rows = rest.map((c) => db.insert(collectionActivity).values({ orgId, collectionId, recordId, actorId, field: c.field, from: c.from, to: c.to, createdAt: new Date(now) }));
    await db.batch(rows as [(typeof rows)[number], ...typeof rows]);
  } catch (e) {
    await reportError("web", e, { route: "collection activity", orgId });
  }
}

export async function listActivity(orgId: string, recordId: string): Promise<ActivityEntry[]> {
  const rows = await db
    .select()
    .from(collectionActivity)
    .where(and(eq(collectionActivity.orgId, orgId), eq(collectionActivity.recordId, recordId)))
    .orderBy(desc(collectionActivity.createdAt))
    .limit(200);
  return rows.reverse().map((r) => ({ id: r.id, actorId: r.actorId, field: r.field, from: r.from ?? null, to: r.to ?? null, createdAt: r.createdAt.toISOString() }));
}
