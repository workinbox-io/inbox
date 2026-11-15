/**
 * "@ anything" on the server: the picker's search across the apps, who in a message's audience can't open what was
 * mentioned, and the fixes the sender may apply (give access, a live link, a snapshot link). Tokens and rendering
 * are in lib/mentions.ts and lib/mail/doc-render.ts.
 */
import { env } from "cloudflare:workers";
import {
  and,
  asc,
  calendarAccess,
  calendarAttendees,
  calendarEvents,
  calendars,
  chatChannels,
  chatMembers,
  contactEmails,
  contacts,
  db,
  desc,
  driveAccess,
  driveItems,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  mailboxAccess,
  mailThreads,
  member,
  noteAccess,
  notes,
  or,
  sql,
  user,
} from "@/db";
import { ancestorIds, driveRole } from "@/lib/drive/access";
import { cleanTitle, type Mentionable, type MentionKind, type Ref } from "@/lib/mentions";
import { atLeast, noteRole } from "@/lib/notes/access";
import { HttpError } from "@/lib/server/api";
import { requireEvent, type CalendarViewer } from "@/lib/server/calendar/access";
import { getEvent, orgUsersByEmail, updateEvent } from "@/lib/server/calendar/events";
import { requireChannel, visibleWhere } from "@/lib/server/chat/access";
import { patchChannel } from "@/lib/server/chat/channels";
import { requireItem, rolesFor, visibleItems } from "@/lib/server/drive/access";
import { createLink } from "@/lib/server/drive/links";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { createNoteLink } from "@/lib/server/notes/links";
import { requireNote, visibleNotes, type NotesViewer } from "@/lib/server/notes/access";
import { canManage, toRole } from "@/lib/server/roles";

/** Every app's viewer is { orgId, userId, role }. */
export type Viewer = NotesViewer;

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const LIKE = (col: unknown, q: string) => sql`${col} LIKE ${like(q)} ESCAPE '\\'`;
export const appOrigin = () => env.PUBLIC_APP_URL.replace(/\/$/, "");

// ---- Search ----

export async function searchMentionables(v: Viewer, q: string, kinds?: MentionKind[]): Promise<Mentionable[]> {
  const want = (k: MentionKind) => !kinds?.length || kinds.includes(k);
  const now = Date.now();
  const none = Promise.resolve([] as Mentionable[]);
  const groups = await Promise.all([
    want("person")
      ? db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(and(eq(member.organizationId, v.orgId), q ? or(LIKE(user.name, q), LIKE(user.email, q)) : undefined))
          .orderBy(asc(user.name))
          .limit(6)
          .then((r) => r.map((p): Mentionable => ({ kind: "person", id: p.id, title: p.name || p.email, subtitle: p.email, seed: p.email })))
      : none,
    want("file")
      ? db
          .select({ id: driveItems.id, name: driveItems.name, kind: driveItems.kind, mediaType: driveItems.mediaType, size: driveItems.size })
          .from(driveItems)
          .where(and(visibleItems(v), q ? LIKE(driveItems.name, q) : undefined))
          .orderBy(desc(driveItems.updatedAt))
          .limit(6)
          .then((r) => r.map((i): Mentionable => ({ kind: "file", id: i.id, title: i.name, mediaType: i.mediaType, folder: i.kind === "folder", subtitle: i.kind === "folder" ? "Folder" : undefined })))
      : none,
    want("note")
      ? db
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(and(visibleNotes(v), isNull(notes.archivedAt), q ? LIKE(notes.title, q) : undefined))
          .orderBy(desc(notes.updatedAt))
          .limit(5)
          .then((r) => r.map((n): Mentionable => ({ kind: "note", id: n.id, title: n.title || "Untitled" })))
      : none,
    want("event") && v.userId ? searchEvents(v, q, now) : none,
    want("contact")
      ? db
          .select({ id: contacts.id, name: contacts.name, emails: contacts.emails })
          .from(contacts)
          .where(
            and(
              eq(contacts.orgId, v.orgId),
              q ? or(LIKE(contacts.name, q), inArray(contacts.id, db.select({ id: contactEmails.contactId }).from(contactEmails).where(and(eq(contactEmails.orgId, v.orgId), LIKE(contactEmails.email, q))))) : undefined,
            ),
          )
          .orderBy(desc(contacts.lastContactedAt))
          .limit(4)
          .then((r) => r.map((c): Mentionable => ({ kind: "contact", id: c.id, title: c.name || c.emails[0]?.value || "Contact", subtitle: c.emails[0]?.value, seed: c.emails[0]?.value ?? c.id })))
      : none,
    want("thread") && v.userId ? searchThreads(v, q) : none,
    want("channel") && v.userId
      ? db
          .select({ id: chatChannels.id, name: chatChannels.name, private: chatChannels.private })
          .from(chatChannels)
          .where(and(visibleWhere(v), eq(chatChannels.kind, "channel"), isNull(chatChannels.archivedAt), q ? LIKE(chatChannels.name, q) : undefined))
          .orderBy(desc(chatChannels.lastMessageAt))
          .limit(4)
          .then((r) => r.map((c): Mentionable => ({ kind: "channel", id: c.id, title: c.name, subtitle: c.private ? "Private channel" : "Channel" })))
      : none,
  ]);
  return groups.flat();
}

