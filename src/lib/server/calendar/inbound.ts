/**
 * Invitations arriving by mail (iMIP) into a person's mailbox: REQUEST from an outside organizer lands in their own
 * calendar (stored once per org, by UID), CANCEL from that organizer cancels it, REPLY from an attendee updates
 * their answer on an event the mailbox's owner organizes. Called by handleOrgMail for non-spam mail.
 */
import { and, calendarAttendees, calendarEvents, db, eq, inArray, isNull, type mailboxes } from "@/db";
import { parseIcs, type IcsEvent } from "@/lib/calendar/ics";
import { seriesEnd } from "@/lib/calendar/recurrence";
import { personalCalendar } from "./access";
import { getPrefs, orgUsersByEmail } from "./events";

type Mailbox = typeof mailboxes.$inferSelect;

export interface CalendarAttachment {
  mimeType: string;
  content: ArrayBuffer | Uint8Array | string;
}

const text = (c: CalendarAttachment["content"]) => (typeof c === "string" ? c : new TextDecoder().decode(c));

export const isCalendarFile = (mimeType: string, filename?: string | null) =>
  /^(text|application)\/(calendar|ics)\b/i.test(mimeType) || /\.ics$/i.test(filename ?? "");

function master(rows: IcsEvent[]) {
  return rows.find((e) => e.recurrenceId === null) ?? null;
}

const fields = (e: IcsEvent) => ({
  title: e.title.slice(0, 500),
  description: e.description.slice(0, 20_000),
  location: e.location.slice(0, 500),
  url: /^https?:\/\//i.test(e.url) ? e.url.slice(0, 2000) : "",
  startsAt: new Date(e.start),
  endsAt: new Date(e.end),
  allDay: e.allDay,
  timezone: e.timezone,
  status: e.status,
  busy: e.busy,
  sequence: e.sequence,
});

export async function handleCalendarMail(mailbox: Mailbox, _messageId: string, attachments: CalendarAttachment[], fromEmail: string) {
  if (mailbox.kind !== "personal" || !mailbox.userId) return;
  const tz = (await getPrefs(mailbox.userId)).timezones[0] ?? "UTC";
  const from = fromEmail.toLowerCase();
  for (const a of attachments) {
    let parsed: ReturnType<typeof parseIcs>;
    try {
      parsed = parseIcs(text(a.content), tz);
    } catch {
      continue;
    }
    const byUid = new Map<string, IcsEvent[]>();
    for (const e of parsed.events) byUid.set(e.uid, [...(byUid.get(e.uid) ?? []), e]);
    for (const [uid, rows] of byUid) {
      if (parsed.method === "REPLY") await reply(mailbox, uid, rows, from);
      else if (parsed.method === "REQUEST") await request(mailbox, uid, rows, from);
      else if (parsed.method === "CANCEL") await cancel(mailbox, uid, rows, from);
    }
  }
}

async function findMaster(orgId: string, uid: string) {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.uid, uid), isNull(calendarEvents.parentId)));
  return row ?? null;
}

/** An attendee answered one of our owner's events: only their own row, and only if they're on the list. */
async function reply(mailbox: Mailbox, uid: string, rows: IcsEvent[], from: string) {
  const event = await findMaster(mailbox.orgId, uid);
  if (!event || event.organizerUserId !== mailbox.userId) return;
  const answer = rows.flatMap((r) => r.attendees).find((x) => x.email === from);
  if (!answer || answer.status === "needs-action") return;
  await db
    .update(calendarAttendees)
    .set({ status: answer.status })
    .where(and(eq(calendarAttendees.eventId, event.id), eq(calendarAttendees.email, from)));
}

