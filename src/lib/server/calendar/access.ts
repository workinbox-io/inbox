/**
 * Which calendars and events a viewer may see. Calendars follow the notes' rules (lib/notes/access.ts: private,
 * people, team); an event is also open (read-only, plus RSVP) to the people invited to it. Every calendar query
 * goes through `visibleCalendars`, `requireCalendar` or `requireEvent`.
 */
import { and, calendarAccess, calendarAttendees, calendarEvents, calendars, db, eq, inArray, or, user } from "@/db";
import { atLeast, canManageNote, noteRole, type NoteRole } from "@/lib/notes/access";
import { HttpError, type HandlerContext } from "@/lib/server/api";
import { canManage, type OrgRole } from "@/lib/server/roles";
import { t } from "@/lib/i18n/panel";

export type Calendar = typeof calendars.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type CalendarRole = NoteRole;

export interface CalendarViewer {
  orgId: string;
  /** Empty for API keys: they see team calendars only. */
  userId: string;
  role: OrgRole;
}

export function calendarViewer(ctx: Pick<HandlerContext, "locals" | "orgId" | "role">): CalendarViewer {
  if (ctx.locals.apiKeyId) return { orgId: ctx.orgId, role: ctx.role, userId: "" };
  const u = ctx.locals.user;
  if (!u) throw new HttpError(401, "Unauthorized");
  return { orgId: ctx.orgId, userId: u.id, role: ctx.role };
}

const facts = (v: CalendarViewer) => ({ userId: v.userId, manager: canManage(v.role) });

export const calendarRole = (c: Calendar, v: CalendarViewer, grant?: "view" | "edit" | null) => noteRole(c, facts(v), grant);
export const managesCalendar = (c: Calendar, v: CalendarViewer, role: CalendarRole | null) => canManageNote(c, facts(v), role);

/** The viewer's own calendar, made on first use (also for people added before the calendar existed). */
export async function personalCalendar(orgId: string, userId: string): Promise<Calendar> {
  const [found] = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.orgId, orgId), eq(calendars.ownerId, userId), eq(calendars.personal, true)));
  if (found) return found;
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const [made] = await db
    .insert(calendars)
    .values({ orgId, ownerId: userId, name: u?.name || t("Calendar"), personal: true, sharing: "private", color: "blue" })
    .returning();
  return made;
}

/** Calendars the viewer may open, each with their role. */
export async function visibleCalendars(v: CalendarViewer): Promise<(Calendar & { role: CalendarRole })[]> {
  if (v.userId) await personalCalendar(v.orgId, v.userId);
  const team = eq(calendars.sharing, "team");
  const where = v.userId
    ? or(
        eq(calendars.ownerId, v.userId),
        team,
        and(
          eq(calendars.sharing, "people"),
          inArray(calendars.id, db.select({ id: calendarAccess.calendarId }).from(calendarAccess).where(eq(calendarAccess.userId, v.userId))),
        ),
      )
    : team;
  const rows = await db.select().from(calendars).where(and(eq(calendars.orgId, v.orgId), where));
  const grants = await grantsFor(v, rows.map((r) => r.id));
  return rows
    .map((c) => ({ ...c, role: calendarRole(c, v, grants.get(c.id)) }))
    .filter((c): c is Calendar & { role: CalendarRole } => !!c.role)
    .sort((a, b) => Number(b.personal && b.ownerId === v.userId) - Number(a.personal && a.ownerId === v.userId) || a.name.localeCompare(b.name));
}

export async function grantsFor(v: CalendarViewer, ids: string[]) {
  if (!v.userId || !ids.length) return new Map<string, "view" | "edit">();
  const rows = await db
    .select({ id: calendarAccess.calendarId, role: calendarAccess.role })
    .from(calendarAccess)
    .where(and(eq(calendarAccess.userId, v.userId), inArray(calendarAccess.calendarId, ids)));
  return new Map(rows.map((r) => [r.id, r.role]));
}

/** 404 when the viewer can't open it, 403 when they lack `need` ("manage": rename, share, delete). */
export async function requireCalendar(v: CalendarViewer, id: string, need: CalendarRole | "manage" = "view") {
  const [calendar] = await db.select().from(calendars).where(and(eq(calendars.id, id), eq(calendars.orgId, v.orgId)));
  if (!calendar) throw new HttpError(404, "Not found");
  const role = calendarRole(calendar, v, (await grantsFor(v, [id])).get(id) ?? null);
  if (!role) throw new HttpError(404, "Not found");
  const manage = managesCalendar(calendar, v, role);
  if (need === "manage" ? !manage : !atLeast(role, need)) throw new HttpError(403, "You can't change this calendar");
  if (calendar.sourceUrl && need !== "view" && need !== "manage") throw new HttpError(403, "This calendar is synced from another app: change its events there");
  return { calendar, role, manage };
}

/**
 * The event (a series' master for overrides' ids too) with the viewer's role: their role in its calendar, or
 * "view" when they're invited. `attendee` is the viewer's own attendee row, for RSVP.
 */
export async function requireEvent(v: CalendarViewer, id: string, need: CalendarRole = "view") {
  const [event] = await db.select().from(calendarEvents).where(and(eq(calendarEvents.id, id), eq(calendarEvents.orgId, v.orgId)));
  if (!event) throw new HttpError(404, "Not found");
  const [calendar] = await db.select().from(calendars).where(eq(calendars.id, event.calendarId));
  let role = calendar ? calendarRole(calendar, v, (await grantsFor(v, [calendar.id])).get(calendar.id) ?? null) : null;
  // Subscribed calendars are read-only here: their events are rewritten on every sync.
  if (role && calendar.sourceUrl) role = "view";
  const [attendee] = v.userId
    ? await db
        .select()
        .from(calendarAttendees)
        .where(and(eq(calendarAttendees.eventId, event.parentId ?? event.id), eq(calendarAttendees.userId, v.userId)))
    : [];
  if (!role && attendee) role = "view";
  if (!role) throw new HttpError(404, "Not found");
  if (!atLeast(role, need)) throw new HttpError(403, "You can't change this event");
  return { event, calendar: calendar!, role, attendee: attendee ?? null };
}