/** Events on the viewer's calendars by title: a month back, three ahead, plus series still repeating. */
async function searchEvents(v: Viewer, q: string, now: number): Promise<Mentionable[]> {
  const visible = db
    .select({ id: calendars.id })
    .from(calendars)
    .where(
      and(
        eq(calendars.orgId, v.orgId),
        or(
          eq(calendars.ownerId, v.userId),
          eq(calendars.sharing, "team"),
          and(eq(calendars.sharing, "people"), inArray(calendars.id, db.select({ id: calendarAccess.calendarId }).from(calendarAccess).where(eq(calendarAccess.userId, v.userId)))),
        ),
      ),
    );
  const invited = db.select({ id: calendarAttendees.eventId }).from(calendarAttendees).where(eq(calendarAttendees.userId, v.userId));
  const rows = await db
    .select({ id: calendarEvents.id, title: calendarEvents.title, startsAt: calendarEvents.startsAt, rrule: calendarEvents.rrule })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.orgId, v.orgId),
        isNull(calendarEvents.parentId),
        or(inArray(calendarEvents.calendarId, visible), inArray(calendarEvents.id, invited)),
        or(
          and(gte(calendarEvents.startsAt, new Date(now - 30 * 86_400_000)), sql`${calendarEvents.startsAt} <= ${now + 90 * 86_400_000}`),
          and(isNotNull(calendarEvents.rrule), or(isNull(calendarEvents.recurUntil), gte(calendarEvents.recurUntil, new Date(now)))),
        ),
        q ? LIKE(calendarEvents.title, q) : undefined,
      ),
    )
    .orderBy(asc(sql`abs(${calendarEvents.startsAt} - ${now})`))
    .limit(5);
  return rows.map((e) => ({ kind: "event", id: e.id, title: e.title || "Event", subtitle: e.rrule ? "Repeats" : e.startsAt.toISOString() }));
}

async function searchThreads(v: Viewer, q: string): Promise<Mentionable[]> {
  const boxes = await viewerMailboxes(v);
  if (!boxes.length) return [];
  const rows = await db
    .select({ id: mailThreads.id, subject: mailThreads.subject, mailboxId: mailThreads.mailboxId })
    .from(mailThreads)
    .where(and(inArray(mailThreads.mailboxId, boxes.map((b) => b.id)), q ? LIKE(mailThreads.subject, q) : undefined))
    .orderBy(desc(mailThreads.lastMessageAt))
    .limit(4);
  const address = new Map(boxes.map((b) => [b.id, b.address]));
  return rows.map((t) => ({ kind: "thread", id: t.id, title: t.subject || "(no subject)", subtitle: address.get(t.mailboxId) }));
}

// ---- Who can't open what ----

