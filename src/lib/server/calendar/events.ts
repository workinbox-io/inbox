/**
 * Events: range lists (series expanded, overrides in place, colleagues' calendars overlaid as busy blocks when
 * the viewer can't see them), create, change and delete with the series scopes (this / following / all), RSVP.
 */
import {
  and,
  calendarAttendees,
  calendarEvents,
  calendarPrefs,
  db,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  mailboxes,
  member,
  or,
  sql,
  user,
  type SQL,
} from "@/db";
import { HttpError } from "@/lib/server/api";
import { expand, seriesEnd, splitRule } from "@/lib/calendar/recurrence";
import type { PartStat } from "@/lib/calendar/ics";
import type { EventDelete, EventInput, EventUpdate, CalendarPrefsInput } from "@/lib/validation-calendar";
import {
  personalCalendar,
  requireCalendar,
  requireEvent,
  visibleCalendars,
  type CalendarEvent,
  type CalendarRole,
  type CalendarViewer,
} from "./access";
import { notifyAttendees, sendReply, type Attendee } from "./invites";

export interface EventView {
  /** The row: a single event, a series' master, or an override. */
  id: string;
  /** The series' master (= id for single events). */
  seriesId: string;
  /** An occurrence of a series: its original start; null for single events and masters read on their own. */
  occurrence: number | null;
  calendarId: string;
  uid: string;
  title: string;
  description: string;
  location: string;
  url: string;
  start: number;
  end: number;
  allDay: boolean;
  timezone: string;
  /** The series' rule (also on its occurrences and overrides). */
  rrule: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  busy: boolean;
  organizer: { email: string; userId: string | null } | null;
  sequence: number;
  reminders: number[];
  attendees: { email: string; name: string; userId: string | null; status: PartStat; optional: boolean }[];
  /** "busy": a colleague's event the viewer may only see as busy (no details). */
  role: CalendarRole | "busy";
  /** The viewer's answer when invited. */
  myStatus: PartStat | null;
  /** Overlaid colleague's user id. */
  person?: string;
}

const CHUNK = 90;

async function chunked<T>(ids: string[], run: (part: string[]) => Promise<T[]>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await run(ids.slice(i, i + CHUNK))));
  return out;
}

const ms = (d: Date | null) => (d ? d.getTime() : null);

/** Masters and single events that may have occurrences in [from, to). */
function rangeRows(where: SQL, from: number, to: number) {
  const e = calendarEvents;
  return db
    .select()
    .from(e)
    .where(
      and(
        where,
        isNull(e.parentId),
        lt(e.startsAt, new Date(to)),
        or(
          and(isNull(e.rrule), gt(e.endsAt, new Date(from))),
          and(isNotNull(e.rrule), or(isNull(e.recurUntil), sql`${e.recurUntil} + (${e.endsAt} - ${e.startsAt}) > ${from}`)),
        ),
      ),
    );
}

const attendeesOf = (ids: string[]) =>
  chunked(ids, (part) => db.select().from(calendarAttendees).where(inArray(calendarAttendees.eventId, part)));

function view(row: CalendarEvent, master: CalendarEvent, attendees: Attendee[], role: CalendarRole | "busy", viewerId: string): Omit<EventView, "occurrence" | "start" | "end"> {
  const busyOnly = role === "busy";
  return {
    id: row.id,
    seriesId: master.id,
    calendarId: row.calendarId,
    uid: row.uid,
    title: busyOnly ? "" : row.title,
    description: busyOnly ? "" : row.description,
    location: busyOnly ? "" : row.location,
    url: busyOnly ? "" : row.url,
    allDay: row.allDay,
    timezone: row.timezone,
    rrule: master.rrule,
    status: row.status,
    busy: row.busy,
    organizer: busyOnly || !master.organizerEmail ? null : { email: master.organizerEmail, userId: master.organizerUserId },
    sequence: row.sequence,
    reminders: busyOnly ? [] : row.reminders,
    attendees: busyOnly
      ? []
      : attendees.map((a) => ({ email: a.email, name: a.name, userId: a.userId, status: a.status, optional: a.optional })),
    role,
    myStatus: (viewerId && attendees.find((a) => a.userId === viewerId)?.status) || null,
  };
}

