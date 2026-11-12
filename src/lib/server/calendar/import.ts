/** .ics import into one calendar: upserts by UID (in that calendar), overrides by RECURRENCE-ID; never mails anyone. */
import type { BatchItem } from "drizzle-orm/batch";
import { and, calendarAttendees, calendarEvents, db, eq, inArray, isNotNull } from "@/db";
import { HttpError } from "@/lib/server/api";
import { parseIcs, type IcsEvent } from "@/lib/calendar/ics";
import { groupSeries, MAX_IMPORT_EVENTS } from "@/lib/calendar/import";
import { seriesEnd } from "@/lib/calendar/recurrence";
import { requireCalendar, type CalendarViewer } from "./access";
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
  const zone = (await getPrefs(v.userId)).timezones[0] ?? "UTC";
  let parsed: IcsEvent[];
  try {
    parsed = parseIcs(text, zone).events;
  } catch {
    throw new HttpError(422, "This file isn't an iCalendar (.ics) file");
  }
  if (parsed.length > MAX_IMPORT_EVENTS) throw new HttpError(422, `Import at most ${MAX_IMPORT_EVENTS} events at a time`);
  const series = groupSeries(parsed);
  const e = calendarEvents;
  const existing = new Map<string, string>();
  for (const part of chunks(series.map((s) => s.master.uid), 90))
    for (const r of await db.select({ id: e.id, uid: e.uid }).from(e).where(and(eq(e.orgId, v.orgId), eq(e.calendarId, calendarId), inArray(e.uid, part))))
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
      statements.push(db.insert(e).values({ id, orgId: v.orgId, calendarId, uid: master.uid.slice(0, 500), ...fields(master), createdBy: v.userId || null }));
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
      else statements.push(db.insert(e).values({ orgId: v.orgId, calendarId, uid: master.uid.slice(0, 500), parentId: id, ...row, createdBy: v.userId || null }));
    }
  }
  for (const part of chunks(statements, 50)) await db.batch(part as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { created, updated };
}