export interface Audience {
  /** Chat: everyone in the channel. */
  channelId?: string;
  /** Mail: To and Cc; the org's people are matched by address, the rest are outside. */
  emails?: string[];
}

interface Person {
  id: string;
  name: string;
  email: string;
  manager: boolean;
}

export interface AccessGap {
  ref: Ref;
  users: { id: string; name: string; email: string }[];
  external: string[];
  /** What the sender may do about it. */
  can: { grant: boolean; live: boolean; snapshot: boolean };
}

/** shortcut: capped at 200 people per message; per-person checks are in memory after a few queries per ref. */
async function resolveAudience(v: Viewer, a: Audience) {
  let ids: string[] = [];
  let external: string[] = [];
  const emailOf = new Map<string, string>();
  if (a.channelId) {
    const { channel } = await requireChannel({ ...v }, a.channelId);
    const rows = await db.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.channelId, channel.id));
    ids = rows.map((r) => r.userId);
  }
  if (a.emails?.length) {
    const emails = [...new Set(a.emails.map((e) => e.trim().toLowerCase()))].slice(0, 200);
    const known = await orgUsersByEmail(v.orgId, emails);
    for (const [email, id] of known) emailOf.set(id, email);
    ids.push(...known.values());
    external = emails.filter((e) => !known.has(e));
  }
  ids = [...new Set(ids)].filter((id) => id !== v.userId).slice(0, 200);
  const people: Person[] = ids.length
    ? (
        await db
          .select({ id: user.id, name: user.name, email: user.email, role: member.role })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(and(eq(member.organizationId, v.orgId), inArray(member.userId, ids)))
      ).map((p) => ({ id: p.id, name: p.name, email: emailOf.get(p.id) ?? p.email, manager: canManage(toRole(p.role)) }))
    : [];
  return { people, external };
}

/** person → (item → their grant), from rows of { userId, role, on: item id }. */
const grantsOf = async (rows: Promise<{ userId: string; role: "view" | "edit"; on: string }[]>) => {
  const out = new Map<string, Map<string, "view" | "edit">>();
  for (const r of await rows) {
    if (!out.has(r.userId)) out.set(r.userId, new Map());
    out.get(r.userId)!.set(r.on, r.role);
  }
  return out;
};