/** Occurrences of these rows in [from, to), with overrides and attendees. */
async function materialize(rows: CalendarEvent[], from: number, to: number, roleOf: (e: CalendarEvent) => CalendarRole | "busy", viewerId: string) {
  const masters = rows.filter((r) => r.rrule);
  const overrides = await chunked(masters.map((m) => m.id), (part) =>
    db.select().from(calendarEvents).where(inArray(calendarEvents.parentId, part)),
  );
  const people = await attendeesOf(rows.map((r) => r.id));
  const byEvent = new Map<string, Attendee[]>();
  for (const a of people) byEvent.set(a.eventId, [...(byEvent.get(a.eventId) ?? []), a]);
  const out: EventView[] = [];
  for (const row of rows) {
    const role = roleOf(row);
    const list = byEvent.get(row.id) ?? [];
    if (!row.rrule) {
      out.push({ ...view(row, row, list, role, viewerId), occurrence: null, start: row.startsAt.getTime(), end: row.endsAt.getTime() });
      continue;
    }
    const own = overrides.filter((o) => o.parentId === row.id);
    const series = { startsAt: row.startsAt.getTime(), endsAt: row.endsAt.getTime(), timezone: row.timezone, allDay: row.allDay, rrule: row.rrule, exdates: row.exdates };
    for (const o of expand(series, from, to, own.map((x) => ms(x.originalStart)!)))
      out.push({ ...view(row, row, list, role, viewerId), occurrence: o.originalStart, start: o.start, end: o.end });
    for (const x of own)
      if (x.startsAt.getTime() < to && x.endsAt.getTime() > from && x.status !== "cancelled")
        out.push({ ...view(x, row, list, role, viewerId), occurrence: ms(x.originalStart), start: x.startsAt.getTime(), end: x.endsAt.getTime() });
  }
  return out.filter((e) => !(e.role === "busy" && (!e.busy || e.status === "cancelled")));
}

/** Ids of events (masters) these people are invited to. */
const attendedBy = (userIds: string[]) =>
  db.select({ id: calendarAttendees.eventId }).from(calendarAttendees).where(inArray(calendarAttendees.userId, userIds));

export interface ListQuery {
  from: number;
  to: number;
  calendars?: string[];
  people?: string[];
}

export async function listEvents(v: CalendarViewer, q: ListQuery): Promise<EventView[]> {
  if (q.to - q.from > 400 * 86_400_000) throw new HttpError(422, "Ask for at most a year at a time");
  const calendars = await visibleCalendars(v);
  const roles = new Map(calendars.map((c) => [c.id, c.sourceUrl ? ("view" as const) : c.role]));
  const shown = q.calendars ? calendars.filter((c) => q.calendars!.includes(c.id)) : calendars;
  const hidden = new Set(calendars.filter((c) => !shown.includes(c)).map((c) => c.id));
  const orgWhere = eq(calendarEvents.orgId, v.orgId);
  const mine = shown.length ? await rangeRows(and(orgWhere, inArray(calendarEvents.calendarId, shown.map((c) => c.id)))!, q.from, q.to) : [];
  const seen = new Set(mine.map((r) => r.id));
  const invited = v.userId
    ? (await rangeRows(and(orgWhere, inArray(calendarEvents.id, attendedBy([v.userId])))!, q.from, q.to)).filter(
        (r) => !seen.has(r.id) && !hidden.has(r.calendarId),
      )
    : [];
  for (const r of invited) seen.add(r.id);
  const out = await materialize([...mine, ...invited], q.from, q.to, (e) => roles.get(e.calendarId) ?? "view", v.userId);

  const people = [...new Set(q.people ?? [])].filter((p) => p && p !== v.userId).slice(0, 10);
  if (people.length) {
    const members = await db
      .select({ id: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, v.orgId), inArray(member.userId, people)));
    for (const { id: person } of members) {
      const own = await personalCalendar(v.orgId, person);
      const rows = await rangeRows(
        and(orgWhere, or(eq(calendarEvents.calendarId, own.id), inArray(calendarEvents.id, attendedBy([person]))))!,
        q.from,
        q.to,
      );
      // The viewer's own events already show; a colleague's declined invitations aren't busy time.
      const theirs = rows.filter((r) => !seen.has(r.id));
      const list = await materialize(theirs, q.from, q.to, (e) => roles.get(e.calendarId) ?? "busy", v.userId);
      const declined = new Set(
        (await attendeesOf(theirs.map((r) => r.id))).filter((a) => a.userId === person && a.status === "declined").map((a) => a.eventId),
      );
      out.push(...list.filter((e) => !declined.has(e.seriesId)).map((e) => ({ ...e, person })));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** One event as stored (a master is not expanded). */
export async function getEvent(v: CalendarViewer, id: string): Promise<EventView> {
  const { event, role } = await requireEvent(v, id);
  const [master] = event.parentId ? await db.select().from(calendarEvents).where(eq(calendarEvents.id, event.parentId)) : [event];
  const attendees = await attendeesOf([master.id]);
  return { ...view(event, master, attendees, role, v.userId), occurrence: ms(event.originalStart), start: event.startsAt.getTime(), end: event.endsAt.getTime() };
}

// ---------- people and preferences ----------

/** The address the viewer sends invitations from: their personal mailbox, else their login. */
async function organizerAddress(v: CalendarViewer) {
  const [box] = await db
    .select({ address: mailboxes.address })
    .from(mailboxes)
    .where(and(eq(mailboxes.orgId, v.orgId), eq(mailboxes.userId, v.userId), eq(mailboxes.kind, "personal")));
  if (box) return box.address;
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, v.userId));
  return u?.email.toLowerCase() ?? null;
}

