/**
 * Event reminders (every minute): pushes "<title> in N min" to the calendar's owner and to invited people of the
 * org who haven't declined. The push carries ids only; the service worker reads the title with the session.
 */
import { and, calendarAttendees, calendarEvents, calendarReminderLog, calendars, db, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "@/db";
import { expand } from "@/lib/calendar/recurrence";
import { pushToUser } from "@/lib/server/mail/push";

const MINUTE = 60_000;
/** A reminder missed by a late cron run still goes out this long after its time. */
const GRACE = 2 * MINUTE;
const AHEAD = 2 * 86_400_000;

export async function sendEventReminders(now = Date.now()) {
  const e = calendarEvents;
  const rows = await db
    .select({ event: e, ownerId: calendars.ownerId })
    .from(e)
    .innerJoin(calendars, eq(calendars.id, e.calendarId))
    .where(
      and(
        ne(e.reminders, sql`'[]'`),
        ne(e.status, "cancelled"),
        or(
          and(isNull(e.rrule), gt(e.startsAt, new Date(now - GRACE)), lt(e.startsAt, new Date(now + AHEAD))),
          and(isNotNull(e.rrule), lt(e.startsAt, new Date(now + AHEAD)), or(isNull(e.recurUntil), gt(e.recurUntil, new Date(now - GRACE)))),
        ),
      ),
    );
  if (!rows.length) return purge(now);

  const masters = rows.filter((r) => r.event.rrule).map((r) => r.event.id);
  const overrides = masters.length
    ? await db.select({ parentId: e.parentId, originalStart: e.originalStart }).from(e).where(inArray(e.parentId, masters.slice(0, 90)))
    : [];
  const due: { masterId: string; orgId: string; ownerId: string | null; occurrence: number; minutes: number }[] = [];
  for (const { event, ownerId } of rows) {
    const max = Math.max(...event.reminders);
    const starts = event.rrule
      ? expand(
          { startsAt: event.startsAt.getTime(), endsAt: event.endsAt.getTime(), timezone: event.timezone, allDay: event.allDay, rrule: event.rrule, exdates: event.exdates },
          now - GRACE,
          now + max * MINUTE + MINUTE,
          overrides.filter((o) => o.parentId === event.id).map((o) => o.originalStart!.getTime()),
        ).map((o) => o.originalStart)
      : [event.startsAt.getTime()];
    for (const start of starts)
      for (const minutes of event.reminders) {
        const at = start - minutes * MINUTE;
        if (at <= now && at > now - GRACE)
          due.push({ masterId: event.parentId ?? event.id, orgId: event.orgId, ownerId, occurrence: event.originalStart?.getTime() ?? start, minutes });
      }
  }

  for (const d of due) {
    const invited = await db
      .select({ userId: calendarAttendees.userId, status: calendarAttendees.status })
      .from(calendarAttendees)
      .where(and(eq(calendarAttendees.eventId, d.masterId), isNotNull(calendarAttendees.userId)));
    const people = new Set([...(d.ownerId ? [d.ownerId] : []), ...invited.filter((a) => a.status !== "declined").map((a) => a.userId!)]);
    for (const p of invited) if (p.status === "declined") people.delete(p.userId!);
    for (const userId of people) {
      const key = `${d.masterId}:${d.occurrence}:${d.minutes}:${userId}`;
      const fresh = await db.insert(calendarReminderLog).values({ key }).onConflictDoNothing().returning();
      if (!fresh.length) continue;
      await pushToUser(d.orgId, userId, { kind: "event", eventId: d.masterId, occurrence: d.occurrence, minutes: d.minutes });
    }
  }
  return purge(now);
}

const purge = (now: number) => db.delete(calendarReminderLog).where(lt(calendarReminderLog.sentAt, new Date(now - AHEAD)));