/** Which people of `people` may open the ref, and what the sender may do; null when the sender can't see it either. */
async function judge(v: Viewer, ref: Ref, people: Person[]): Promise<{ allowed: Set<string>; external: (e: string) => boolean; can: AccessGap["can"] } | null> {
  const ids = people.map((p) => p.id);
  const all = { allowed: new Set(ids), external: () => true, can: { grant: false, live: false, snapshot: false } };
  switch (ref.kind) {
    case "file": {
      const [item] = await db.select().from(driveItems).where(and(eq(driveItems.id, ref.id), eq(driveItems.orgId, v.orgId)));
      if (!item) return null;
      const mine = (await rolesFor(v, [item])).get(item.id);
      if (!mine?.role || mine.trashed) return null;
      const chainIds = [...ancestorIds(item.path), item.id];
      const chain = await db.select().from(driveItems).where(and(eq(driveItems.orgId, v.orgId), inArray(driveItems.id, chainIds)));
      chain.sort((a, b) => a.path.length - b.path.length);
      const grants = ids.length
        ? await grantsOf(db.select({ userId: driveAccess.userId, role: driveAccess.role, on: driveAccess.itemId }).from(driveAccess).where(and(inArray(driveAccess.itemId, chainIds), inArray(driveAccess.userId, ids))))
        : new Map<string, Map<string, "view" | "edit">>();
      const allowed = new Set(people.filter((p) => driveRole(chain, { userId: p.id, manager: p.manager }, grants.get(p.id) ?? new Map()).role).map((p) => p.id));
      return { allowed, external: () => false, can: { grant: mine.manage, live: mine.manage, snapshot: mine.manage && item.kind === "file" } };
    }
    case "note": {
      const { note, manage } = await requireNote(v, ref.id).catch(() => ({ note: null, manage: false }));
      if (!note) return null;
      const grants = ids.length
        ? await grantsOf(db.select({ userId: noteAccess.userId, role: noteAccess.role, on: noteAccess.noteId }).from(noteAccess).where(and(eq(noteAccess.noteId, note.id), inArray(noteAccess.userId, ids))))
        : new Map<string, Map<string, "view" | "edit">>();
      const allowed = new Set(people.filter((p) => noteRole(note, { userId: p.id, manager: p.manager }, grants.get(p.id)?.get(note.id) ?? null)).map((p) => p.id));
      return { allowed, external: () => false, can: { grant: manage, live: manage, snapshot: manage } };
    }
    case "event": {
      const { event, calendar, role } = await requireEvent(v as CalendarViewer, ref.id.split("~")[0]!).catch(() => ({ event: null, calendar: null, role: null }));
      if (!event || !calendar) return null;
      const master = event.parentId ?? event.id;
      const attendees = await db.select({ userId: calendarAttendees.userId, email: calendarAttendees.email }).from(calendarAttendees).where(eq(calendarAttendees.eventId, master));
      const grants = ids.length
        ? await grantsOf(db.select({ userId: calendarAccess.userId, role: calendarAccess.role, on: calendarAccess.calendarId }).from(calendarAccess).where(and(eq(calendarAccess.calendarId, calendar.id), inArray(calendarAccess.userId, ids))))
        : new Map<string, Map<string, "view" | "edit">>();
      const invited = new Set(attendees.map((a) => a.userId).filter(Boolean));
      const emails = new Set(attendees.map((a) => a.email.toLowerCase()));
      const allowed = new Set(people.filter((p) => invited.has(p.id) || noteRole(calendar, { userId: p.id, manager: p.manager }, grants.get(p.id)?.get(calendar.id) ?? null)).map((p) => p.id));
      // Inviting = adding attendees, which the event's editors may do (and which mails outside people the invitation).
      return { allowed, external: (e) => emails.has(e), can: { grant: atLeast(role, "edit") && !calendar.sourceUrl, live: false, snapshot: false } };
    }
    case "channel": {
      const found = await requireChannel(v, ref.id).catch(() => null);
      if (!found) return null;
      if (found.channel.kind === "channel" && !found.channel.private) return all;
      const rows = ids.length ? await db.select({ userId: chatMembers.userId }).from(chatMembers).where(and(eq(chatMembers.channelId, ref.id), inArray(chatMembers.userId, ids))) : [];
      return { allowed: new Set(rows.map((r) => r.userId)), external: () => false, can: { grant: !!found.membership && found.channel.kind === "channel", live: false, snapshot: false } };
    }
    case "thread": {
      const boxes = await viewerMailboxes(v);
      const [thread] = await db.select({ mailboxId: mailThreads.mailboxId }).from(mailThreads).where(and(eq(mailThreads.id, ref.id), inArray(mailThreads.mailboxId, boxes.map((b) => b.id).concat("-"))));
      if (!thread) return null;
      const box = boxes.find((b) => b.id === thread.mailboxId)!;
      if (box.kind === "personal") return { allowed: new Set(box.userId ? [box.userId] : []), external: () => false, can: all.can };
      const rows = ids.length ? await db.select({ userId: mailboxAccess.userId }).from(mailboxAccess).where(and(eq(mailboxAccess.mailboxId, box.id), inArray(mailboxAccess.userId, ids))) : [];
      const granted = new Set(rows.map((r) => r.userId));
      return { allowed: new Set(people.filter((p) => p.manager || granted.has(p.id)).map((p) => p.id)), external: () => false, can: all.can };
    }
    case "contact":
      return all;
  }
}

