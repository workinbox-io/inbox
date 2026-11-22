/**
 * iMIP: invitations to people outside the org go out by mail with a text/calendar part (REQUEST, CANCEL), the
 * viewer's answers to outside organizers as REPLY. People in the org see events directly, without mail.
 * Mail leaves through the outbox (queueMailSend) from the person's own mailbox, so limits and undo apply.
 */
import { isDemoOrg } from "@/lib/server/demo/guard";
import { and, db, eq, mailboxes, mailDomains, user, type calendarAttendees } from "@/db";
import { toIcs, type IcsEvent } from "@/lib/calendar/ics";
import { inviteBody, inviteSubject, type InviteKind } from "@/lib/calendar/invite-text";
import { reportError } from "@/lib/server/errors";
import { userLocale, withLocale } from "@/lib/server/i18n";
import type { CalendarEvent } from "./access";

export type Attendee = typeof calendarAttendees.$inferSelect;

export interface InviteChange {
  orgId: string;
  /** Who made the change (sends from their personal mailbox). */
  actorUserId: string;
  method: "REQUEST" | "CANCEL";
  /** A series' master and its overrides (same UID), or the single event; a snapshot when it's being deleted. */
  events: CalendarEvent[];
  /** The master's attendees (overrides share them). */
  attendees: Attendee[];
  /** CANCEL of one occurrence: its original start. */
  occurrence?: number;
  /** Only these addresses (e.g. people just removed get CANCEL, the rest REQUEST). */
  onlyEmails?: string[];
}

/** One stored row as an iCalendar event. */
export function icsOf(e: CalendarEvent, master: CalendarEvent, attendees: Attendee[]): IcsEvent {
  return {
    uid: e.uid,
    sequence: e.sequence,
    title: e.title,
    description: e.description,
    location: e.location,
    url: e.url,
    start: e.startsAt.getTime(),
    end: e.endsAt.getTime(),
    allDay: e.allDay,
    timezone: e.timezone,
    rrule: e.parentId ? null : e.rrule,
    exdates: e.parentId ? [] : e.exdates,
    recurrenceId: e.originalStart ? e.originalStart.getTime() : null,
    status: e.status,
    busy: e.busy,
    organizer: master.organizerEmail ? { email: master.organizerEmail } : null,
    attendees: attendees.map((a) => ({ email: a.email, name: a.name || undefined, status: a.status, optional: a.optional })),
  };
}

async function personalMailbox(orgId: string, userId: string) {
  const [box] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.userId, userId), eq(mailboxes.kind, "personal")));
  return box ?? null;
}

async function send(orgId: string, userId: string, to: string, subject: string, text: string, method: "REQUEST" | "CANCEL" | "REPLY", ics: string, key?: string) {
  const box = await personalMailbox(orgId, userId);
  // Without a mailbox there's no address to send from; colleagues still see the event, outsiders don't hear of it.
  if (!box) return;
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  // The public demo never mails outside attendees (queuePrepared would refuse it, and that's no error to report).
  if (await isDemoOrg(orgId)) return;
  const { queueMailSend } = await import("@/lib/server/mail/outbox");
  try {
    await queueMailSend({ mailbox: box.address, to, subject, text, signature: false, calendar: { method, ics } }, [box], u?.name ?? "", {
      actorUserId: userId,
      idempotencyKey: key,
    });
  } catch (e) {
    // A plan, limit or suppression refusal must not undo the calendar change; it's reported instead.
    await reportError("web", e, { orgId, where: "calendar.invite", method });
  }
}

/** Mails the change to the event's outside attendees, when the actor is its organizer. Never throws. */
export async function notifyAttendees(change: InviteChange): Promise<void> {
  try {
    const master = change.events.find((e) => !e.parentId) ?? change.events[0];
    if (!master?.organizerEmail) return;
    const own = new Set(
      (await db.select({ domain: mailDomains.domain }).from(mailDomains).where(eq(mailDomains.orgId, change.orgId))).map((d) => d.domain.toLowerCase()),
    );
    const outside = change.attendees.filter(
      (a) =>
        !a.userId &&
        a.email !== master.organizerEmail &&
        !own.has(a.email.split("@")[1] ?? "") &&
        (!change.onlyEmails || change.onlyEmails.includes(a.email)),
    );
    if (!outside.length) return;
    let events: IcsEvent[];
    // A CANCEL outranks the invitation it cancels (Gmail and Outlook drop ones with an older SEQUENCE).
    let facts = { ...icsOf(master, master, change.attendees), ...(change.method === "CANCEL" ? { sequence: master.sequence + 1 } : {}) };
    if (change.method === "CANCEL" && change.occurrence !== undefined) {
      const length = master.endsAt.getTime() - master.startsAt.getTime();
      facts = { ...facts, start: change.occurrence, end: change.occurrence + length, rrule: null, exdates: [], recurrenceId: change.occurrence };
      events = [facts];
    } else if (change.method === "CANCEL") events = [facts];
    else events = change.events.map((e) => icsOf(e, master, change.attendees));
    const ics = toIcs(events, change.method);
    const kind: InviteKind = change.method === "CANCEL" ? "cancel" : master.sequence > 0 ? "update" : "new";
    // The organizer's language (the mail goes out in their name).
    const { subject, text } = withLocale(await userLocale({ id: change.actorUserId }), () => ({ subject: inviteSubject(kind, facts), text: inviteBody(kind, facts) }));
    const version = `${master.sequence}:${master.updatedAt.getTime()}:${change.occurrence ?? ""}`;
    for (const a of outside) {
      const key = `cal:${master.uid.slice(0, 100)}:${version}:${change.method}:${a.email}`.slice(0, 200);
      await send(change.orgId, change.actorUserId, a.email, subject, text, change.method, ics, key);
    }
  } catch (e) {
    await reportError("web", e, { orgId: change.orgId, where: "calendar.notifyAttendees" });
  }
}

/** Answers an outside organizer's invitation for the viewer. Never throws. */
export async function sendReply(orgId: string, userId: string, event: CalendarEvent, attendee: Attendee): Promise<void> {
  try {
    if (!event.organizerEmail || attendee.status === "needs-action") return;
    const facts = icsOf(event, event, [attendee]);
    const ics = toIcs([facts], "REPLY");
    const who = attendee.name ? `${attendee.name} <${attendee.email}>` : attendee.email;
    const status = attendee.status; // not "needs-action": checked above
    const [subject, text] = withLocale(await userLocale({ id: userId }), () => [inviteSubject(status, facts), inviteBody(status, facts, who)]);
    await send(orgId, userId, event.organizerEmail, subject, text, "REPLY", ics);
  } catch (e) {
    await reportError("web", e, { orgId, where: "calendar.sendReply" });
  }
}
