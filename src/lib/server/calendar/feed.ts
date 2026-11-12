/**
 * Read-only subscription feeds: `/cal/<token>.ics` serves a person's calendars (what they may see, plus events
 * they're invited to) to Google, Apple or Outlook. The token is the only credential; rotating it cuts old links.
 */
import { and, calendarAttendees, calendarEvents, calendarFeeds, db, eq, gt, inArray, isNull, member, or } from "@/db";
import { toIcs } from "@/lib/calendar/ics";
import { randomBase64Url } from "@/lib/server/crypto";
import { toRole } from "@/lib/server/roles";
import { visibleCalendars, type CalendarEvent, type CalendarViewer } from "./access";
import { icsOf, type Attendee } from "./invites";

const HISTORY = 90 * 86_400_000;

export async function feedToken(v: CalendarViewer) {
  const [row] = await db.select().from(calendarFeeds).where(and(eq(calendarFeeds.orgId, v.orgId), eq(calendarFeeds.userId, v.userId)));
  return row?.token ?? null;
}

/** A new token (the old link stops working). */
export async function rotateFeed(v: CalendarViewer) {
  const token = randomBase64Url(16);
  await db.batch([
    db.delete(calendarFeeds).where(and(eq(calendarFeeds.orgId, v.orgId), eq(calendarFeeds.userId, v.userId))),
    db.insert(calendarFeeds).values({ token, orgId: v.orgId, userId: v.userId }),
  ]);
  return token;
}

const chunks = <T,>(list: T[], size = 90) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** The feed's .ics, or null for unknown tokens and people who left the org. */
export async function feedIcs(token: string, now = Date.now()): Promise<string | null> {
  if (!/^[\w-]{16,40}$/.test(token)) return null;
  const [feed] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.token, token));
  if (!feed) return null;
  const [m] = await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, feed.orgId), eq(member.userId, feed.userId)));
  if (!m) return null;
  const v: CalendarViewer = { orgId: feed.orgId, userId: feed.userId, role: toRole(m.role) };
  const calendars = await visibleCalendars(v);
  const e = calendarEvents;
  const since = new Date(now - HISTORY);
  const recent = or(gt(e.endsAt, since), isNull(e.recurUntil), gt(e.recurUntil, since));
  const invited = db.select({ id: calendarAttendees.eventId }).from(calendarAttendees).where(eq(calendarAttendees.userId, feed.userId));
  const masters: CalendarEvent[] = [];
  for (const part of chunks(calendars.map((c) => c.id)))
    masters.push(...(await db.select().from(e).where(and(eq(e.orgId, feed.orgId), isNull(e.parentId), inArray(e.calendarId, part), recent))));
  const seen = new Set(masters.map((x) => x.id));
  for (const x of await db.select().from(e).where(and(eq(e.orgId, feed.orgId), isNull(e.parentId), inArray(e.id, invited), recent)))
    if (!seen.has(x.id)) masters.push(x);
  const ids = masters.map((x) => x.id);
  const overrides: CalendarEvent[] = [];
  const attendees: Attendee[] = [];
  for (const part of chunks(ids)) {
    overrides.push(...(await db.select().from(e).where(inArray(e.parentId, part))));
    attendees.push(...(await db.select().from(calendarAttendees).where(inArray(calendarAttendees.eventId, part))));
  }
  const of = (id: string) => attendees.filter((a) => a.eventId === id);
  const events = masters
    .filter((x) => x.status !== "cancelled")
    .flatMap((x) => [icsOf(x, x, of(x.id)), ...overrides.filter((o) => o.parentId === x.id).map((o) => icsOf(o, x, of(x.id)))]);
  return toIcs(events, "PUBLISH", calendars.find((c) => c.personal && c.ownerId === feed.userId)?.name);
}
