/** .ics import into one calendar: upserts by UID (in that calendar), overrides by RECURRENCE-ID; never mails anyone. */
import type { BatchItem } from "drizzle-orm/batch";
import { and, asc, calendarAttendees, calendarEvents, calendars, db, eq, inArray, isNotNull, isNull, lt, or } from "@/db";
import { HttpError } from "@/lib/server/api";
import { parseIcs, type IcsEvent } from "@/lib/calendar/ics";
import { groupSeries, MAX_IMPORT_EVENTS } from "@/lib/calendar/import";
import { seriesEnd } from "@/lib/calendar/recurrence";
import { requireCalendar, type Calendar, type CalendarViewer } from "./access";
import { getPrefs } from "./events";

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

function fields(e: IcsEvent) {
  const until = e.rrule ? seriesEnd({ startsAt: e.start, endsAt: e.end, timezone: e.timezone, allDay: e.allDay, rrule: e.rrule, exdates: e.exdates }) : null;
  return {
    title: e.title.slice(0, 500),
    description: e.description.slice(0, 20_000),
    location: e.location.slice(0, 500),
    url: /^https?:\/\//i.test(e.url) ? e.url.slice(0, 2000) : "",
    startsAt: new Date(e.start),
    endsAt: new Date(e.end),
    allDay: e.allDay,
    timezone: e.timezone,
    rrule: e.rrule,
    exdates: e.exdates,
    recurUntil: until === null ? null : new Date(until),
    status: e.status,
    busy: e.busy,
    organizerEmail: e.organizer?.email || null,
    sequence: e.sequence,
  };
}

export async function importIcs(v: CalendarViewer, calendarId: string, text: string) {
  await requireCalendar(v, calendarId, "edit");
  return writeIcs({ orgId: v.orgId, calendarId, userId: v.userId || null }, text, false);
}