/** Only the refs someone in the audience can't open. */
export async function missingAccess(v: Viewer, refs: Ref[], audience: Audience): Promise<AccessGap[]> {
  if (!v.userId) throw new HttpError(403, "Needs a signed-in person");
  const { people, external } = await resolveAudience(v, audience);
  const seen = new Set<string>();
  const out: AccessGap[] = [];
  for (const ref of refs.slice(0, 20)) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key) || ref.url) continue;
    seen.add(key);
    const verdict = await judge(v, ref, people);
    if (!verdict) continue;
    const users = people.filter((p) => !verdict.allowed.has(p.id)).map(({ id, name, email }) => ({ id, name, email }));
    const outside = ref.kind === "contact" ? [] : external.filter((e) => !verdict.external(e));
    if (users.length || outside.length) out.push({ ref: { ...ref, title: cleanTitle(ref.title) }, users, external: outside, can: verdict.can });
  }
  return out;
}

// ---- Fixing it ----

export type ShareAction = "grant" | "live" | "snapshot";

/**
 * Applies the sender's pick for one ref. "grant": view access for `userIds` (events: invites them and `emails`).
 * "live" / "snapshot": a public link, returned as the ref's new `url`.
 */
export async function shareRef(v: Viewer, input: { ref: Ref; action: ShareAction; userIds: string[]; emails: string[]; expiresAt?: number | null }): Promise<Ref> {
  const { ref, action } = input;
  if (!v.userId) throw new HttpError(403, "Needs a signed-in person");
  if (action !== "grant") {
    const snapshot = action === "snapshot";
    if (ref.kind === "file") {
      const { link } = await createLink(v, ref.id, { expiresAt: input.expiresAt, snapshot });
      return { ...ref, url: `${appOrigin()}/s/${link.token}` };
    }
    if (ref.kind === "note") {
      const link = await createNoteLink(v, ref.id, { expiresAt: input.expiresAt, snapshot });
      return { ...ref, url: `${appOrigin()}/n/${link.token}` };
    }
    throw new HttpError(422, "This can't be shared as a link");
  }
  const people = input.userIds.length
    ? await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(and(eq(member.organizationId, v.orgId), inArray(member.userId, input.userIds.slice(0, 200))))
    : [];
  const ids = people.map((p) => p.id);
  switch (ref.kind) {
    case "file": {
      const { item } = await requireItem(v, ref.id, "manage");
      if (!ids.length) return ref;
      await db.batch([
        ...(item.sharing === "private" ? [db.update(driveItems).set({ sharing: "people", updatedAt: new Date() }).where(eq(driveItems.id, item.id))] : []),
        ...ids.map((userId) => db.insert(driveAccess).values({ itemId: item.id, userId, role: "view" }).onConflictDoNothing()),
      ] as [never, ...never[]]);
      return ref;
    }
    case "note": {
      const { note, manage } = await requireNote(v, ref.id);
      if (!manage) throw new HttpError(403, "Only the note's owner can share it");
      if (!ids.length) return ref;
      await db.batch([
        ...(note.sharing === "private" ? [db.update(notes).set({ sharing: "people" }).where(eq(notes.id, note.id))] : []),
        ...ids.map((userId) => db.insert(noteAccess).values({ noteId: note.id, userId, role: "view" }).onConflictDoNothing()),
      ] as [never, ...never[]]);
      return ref;
    }
    case "event": {
      const id = ref.id.split("~")[0]!;
      const { event } = await requireEvent(v as CalendarViewer, id, "edit");
      const master = event.parentId ?? event.id;
      const current = await getEvent(v as CalendarViewer, master);
      const have = new Set(current.attendees.map((a) => a.email.toLowerCase()));
      const add = [...people.map((p) => ({ email: p.email.toLowerCase(), name: p.name })), ...input.emails.map((e) => ({ email: e.trim().toLowerCase(), name: "" }))].filter((a) => !have.has(a.email) && have.add(a.email));
      if (add.length) await updateEvent(v as CalendarViewer, master, { scope: "all", attendees: [...current.attendees.map((a) => ({ email: a.email, name: a.name, optional: a.optional })), ...add] });
      return ref;
    }
    case "channel":
      if (ids.length) await patchChannel(v, ref.id, { action: "members", userIds: ids });
      return ref;
    default:
      throw new HttpError(422, "Access to this can't be shared from here");
  }
}
