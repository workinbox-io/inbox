/**
 * Collections' planning jobs: repeating records (collection_recurrences, made on their day by the hourly cron), cycles
 * (records still open when their cycle ends move to the current one, daily), SLAs (people hear once when an open record
 * runs past its priority's time, hourly) and the trash (30 days, daily, `purgeTrash`). Rules in lib/collections/settings.ts.
 */
import { and, collectionRecords, collectionRecurrences, collections, db, eq, isNotNull, isNull, lt, lte, sql } from "@/db";
import { isDueField } from "@/lib/collections/board";
import { isClosed, statusFieldOf, statusKind } from "@/lib/collections/fields";
import { cycleOf, dayMs, isoDay, nextRun, slaHours, slaState, today, type RepeatUnit } from "@/lib/collections/settings";
import { HttpError } from "./api";
import { createRecord, getRecord, systemCollection, type Collection } from "./collections";
import { reportError } from "./errors";
import { notify } from "./notifications";
import { publish } from "./chat/sync";

export type Recurrence = { id: string; title: string; every: number; unit: RepeatUnit; nextAt: string; createdBy: string };

const toRecurrence = (r: typeof collectionRecurrences.$inferSelect): Recurrence => ({ id: r.id, title: r.title, every: r.every, unit: r.unit, nextAt: isoDay(r.nextAt.getTime()), createdBy: r.createdBy });

export async function listRecurrences(orgId: string, collectionId: string) {
  const rows = await db.select().from(collectionRecurrences).where(and(eq(collectionRecurrences.orgId, orgId), eq(collectionRecurrences.collectionId, collectionId))).orderBy(collectionRecurrences.nextAt);
  return rows.map(toRecurrence);
}

/** Repeats a record: a copy of its title, values and description is made every `every` days/weeks/months from `start`. */
export async function createRecurrence(orgId: string, collection: Collection, userId: string, input: { recordId: string; every: number; unit: RepeatUnit; start: string }) {
  const record = await getRecord(orgId, collection.id, input.recordId);
  const [{ n }] = (await db.select({ n: sql<number>`count(*)` }).from(collectionRecurrences).where(eq(collectionRecurrences.collectionId, collection.id))) as [{ n: number }];
  if (n >= 50) throw new HttpError(422, "Up to 50 repeating records per collection");
  if (input.start < today(new Date(), false)) throw new HttpError(422, "Start today or later");
  const [row] = await db
    .insert(collectionRecurrences)
    .values({ orgId, collectionId: collection.id, title: record.title, values: record.values, description: record.description ?? null, every: input.every, unit: input.unit, nextAt: new Date(dayMs(input.start)), createdBy: userId })
    .returning();
  return toRecurrence(row!);
}

export async function deleteRecurrence(orgId: string, collectionId: string, id: string) {
  const [row] = await db.delete(collectionRecurrences).where(and(eq(collectionRecurrences.orgId, orgId), eq(collectionRecurrences.collectionId, collectionId), eq(collectionRecurrences.id, id))).returning();
  if (!row) throw new HttpError(404, "Not found");
}

/** Hourly: makes the records due today (a deadline field gets the day), then moves each schedule on. */
export async function runRecurrences(now = Date.now()) {
  const due = await db.select().from(collectionRecurrences).where(lte(collectionRecurrences.nextAt, new Date(now))).limit(50);
  for (const r of due) {
    try {
      // Moved on first, so a failure below never makes the same record twice.
      let next = nextRun(r.nextAt.getTime(), r.every, r.unit);
      while (next <= now) next = nextRun(next, r.every, r.unit);
      await db.update(collectionRecurrences).set({ nextAt: new Date(next) }).where(eq(collectionRecurrences.id, r.id));
      const c = await systemCollection(r.orgId, r.collectionId);
      if (!c) continue;
      const values: Record<string, unknown> = { ...r.values };
      const deadline = c.fields.find((f) => isDueField(f));
      if (deadline) values[deadline.id] = isoDay(r.nextAt.getTime());
      const status = statusFieldOf(c.fields);
      // A copy of a finished record starts again at the beginning of the workflow.
      if (status && isClosed(c.fields, r.values)) values[status.id] = status.options?.find((o) => statusKind(status, o) === "unstarted") ?? status.options?.[0];
      await createRecord(r.orgId, c, r.createdBy, { title: r.title, values, description: r.description ?? undefined });
    } catch (e) {
      await reportError("web", e, { route: "collections recurrence", orgId: r.orgId });
    }
  }
}

/** Collections with a setting turned on (the JSON column), at most 500 per run. */
const withSetting = (key: "cycles" | "sla") =>
  db.select({ id: collections.id, orgId: collections.orgId }).from(collections).where(sql`json_extract(${collections.settings}, ${`$.${key}`}) IS NOT NULL`).limit(500);

/** Daily: open records of an ended cycle move to the current one. */
export async function rollCycles() {
  for (const { id, orgId } of await withSetting("cycles")) {
    const c = await systemCollection(orgId, id);
    if (!c?.settings.cycles) continue;
    const current = cycleOf(c.settings.cycles, today(new Date(), false));
    if (current < 1) continue;
    const rows = await db
      .select({ id: collectionRecords.id, values: collectionRecords.values })
      .from(collectionRecords)
      .where(and(eq(collectionRecords.collectionId, id), isNull(collectionRecords.deletedAt), isNotNull(collectionRecords.cycle), lt(collectionRecords.cycle, current)));
    const open = rows.filter((r) => !isClosed(c.fields, r.values)).map((r) => r.id);
    for (let i = 0; i < open.length; i += 90) await db.update(collectionRecords).set({ cycle: current }).where(sql`${collectionRecords.id} IN (${sql.join(open.slice(i, i + 90).map((x) => sql`${x}`), sql`, `)})`);
    if (open.length) await publish(orgId, { type: "collection", collectionId: id, recordIds: [], by: null, reload: true }, c.sharing === "team" ? undefined : [c.ownerId, ...c.people.map((p) => p.userId)].filter((x): x is string => !!x));
  }
}

/** Hourly: open records past their SLA, announced once to the people in their person fields and the collection's owner. */
export async function sweepSla(now = Date.now()) {
  for (const { id, orgId } of await withSetting("sla")) {
    const c = await systemCollection(orgId, id);
    const sla = c?.settings.sla;
    if (!c || !sla) continue;
    const rows = await db
      .select({ id: collectionRecords.id, title: collectionRecords.title, values: collectionRecords.values, createdAt: collectionRecords.createdAt })
      .from(collectionRecords)
      .where(and(eq(collectionRecords.collectionId, id), isNull(collectionRecords.deletedAt), eq(collectionRecords.triage, false), isNull(collectionRecords.slaNotifiedAt)))
      .limit(1000);
    for (const r of rows) {
      const hours = slaHours(sla, r.values);
      if (!hours || isClosed(c.fields, r.values) || slaState(r.createdAt.getTime(), hours, now).state !== "breached") continue;
      await db.update(collectionRecords).set({ slaNotifiedAt: new Date(now) }).where(eq(collectionRecords.id, r.id));
      const people = c.fields.filter((f) => f.type === "person").map((f) => r.values[f.id]).filter((x): x is string => typeof x === "string");
      const to = [...new Set([...people, ...(c.ownerId ? [c.ownerId] : [])])];
      await notify(orgId, to, { kind: "update", app: "collections", actorId: null, title: r.title, body: `SLA missed · ${c.name}`, href: `/app/open/record/${r.id}`, groupKey: `record:${r.id}` });
    }
  }
}