/** `prune` (subscriptions): events no longer in the feed are deleted, and single events that ended over a year ago are left out. */
async function writeIcs(target: { orgId: string; calendarId: string; userId: string | null }, text: string, prune: boolean) {
  const { orgId, calendarId } = target;
  const zone = target.userId ? ((await getPrefs(target.userId)).timezones[0] ?? "UTC") : "UTC";
  let parsed: IcsEvent[];
  try {
    parsed = parseIcs(text, zone).events;
  } catch {
    throw new HttpError(422, "This file isn't an iCalendar (.ics) file");
  }
  const yearAgo = Date.now() - 365 * 86_400_000;
  if (prune) parsed = parsed.filter((ev) => ev.rrule || ev.recurrenceId !== null || ev.end > yearAgo);
  if (parsed.length > MAX_IMPORT_EVENTS) throw new HttpError(422, `Import at most ${MAX_IMPORT_EVENTS} events at a time`);
  const series = groupSeries(parsed);
  const e = calendarEvents;
  const existing = new Map<string, string>();
  for (const part of chunks(series.map((s) => s.master.uid), 90))
    for (const r of await db.select({ id: e.id, uid: e.uid }).from(e).where(and(eq(e.orgId, orgId), eq(e.calendarId, calendarId), inArray(e.uid, part))))
      if (!existing.has(r.uid)) existing.set(r.uid, r.id);
  const masterIds = [...existing.values()];
  const oldOverrides = new Map<string, string>();
  for (const part of chunks(masterIds, 90))
    for (const r of await db.select({ id: e.id, parentId: e.parentId, originalStart: e.originalStart }).from(e).where(and(inArray(e.parentId, part), isNotNull(e.originalStart))))
      oldOverrides.set(`${r.parentId}:${r.originalStart!.getTime()}`, r.id);

  const statements: BatchItem<"sqlite">[] = [];
  let created = 0;
  let updated = 0;
  for (const { master, overrides } of series) {
    const known = existing.get(master.uid);
    const id = known ?? crypto.randomUUID();
    if (known) {
      updated++;
      statements.push(db.update(e).set({ ...fields(master), updatedAt: new Date() }).where(eq(e.id, id)));
      statements.push(db.delete(calendarAttendees).where(eq(calendarAttendees.eventId, id)));
    } else {
      created++;
      statements.push(db.insert(e).values({ id, orgId, calendarId, uid: master.uid.slice(0, 500), ...fields(master), createdBy: target.userId }));
    }
    const attendees = [...new Map(master.attendees.map((a) => [a.email, a])).values()].map((a) => ({
      eventId: id,
      email: a.email,
      name: a.name ?? "",
      // Not linked to people of the org: an import mustn't put events into colleagues' calendars.
      userId: null,
      status: a.status,
      optional: a.optional ?? false,
    }));
    for (const part of chunks(attendees, 14)) statements.push(db.insert(calendarAttendees).values(part));
    for (const o of overrides) {
      const old = oldOverrides.get(`${id}:${o.recurrenceId}`);
      const row = { ...fields(o), rrule: null, exdates: [], recurUntil: null, originalStart: new Date(o.recurrenceId!) };
      if (old) statements.push(db.update(e).set({ ...row, updatedAt: new Date() }).where(eq(e.id, old)));
      else statements.push(db.insert(e).values({ orgId, calendarId, uid: master.uid.slice(0, 500), parentId: id, ...row, createdBy: target.userId }));
    }
  }
  if (prune) {
    const keep = new Set(series.map((s) => s.master.uid.slice(0, 500)));
    const rows = await db.selectDistinct({ uid: e.uid }).from(e).where(and(eq(e.orgId, orgId), eq(e.calendarId, calendarId)));
    for (const part of chunks(rows.map((r) => r.uid).filter((uid) => !keep.has(uid)), 90))
      statements.push(db.delete(e).where(and(eq(e.orgId, orgId), eq(e.calendarId, calendarId), inArray(e.uid, part))));
  }
  for (const part of chunks(statements, 50)) await db.batch(part as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { created, updated };
}

const MAX_FEED_BYTES = 5_000_000;

/** Pulls a subscribed calendar's feed. Never throws: a failure is kept in `sync_error` (shown in the rail). */
export async function syncCalendar(c: Calendar) {
  let set: Partial<Calendar>;
  try {
    const res = await fetch(c.sourceUrl!, { headers: { accept: "text/calendar" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new HttpError(422, `The calendar's address answered ${res.status}. Check the link.`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_FEED_BYTES) throw new HttpError(422, "The calendar is too large (5 MB at most)");
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) throw new HttpError(422, "The calendar is too large (5 MB at most)");
    // Google stamps every event with the time of the request: ignore DTSTAMP so an unchanged calendar writes nothing.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.replace(/^DTSTAMP[^\r\n]*/gm, "")));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    // shortcut: any change rewrites every event of the feed; diff per event if D1 writes from big feeds start to cost.
    if (hash !== c.syncHash) await writeIcs({ orgId: c.orgId, calendarId: c.id, userId: c.ownerId }, text, true);
    // First sync: take the calendar's own name (Google's X-WR-CALNAME) over the placeholder.
    const calName = c.syncHash === null ? /^X-WR-CALNAME:(.+)$/m.exec(text)?.[1]?.trim().replace(/\\([,;\\])/g, "$1") : undefined;
    set = { syncHash: hash, syncError: null, ...(calName ? { name: calName.slice(0, 80) } : {}) };
  } catch (e) {
    set = { syncError: (e instanceof HttpError ? e.message : "The calendar couldn't be read. Check the link.").slice(0, 300) };
  }
  await db.update(calendars).set({ ...set, syncedAt: new Date() }).where(eq(calendars.id, c.id));
  return set.syncError ?? null;
}

/** Every minute: up to 5 subscribed calendars not pulled for 30 minutes, oldest first. */
export async function syncSubscribedCalendars() {
  const due = await db
    .select()
    .from(calendars)
    .where(and(isNotNull(calendars.sourceUrl), or(isNull(calendars.syncedAt), lt(calendars.syncedAt, new Date(Date.now() - 30 * 60_000)))))
    .orderBy(asc(calendars.syncedAt))
    .limit(5);
  for (const c of due) await syncCalendar(c);
}