/** People of the org behind these addresses (personal mailboxes and logins). */
export async function orgUsersByEmail(orgId: string, emails: string[]) {
  const out = new Map<string, string>();
  if (!emails.length) return out;
  for (const r of await chunked(emails, (part) =>
    db
      .select({ email: mailboxes.address, userId: mailboxes.userId })
      .from(mailboxes)
      .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.kind, "personal"), inArray(mailboxes.address, part))),
  ))
    if (r.userId) out.set(r.email, r.userId);
  for (const r of await chunked(emails, (part) =>
    db
      .select({ email: user.email, userId: user.id })
      .from(user)
      .innerJoin(member, and(eq(member.userId, user.id), eq(member.organizationId, orgId)))
      .where(inArray(user.email, part)),
  ))
    out.set(r.email.toLowerCase(), r.userId);
  return out;
}

export const DEFAULT_PREFS = { timezones: [] as string[], weekStart: 1, hourCycle: "h23" as const, workStart: 540, workEnd: 1020, defaultReminder: 10 as number | null };

export async function getPrefs(userId: string) {
  if (!userId) return DEFAULT_PREFS;
  const [row] = await db.select().from(calendarPrefs).where(eq(calendarPrefs.userId, userId));
  return row
    ? { timezones: row.timezones, weekStart: row.weekStart, hourCycle: row.hourCycle, workStart: row.workStart, workEnd: row.workEnd, defaultReminder: row.defaultReminder }
    : DEFAULT_PREFS;
}

export async function savePrefs(userId: string, input: CalendarPrefsInput) {
  if (!userId) throw new HttpError(403, "Sign in to change calendar settings");
  const next = { ...(await getPrefs(userId)), ...input };
  await db
    .insert(calendarPrefs)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: calendarPrefs.userId, set: { ...next, updatedAt: new Date() } });
  return next;
}

async function viewerZone(v: CalendarViewer) {
  return (await getPrefs(v.userId)).timezones[0] ?? "UTC";
}

// ---------- changes ----------

type AttendeeInput = NonNullable<EventInput["attendees"]>[number];

/** Attendee rows for an event: org people linked by user id, previous answers kept, the organizer accepted. */
async function attendeeRows(v: CalendarViewer, eventId: string, list: AttendeeInput[], previous: Attendee[], organizer: string | null): Promise<Attendee[]> {
  const unique = [...new Map(list.map((a) => [a.email, a])).values()];
  const users = await orgUsersByEmail(v.orgId, unique.map((a) => a.email));
  return unique.map((a) => {
    const before = previous.find((p) => p.email === a.email);
    return {
      eventId,
      email: a.email,
      name: a.name ?? before?.name ?? "",
      userId: users.get(a.email) ?? null,
      status: a.email === organizer ? "accepted" : (before?.status ?? "needs-action"),
      optional: a.optional ?? before?.optional ?? false,
    };
  });
}

/** Whether attendees must hear about it (and SEQUENCE goes up). */
const significant = (p: Partial<EventUpdate>) =>
  ["start", "end", "allDay", "title", "location", "url", "rrule", "timezone", "status"].some((k) => p[k as keyof EventUpdate] !== undefined);