/** An outside organizer's invitation or update. */
async function request(mailbox: Mailbox, uid: string, rows: IcsEvent[], from: string) {
  const first = master(rows) ?? rows[0];
  if (first.organizer?.email !== from) return;
  const existing = await findMaster(mailbox.orgId, uid);
  // Our own people's events are seen directly; a stale update never overwrites a newer one.
  if (existing?.organizerUserId) return;
  // Someone else's event with the same UID: only its own organizer updates it.
  if (existing && existing.organizerEmail?.toLowerCase() !== from) return;
  const main = master(rows);
  if (existing && main && main.sequence < existing.sequence) return;

  if (!main) {
    // Only changed occurrences: they need the series already here.
    if (!existing) return;
    for (const o of rows) await upsertOverride(existing, o);
    return;
  }

  const id = existing?.id ?? crypto.randomUUID();
  const calendarId = existing?.calendarId ?? (await personalCalendar(mailbox.orgId, mailbox.userId!)).id;
  const until = main.rrule
    ? seriesEnd({ startsAt: main.start, endsAt: main.end, timezone: main.timezone, allDay: main.allDay, rrule: main.rrule, exdates: main.exdates })
    : null;
  const previous = existing ? await db.select().from(calendarAttendees).where(eq(calendarAttendees.eventId, id)) : [];
  const users = await orgUsersByEmail(mailbox.orgId, main.attendees.map((x) => x.email));
  const bumped = !existing || main.sequence > existing.sequence;
  const attendees = [...new Map(main.attendees.map((x) => [x.email, x])).values()].map((x) => {
    const userId = users.get(x.email) ?? null;
    const before = previous.find((p) => p.email === x.email);
    // Our people's answers stand until the organizer changes the event.
    const status = userId && before && !bumped ? before.status : x.status;
    return { eventId: id, email: x.email, name: (x.name ?? "").slice(0, 200), userId, status, optional: !!x.optional };
  });
  const row = {
    ...fields(main),
    rrule: main.rrule,
    exdates: main.exdates,
    recurUntil: until === null ? null : new Date(until),
    organizerEmail: from,
    organizerUserId: null,
    updatedAt: new Date(),
  };
  await db.batch([
    existing
      ? db.update(calendarEvents).set(row).where(eq(calendarEvents.id, id))
      : db.insert(calendarEvents).values({ ...row, id, orgId: mailbox.orgId, calendarId, uid, reminders: [] }),
    db.delete(calendarAttendees).where(eq(calendarAttendees.eventId, id)),
    ...(attendees.length ? [db.insert(calendarAttendees).values(attendees)] : []),
    // The organizer sends the whole series: its overrides are replaced by the ones in this file.
    db.delete(calendarEvents).where(eq(calendarEvents.parentId, id)),
  ]);
  const saved = (await findMaster(mailbox.orgId, uid))!;
  for (const o of rows.filter((r) => r.recurrenceId !== null)) await upsertOverride(saved, o);
}

async function upsertOverride(series: typeof calendarEvents.$inferSelect, o: IcsEvent) {
  if (o.recurrenceId === null) return;
  await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.parentId, series.id), eq(calendarEvents.originalStart, new Date(o.recurrenceId))));
  await db.insert(calendarEvents).values({
    ...fields(o),
    orgId: series.orgId,
    calendarId: series.calendarId,
    uid: series.uid,
    parentId: series.id,
    originalStart: new Date(o.recurrenceId),
    organizerEmail: series.organizerEmail,
    reminders: series.reminders,
  });
}

/** The organizer called it off: one occurrence (RECURRENCE-ID) or the whole event. */
async function cancel(mailbox: Mailbox, uid: string, rows: IcsEvent[], from: string) {
  const event = await findMaster(mailbox.orgId, uid);
  if (!event || event.organizerUserId || event.organizerEmail !== from) return;
  const occurrences = rows.flatMap((r) => (r.recurrenceId !== null ? [r.recurrenceId] : []));
  if (occurrences.length && event.rrule && !rows.some((r) => r.recurrenceId === null)) {
    await db.batch([
      db
        .update(calendarEvents)
        .set({ exdates: [...new Set([...event.exdates, ...occurrences])], updatedAt: new Date() })
        .where(eq(calendarEvents.id, event.id)),
      db
        .delete(calendarEvents)
        .where(and(eq(calendarEvents.parentId, event.id), inArray(calendarEvents.originalStart, occurrences.map((x) => new Date(x))))),
    ]);
    return;
  }
  await db.update(calendarEvents).set({ status: "cancelled", updatedAt: new Date() }).where(eq(calendarEvents.id, event.id));
}

export interface MailInvite {
  method: string | null;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  timezone: string;
  location: string;
  url: string;
  organizer: string | null;
  /** Our copy of the event, when it's in the org's calendars. */
  eventId: string | null;
  /** The viewer's answer, when they're on the attendee list. */
  myStatus: "needs-action" | "accepted" | "declined" | "tentative" | null;
}

/** The invitation carried by a stored message's .ics file, for the card above its body. Null when there's none. */
export async function mailInvite(orgId: string, userId: string, files: { url: string; filename: string; mediaType: string }[]): Promise<MailInvite | null> {
  const file = files.find((f) => isCalendarFile(f.mediaType, f.filename));
  if (!file) return null;
  const { env } = await import("cloudflare:workers");
  const { ATTACHMENT_URL_PREFIX } = await import("@/lib/uploads");
  if (!file.url.startsWith(ATTACHMENT_URL_PREFIX)) return null;
  const object = await env.FILES.get(file.url.slice(ATTACHMENT_URL_PREFIX.length));
  if (!object) return null;
  let parsed: ReturnType<typeof parseIcs>;
  try {
    parsed = parseIcs(await object.text(), (await getPrefs(userId)).timezones[0] ?? "UTC");
  } catch {
    return null;
  }
  const e = master(parsed.events) ?? parsed.events[0];
  if (!e) return null;
  const event = await findMaster(orgId, e.uid);
  const [me] = event && userId
    ? await db.select({ status: calendarAttendees.status }).from(calendarAttendees).where(and(eq(calendarAttendees.eventId, event.id), eq(calendarAttendees.userId, userId)))
    : [];
  return {
    method: parsed.method,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    timezone: e.timezone,
    location: e.location,
    url: /^https?:\/\//i.test(e.url) ? e.url : "",
    organizer: e.organizer?.email ?? null,
    eventId: event?.id ?? null,
    myStatus: me?.status ?? null,
  };
}
