/** Calendars: each person's own (made on first use) plus shared ones like "Holidays", shared like notes. */
import { and, calendarAccess, calendars, db, eq, inArray, member, user } from "@/db";
import { HttpError } from "@/lib/server/api";
import type { NoteShare } from "@/lib/validation-notes";
import { syncCalendar } from "./import";
import { requireCalendar, visibleCalendars, type Calendar, type CalendarRole, type CalendarViewer } from "./access";

export interface CalendarView {
  id: string;
  name: string;
  color: string;
  personal: boolean;
  ownerId: string | null;
  sharing: "private" | "people" | "team";
  teamRole: "view" | "edit";
  role: CalendarRole;
  manage: boolean;
  people: { userId: string; role: "view" | "edit"; name: string; email: string }[];
  /** Synced from an .ics address (Google Calendar…), read-only; the address itself stays on the server. */
  sync: { at: number | null; error: string | null } | null;
}

async function withPeople(v: CalendarViewer, list: (Calendar & { role: CalendarRole; manage?: boolean })[]): Promise<CalendarView[]> {
  const ids = list.map((c) => c.id);
  const grants = ids.length
    ? await db
        .select({ calendarId: calendarAccess.calendarId, userId: calendarAccess.userId, role: calendarAccess.role, name: user.name, email: user.email })
        .from(calendarAccess)
        .innerJoin(user, eq(user.id, calendarAccess.userId))
        .where(inArray(calendarAccess.calendarId, ids.slice(0, 90)))
    : [];
  return list.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    personal: c.personal,
    ownerId: c.ownerId,
    sharing: c.sharing,
    teamRole: c.teamRole,
    role: c.sourceUrl ? "view" : c.role,
    manage: c.manage ?? c.role === "owner",
    sync: c.sourceUrl ? { at: c.syncedAt?.getTime() ?? null, error: c.syncError } : null,
    people: grants.filter((g) => g.calendarId === c.id).map(({ calendarId: _, ...g }) => g),
  }));
}

export async function listCalendars(v: CalendarViewer) {
  return withPeople(v, await visibleCalendars(v));
}

export async function getCalendar(v: CalendarViewer, id: string) {
  const { calendar, role, manage } = await requireCalendar(v, id);
  return (await withPeople(v, [{ ...calendar, role, manage }]))[0];
}

export async function createCalendar(v: CalendarViewer, input: { name: string; color: string; url?: string }) {
  const [made] = await db
    .insert(calendars)
    .values({ orgId: v.orgId, ownerId: v.userId || null, name: input.name, color: input.color, sharing: v.userId ? "private" : "team", sourceUrl: input.url ?? null })
    .returning();
  if (input.url) {
    const error = await syncCalendar(made);
    if (error) {
      await db.delete(calendars).where(eq(calendars.id, made.id));
      throw new HttpError(422, error);
    }
  }
  return getCalendar(v, made.id);
}

export async function updateCalendar(v: CalendarViewer, id: string, input: { name?: string; color?: string }) {
  await requireCalendar(v, id, "manage");
  await db.update(calendars).set(input).where(eq(calendars.id, id));
  return getCalendar(v, id);
}

export async function deleteCalendar(v: CalendarViewer, id: string) {
  const { calendar } = await requireCalendar(v, id, "manage");
  if (calendar.personal) throw new HttpError(409, "A person's own calendar can't be deleted");
  await db.delete(calendars).where(eq(calendars.id, id));
  return calendar;
}

export async function shareCalendar(v: CalendarViewer, id: string, input: NoteShare) {
  const { calendar } = await requireCalendar(v, id, "manage");
  if (!v.userId && input.sharing !== "team") throw new HttpError(422, "API keys can only keep calendars shared with the team");
  const people = input.sharing === "people" ? input.people.filter((p) => p.userId !== calendar.ownerId) : [];
  if (people.length) {
    const ids = people.map((p) => p.userId);
    const members = await db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, v.orgId), inArray(member.userId, ids)));
    if (members.length !== new Set(ids).size) throw new HttpError(422, "Share with members of this organization only");
  }
  await db.batch([
    db.update(calendars).set({ sharing: input.sharing, teamRole: input.teamRole }).where(eq(calendars.id, id)),
    db.delete(calendarAccess).where(eq(calendarAccess.calendarId, id)),
    ...(people.length ? [db.insert(calendarAccess).values(people.map((p) => ({ calendarId: id, userId: p.userId, role: p.role })))] : []),
  ]);
  return getCalendar(v, id);
}