function seriesFields(start: number, end: number, timezone: string, allDay: boolean, rrule: string | null, exdates: number[]) {
  const recurUntil = rrule ? seriesEnd({ startsAt: start, endsAt: end, timezone, allDay, rrule, exdates }) : null;
  return { startsAt: new Date(start), endsAt: new Date(end), rrule, exdates, recurUntil: recurUntil === null ? null : new Date(recurUntil) };
}

async function seriesSnapshot(masterId: string) {
  const [master] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, masterId));
  if (!master) return null;
  const overrides = master.rrule ? await db.select().from(calendarEvents).where(eq(calendarEvents.parentId, masterId)) : [];
  return { events: [master, ...overrides], attendees: await attendeesOf([masterId]) };
}

/** Sends the series' current state to its outside attendees, if the viewer organizes it. */
async function announce(v: CalendarViewer, masterId: string, extra: { removed?: string[] } = {}) {
  if (!v.userId) return;
  const snap = await seriesSnapshot(masterId);
  if (!snap || snap.events[0].organizerUserId !== v.userId) return;
  await notifyAttendees({ orgId: v.orgId, actorUserId: v.userId, method: "REQUEST", ...snap });
  if (extra.removed?.length)
    await notifyAttendees({ orgId: v.orgId, actorUserId: v.userId, method: "CANCEL", ...snap, onlyEmails: extra.removed });
}

export async function createEvent(v: CalendarViewer, input: EventInput): Promise<EventView> {
  const calendarId = input.calendarId ?? (v.userId ? (await personalCalendar(v.orgId, v.userId)).id : null);
  if (!calendarId) throw new HttpError(422, "Choose a calendar");
  await requireCalendar(v, calendarId, "edit");
  const id = crypto.randomUUID();
  const timezone = input.timezone ?? (await viewerZone(v));
  const attendees = input.attendees ?? [];
  const organizer = attendees.length && v.userId ? await organizerAddress(v) : null;
  const rows = await attendeeRows(v, id, attendees, [], organizer);
  const defaultReminder = (await getPrefs(v.userId)).defaultReminder;
  await db.batch([
    db.insert(calendarEvents).values({
      id,
      orgId: v.orgId,
      calendarId,
      uid: `${id}@workinbox.io`,
      title: input.title ?? "",
      description: input.description ?? "",
      location: input.location ?? "",
      url: input.url ?? "",
      allDay: input.allDay ?? false,
      timezone,
      ...seriesFields(input.start, input.end, timezone, input.allDay ?? false, input.rrule ?? null, []),
      status: input.status ?? "confirmed",
      busy: input.busy ?? !(input.allDay ?? false),
      organizerEmail: organizer,
      organizerUserId: organizer ? v.userId : null,
      reminders: input.reminders ?? (defaultReminder !== null && !input.allDay ? [defaultReminder] : []),
      createdBy: v.userId || null,
    }),
    ...(rows.length ? [db.insert(calendarAttendees).values(rows)] : []),
  ]);
  await announce(v, id);
  return getEvent(v, id);
}

function plainPatch(p: EventUpdate) {
  const out: Partial<typeof calendarEvents.$inferInsert> = {};
  for (const k of ["title", "description", "location", "url", "allDay", "timezone", "busy", "status", "reminders", "calendarId"] as const)
    if (p[k] !== undefined) (out as Record<string, unknown>)[k] = p[k];
  return out;
}

/** Replaces the attendee list when given; returns the addresses removed. */
async function replaceAttendees(v: CalendarViewer, master: CalendarEvent, list: AttendeeInput[] | undefined) {
  if (!list) return [];
  const previous = await attendeesOf([master.id]);
  const organizer = master.organizerEmail ?? (list.length && v.userId ? await organizerAddress(v) : null);
  const rows = await attendeeRows(v, master.id, list, previous, organizer);
  await db.batch([
    db.delete(calendarAttendees).where(eq(calendarAttendees.eventId, master.id)),
    ...(rows.length ? [db.insert(calendarAttendees).values(rows)] : []),
    ...(organizer && !master.organizerEmail
      ? [db.update(calendarEvents).set({ organizerEmail: organizer, organizerUserId: v.userId }).where(eq(calendarEvents.id, master.id))]
      : []),
  ]);
  return previous.filter((p) => !rows.some((r) => r.email === p.email)).map((p) => p.email);
}

