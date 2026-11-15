/**
 * Meeting notes: "Meeting notes" on an event makes a note shared with the people in it (attendees in the org, the
 * organizer and whoever made the event), one per event or per occurrence of a series (calendar_event_notes).
 * Anyone who can open the event can open its note: opening adds them to the note's people.
 */
import { and, calendarEventNotes, calendarEvents, calendarAttendees, db, eq, inArray, member, noteAccess, notes } from "@/db";
import { HttpError } from "@/lib/server/api";
import { appLocale, t } from "@/lib/i18n/panel";
import { plainText } from "@/lib/notes/access";
import { markdownToValue } from "@/lib/notes/plate";
import { requireEvent, type CalendarViewer } from "./access";

/** The series' master (or single event) and which occurrence: the key of its note. */
async function noteKey(v: CalendarViewer, eventId: string, occurrence: number | null) {
  const { event } = await requireEvent(v, eventId);
  const [master] = event.parentId ? await db.select().from(calendarEvents).where(eq(calendarEvents.id, event.parentId)) : [event];
  if (!master) throw new HttpError(404, "Not found");
  const occ = event.parentId ? event.originalStart!.getTime() : master.rrule ? (occurrence ?? 0) : 0;
  return { event, master, occ };
}

const linked = (eventId: string, occ: number) =>
  db
    .select({ id: notes.id, title: notes.title, ownerId: notes.ownerId, sharing: notes.sharing })
    .from(calendarEventNotes)
    .innerJoin(notes, eq(notes.id, calendarEventNotes.noteId))
    .where(and(eq(calendarEventNotes.eventId, eventId), eq(calendarEventNotes.occurrence, occ)))
    .then((r) => r[0]);

/** The event's meeting note; `create` opens it: makes it when there's none, adds the viewer to its people. */
export async function meetingNote(v: CalendarViewer, eventId: string, occurrence: number | null, create: boolean) {
  const { event, master, occ } = await noteKey(v, eventId, occurrence);
  const found = await linked(master.id, occ);
  if (found) {
    // People who can open the event and came later (added to it, or on its calendar) get the note too.
    if (create && v.userId && found.sharing === "people" && found.ownerId !== v.userId)
      await db.insert(noteAccess).values({ noteId: found.id, userId: v.userId, role: "edit" }).onConflictDoNothing();
    return { id: found.id, title: found.title, created: false };
  }
  if (!create) return null;
  if (!v.userId) throw new HttpError(403, "Sign in to take meeting notes");

  const start = occ || event.startsAt.getTime();
  const when = new Intl.DateTimeFormat(appLocale(), { dateStyle: "medium", timeZone: event.timezone }).format(start);
  const title = `${event.title || t("Meeting")} · ${when}`.slice(0, 200);
  const value = markdownToValue(`## ${t("Agenda")}\n\n## ${t("Notes")}\n\n## ${t("Action items")}\n`);
  const invited = await db.select({ userId: calendarAttendees.userId }).from(calendarAttendees).where(eq(calendarAttendees.eventId, master.id));
  const ids = [...new Set([...invited.map((a) => a.userId), master.organizerUserId, master.createdBy])].filter((id): id is string => !!id && id !== v.userId);
  // Only people still in the organization.
  const people = ids.length
    ? (await db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, v.orgId), inArray(member.userId, ids)))).map((m) => m.userId)
    : [];

  const noteId = crypto.randomUUID();
  await db.batch([
    db.insert(notes).values({ id: noteId, orgId: v.orgId, ownerId: v.userId, title, sharing: "people", content: value, text: plainText(value), createdBy: v.userId, updatedBy: v.userId }),
    ...(people.length ? [db.insert(noteAccess).values(people.map((userId) => ({ noteId, userId, role: "edit" as const })))] : []),
    db.insert(calendarEventNotes).values({ eventId: master.id, occurrence: occ, noteId }).onConflictDoNothing(),
  ]);
  const won = await linked(master.id, occ);
  // Someone else made it at the same moment: keep theirs.
  if (won && won.id !== noteId) {
    await db.delete(notes).where(eq(notes.id, noteId));
    return meetingNote(v, eventId, occurrence, true);
  }
  return { id: noteId, title, created: true };
}

/** The meeting a note was made for, for its link back (`event` = the calendar's ?event= key). */
export async function noteMeeting(noteId: string) {
  const [link] = await db
    .select({ eventId: calendarEventNotes.eventId, occurrence: calendarEventNotes.occurrence, title: calendarEvents.title, startsAt: calendarEvents.startsAt })
    .from(calendarEventNotes)
    .innerJoin(calendarEvents, eq(calendarEvents.id, calendarEventNotes.eventId))
    .where(eq(calendarEventNotes.noteId, noteId));
  if (!link) return null;
  if (!link.occurrence) return { event: link.eventId, title: link.title, start: link.startsAt.getTime() };
  // An occurrence moved or renamed on its own is its override row.
  const [override] = await db
    .select({ id: calendarEvents.id, title: calendarEvents.title, startsAt: calendarEvents.startsAt })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.parentId, link.eventId), eq(calendarEvents.originalStart, new Date(link.occurrence))));
  return override
    ? { event: override.id, title: override.title, start: override.startsAt.getTime() }
    : { event: `${link.eventId}:${link.occurrence}`, title: link.title, start: link.occurrence };
}