export async function updateEvent(v: CalendarViewer, id: string, p: EventUpdate): Promise<EventView> {
  const { event } = await requireEvent(v, id, "edit");
  if (p.calendarId && p.calendarId !== event.calendarId) await requireCalendar(v, p.calendarId, "edit");
  const bump = significant(p) ? { sequence: event.sequence + 1 } : {};

  // An override row: just change it.
  if (event.parentId) {
    await db
      .update(calendarEvents)
      .set({ ...plainPatch(p), ...bump, ...(p.start !== undefined ? { startsAt: new Date(p.start) } : {}), ...(p.end !== undefined ? { endsAt: new Date(p.end) } : {}), updatedAt: new Date() })
      .where(eq(calendarEvents.id, id));
    await announce(v, event.parentId);
    return getEvent(v, id);
  }

  const occurrence = p.occurrence;
  const scope = !event.rrule ? "all" : (p.scope ?? "all");
  if (scope !== "all" && occurrence === undefined) throw new HttpError(422, "Say which occurrence to change");

  if (scope === "this") {
    const [existing] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.parentId, id), eq(calendarEvents.originalStart, new Date(occurrence!))));
    const length = event.endsAt.getTime() - event.startsAt.getTime();
    const start = p.start ?? existing?.startsAt.getTime() ?? occurrence!;
    const end = p.end ?? existing?.endsAt.getTime() ?? start + length;
    if (existing) {
      await db
        .update(calendarEvents)
        .set({ ...plainPatch(p), calendarId: event.calendarId, startsAt: new Date(start), endsAt: new Date(end), sequence: event.sequence + 1, updatedAt: new Date() })
        .where(eq(calendarEvents.id, existing.id));
    } else {
      const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = event;
      await db.insert(calendarEvents).values({
        ...copy,
        ...plainPatch(p),
        calendarId: event.calendarId,
        rrule: null,
        exdates: [],
        recurUntil: null,
        parentId: id,
        originalStart: new Date(occurrence!),
        startsAt: new Date(start),
        endsAt: new Date(end),
        sequence: event.sequence + 1,
      });
    }
    await announce(v, id);
    return getEvent(v, id);
  }

  if (scope === "following" && occurrence! > event.startsAt.getTime()) {
    const series = { startsAt: event.startsAt.getTime(), endsAt: event.endsAt.getTime(), timezone: event.timezone, allDay: event.allDay, rrule: event.rrule!, exdates: event.exdates };
    const { before, after } = splitRule(series, occurrence!);
    const length = series.endsAt - series.startsAt;
    const start = p.start ?? occurrence!;
    const end = p.end ?? start + length;
    const newId = crypto.randomUUID();
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = event;
    const timezone = p.timezone ?? event.timezone;
    const rule = p.rrule === undefined ? after : p.rrule;
    const attendees = await attendeesOf([id]);
    await db.batch([
      db
        .update(calendarEvents)
        .set({ ...seriesFields(series.startsAt, series.endsAt, event.timezone, event.allDay, before, event.exdates.filter((x) => x < occurrence!)), sequence: event.sequence + 1, updatedAt: new Date() })
        .where(eq(calendarEvents.id, id)),
      db.delete(calendarEvents).where(and(eq(calendarEvents.parentId, id), gte(calendarEvents.originalStart, new Date(occurrence!)))),
      db.insert(calendarEvents).values({
        ...copy,
        ...plainPatch(p),
        id: newId,
        uid: `${newId}@workinbox.io`,
        timezone,
        ...seriesFields(start, end, timezone, p.allDay ?? event.allDay, rule, event.exdates.filter((x) => x >= occurrence!)),
        sequence: 0,
      }),
      ...(attendees.length ? [db.insert(calendarAttendees).values(attendees.map((a) => ({ ...a, eventId: newId })))] : []),
    ]);
    const removed = await replaceAttendees(v, { ...event, id: newId }, p.attendees);
    await announce(v, id);
    await announce(v, newId, { removed });
    return getEvent(v, newId);
  }

  // The whole event or series. A series moves by how far its occurrence was moved.
  const shift = p.start !== undefined ? p.start - (occurrence ?? event.startsAt.getTime()) : 0;
  const start = event.startsAt.getTime() + shift;
  const end = p.end !== undefined && p.start !== undefined ? start + (p.end - p.start) : p.end !== undefined ? start + (p.end - (occurrence ?? event.startsAt.getTime())) : event.endsAt.getTime() + shift;
  const rrule = p.rrule === undefined ? event.rrule : p.rrule;
  const timezone = p.timezone ?? event.timezone;
  await db.batch([
    db
      .update(calendarEvents)
      .set({ ...plainPatch(p), ...bump, ...seriesFields(start, end, timezone, p.allDay ?? event.allDay, rrule, rrule ? event.exdates : []), updatedAt: new Date() })
      .where(eq(calendarEvents.id, id)),
    // Overrides keep their own times; a calendar move takes them along, a dropped rule drops them.
    ...(p.calendarId ? [db.update(calendarEvents).set({ calendarId: p.calendarId }).where(eq(calendarEvents.parentId, id))] : []),
    ...(!rrule ? [db.delete(calendarEvents).where(eq(calendarEvents.parentId, id))] : []),
  ]);
  const removed = await replaceAttendees(v, event, p.attendees);
  await announce(v, id, { removed });
  return getEvent(v, id);
}

export async function deleteEvent(v: CalendarViewer, id: string, d: EventDelete) {
  const { event } = await requireEvent(v, id, "edit");
  const masterId = event.parentId ?? id;
  const snap = await seriesSnapshot(masterId);
  if (!snap) throw new HttpError(404, "Not found");
  const master = snap.events[0];
  const occurrence = event.parentId ? event.originalStart!.getTime() : d.occurrence;
  const scope = !master.rrule ? "all" : event.parentId && d.scope === "all" ? "all" : d.scope;
  const organizes = !!v.userId && master.organizerUserId === v.userId;
  const cancel = (extra: { occurrence?: number } = {}) =>
    organizes ? notifyAttendees({ orgId: v.orgId, actorUserId: v.userId, method: "CANCEL", ...snap, ...extra }) : Promise.resolve();

  if (scope === "all" || (scope === "following" && occurrence !== undefined && occurrence <= master.startsAt.getTime())) {
    await db.batch([db.delete(calendarEvents).where(eq(calendarEvents.parentId, masterId)), db.delete(calendarEvents).where(eq(calendarEvents.id, masterId))]);
    await cancel();
    return master;
  }
  if (occurrence === undefined) throw new HttpError(422, "Say which occurrence to delete");
  if (scope === "this") {
    await db.batch([
      db.update(calendarEvents).set({ exdates: [...new Set([...master.exdates, occurrence])], sequence: master.sequence + 1, updatedAt: new Date() }).where(eq(calendarEvents.id, masterId)),
      db.delete(calendarEvents).where(and(eq(calendarEvents.parentId, masterId), eq(calendarEvents.originalStart, new Date(occurrence)))),
    ]);
    await cancel({ occurrence });
    return master;
  }
  const series = { startsAt: master.startsAt.getTime(), endsAt: master.endsAt.getTime(), timezone: master.timezone, allDay: master.allDay, rrule: master.rrule!, exdates: master.exdates };
  const { before } = splitRule(series, occurrence);
  await db.batch([
    db
      .update(calendarEvents)
      .set({ ...seriesFields(series.startsAt, series.endsAt, master.timezone, master.allDay, before, master.exdates.filter((x) => x < occurrence)), sequence: master.sequence + 1, updatedAt: new Date() })
      .where(eq(calendarEvents.id, masterId)),
    db.delete(calendarEvents).where(and(eq(calendarEvents.parentId, masterId), gte(calendarEvents.originalStart, new Date(occurrence)))),
  ]);
  await announce(v, masterId);
  return master;
}

/** The viewer's answer to an invitation; an outside organizer gets it by mail. */
export async function rsvp(v: CalendarViewer, id: string, status: "accepted" | "declined" | "tentative") {
  const { event, attendee } = await requireEvent(v, id);
  if (!attendee) throw new HttpError(403, "You're not invited to this event");
  const masterId = event.parentId ?? event.id;
  await db
    .update(calendarAttendees)
    .set({ status })
    .where(and(eq(calendarAttendees.eventId, masterId), eq(calendarAttendees.email, attendee.email)));
  const [master] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, masterId));
  if (master && master.organizerEmail && !master.organizerUserId) await sendReply(v.orgId, v.userId, master, { ...attendee, status });
  return getEvent(v, id);
}
