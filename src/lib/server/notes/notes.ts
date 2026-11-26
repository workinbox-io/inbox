/**
 * Shared notes: list and search, create, change, share, archive and delete. Content changes from the API go
 * through the note's Durable Object (applyToRoom) so people editing it see them at once; the editor itself
 * syncs over the WebSocket (src/notes/room.ts) and never calls these for content.
 */
import { notify } from "@/lib/server/notifications";
import { and, asc, db, desc, eq, inArray, isNotNull, isNull, lt, member, noteAccess, noteFolders, notes, or, sql, user } from "@/db";
import { HttpError } from "@/lib/server/api";
import { noteRole, plainText, type NoteRole } from "@/lib/notes/access";
import { canManage, toRole } from "@/lib/server/roles";
import { EMPTY_NOTE, isValue, markdownToValue, valueToMarkdown } from "@/lib/notes/plate";
import { signTicket, TICKET_TTL_MS, userColor } from "@/lib/notes/ticket";
import type { NoteCreate, NoteList, NoteShare, NoteUpdate } from "@/lib/validation-notes";
import { env } from "cloudflare:workers";
import type { Value } from "platejs";
import { grantsFor, requireNote, roleOf, visibleNotes, type Note, type NotesViewer } from "./access";
import { applyToRoom, destroyRoom, kickRoom } from "./sync";
import { noteMeeting } from "@/lib/server/calendar/meeting-notes";

export interface NoteSummary {
  id: string;
  title: string;
  icon: string | null;
  folderId: string | null;
  sharing: Note["sharing"];
  pinned: boolean;
  archived: boolean;
  preview: string;
  ownerId: string | null;
  role: NoteRole;
  updatedAt: string;
}

const summary = (n: Note, role: NoteRole): NoteSummary => ({
  id: n.id,
  title: n.title,
  icon: n.icon,
  folderId: n.folderId,
  sharing: n.sharing,
  pinned: n.pinned,
  archived: !!n.archivedAt,
  preview: n.text.slice(0, 200),
  ownerId: n.ownerId,
  role,
  updatedAt: n.updatedAt.toISOString(),
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listNotes(v: NotesViewer, q: NoteList) {
  const where = [visibleNotes(v), q.view === "archived" ? isNotNull(notes.archivedAt) : isNull(notes.archivedAt)];
  if (q.view === "mine") where.push(eq(notes.ownerId, v.userId || "\u0000"));
  if (q.view === "shared") where.push(or(isNull(notes.ownerId), sql`${notes.ownerId} <> ${v.userId}`)!);
  if (q.view === "pinned") where.push(eq(notes.pinned, true));
  if (q.folderId) where.push(eq(notes.folderId, q.folderId));
  if (q.before) where.push(lt(notes.updatedAt, new Date(q.before)));
  if (q.q) {
    const pattern = `%${escapeLike(q.q)}%`;
    where.push(or(sql`${notes.title} LIKE ${pattern} ESCAPE '\\'`, sql`${notes.text} LIKE ${pattern} ESCAPE '\\'`)!);
  }
  const rows = await db
    .select()
    .from(notes)
    .where(and(...where))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const grants = await grantsFor(v, page.map((n) => n.id));
  return {
    notes: page.flatMap((n) => {
      const role = roleOf(n, v, grants.get(n.id));
      return role ? [summary(n, role)] : [];
    }),
    hasMore: rows.length > q.limit,
  };
}

/** One note with its content (Plate value and markdown) and, for those who manage it, who it's shared with. */
export async function getNote(v: NotesViewer, id: string) {
  const { note, role, manage } = await requireNote(v, id);
  const value = isValue(note.content) ? (note.content as Value) : EMPTY_NOTE;
  const people = manage
    ? await db
        .select({ userId: noteAccess.userId, role: noteAccess.role, name: user.name, email: user.email })
        .from(noteAccess)
        .innerJoin(user, eq(user.id, noteAccess.userId))
        .where(eq(noteAccess.noteId, id))
        .orderBy(asc(user.name))
    : [];
  return {
    ...summary(note, role),
    teamRole: note.teamRole,
    canManage: manage,
    value,
    markdown: valueToMarkdown(value),
    people,
    /** The calendar event it's the meeting notes of. */
    meeting: await noteMeeting(id),
    createdAt: note.createdAt.toISOString(),
  };
}

export async function createNote(v: NotesViewer, input: NoteCreate) {
  const value = input.markdown ? markdownToValue(input.markdown) : EMPTY_NOTE;
  if (input.folderId) await requireFolder(v.orgId, input.folderId);
  const [note] = await db
    .insert(notes)
    .values({
      orgId: v.orgId,
      ownerId: v.userId || null,
      title: input.title,
      folderId: input.folderId ?? null,
      // API keys have no owner to keep a private note for, so theirs are team notes.
      sharing: v.userId ? (input.sharing ?? "private") : "team",
      teamRole: input.teamRole ?? "edit",
      content: value,
      text: plainText(value),
      createdBy: v.userId || null,
      updatedBy: v.userId || null,
    })
    .returning();
  return getNote(v, note.id);
}

export async function updateNote(v: NotesViewer, id: string, input: NoteUpdate) {
  const archiving = input.archived !== undefined;
  const { note } = await requireNote(v, id, archiving ? "manage" : "edit");
  if (note.archivedAt && (input.markdown !== undefined || input.title !== undefined) && input.archived !== false)
    throw new HttpError(409, "Restore the note before changing it");
  if (input.folderId) await requireFolder(v.orgId, input.folderId);
  const set: Partial<typeof notes.$inferInsert> = { updatedBy: v.userId || null };
  if (input.icon !== undefined) set.icon = input.icon;
  if (input.folderId !== undefined) set.folderId = input.folderId;
  if (input.pinned !== undefined) set.pinned = input.pinned;
  if (archiving) set.archivedAt = input.archived ? new Date() : null;
  await db.update(notes).set(set).where(eq(notes.id, id));
  // Content and title live in the note's room: change them there so open editors follow.
  if (input.markdown !== undefined)
    await applyToRoom(id, { mode: input.mode, value: markdownToValue(input.markdown), title: input.title, userId: v.userId || null });
  else if (input.title !== undefined) await applyToRoom(id, { mode: "title", title: input.title, userId: v.userId || null });
  // Archiving makes the note read-only: reconnect editors with new tickets.
  if (archiving && !!note.archivedAt !== input.archived) await kickRoom(id);
  return getNote(v, id);
}

export async function shareNote(v: NotesViewer, id: string, input: NoteShare) {
  const { note } = await requireNote(v, id, "manage");
  if (!v.userId && input.sharing !== "team") throw new HttpError(422, "API keys can only keep notes shared with the team");
  const people = input.sharing === "people" ? input.people.filter((p) => p.userId !== note.ownerId) : [];
  if (people.length) {
    const ids = people.map((p) => p.userId);
    const members = await db
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, v.orgId), inArray(member.userId, ids)));
    if (members.length !== new Set(ids).size) throw new HttpError(422, "Share with members of this organization only");
  }
  const before = new Set((await db.select({ userId: noteAccess.userId }).from(noteAccess).where(eq(noteAccess.noteId, id))).map((r) => r.userId));
  await db.batch([
    db.update(notes).set({ sharing: input.sharing, teamRole: input.teamRole }).where(eq(notes.id, id)),
    db.delete(noteAccess).where(eq(noteAccess.noteId, id)),
    ...(people.length ? [db.insert(noteAccess).values(people.map((p) => ({ noteId: id, userId: p.userId, role: p.role })))] : []),
  ]);
  await kickRoom(id);
  await notify(v.orgId, people.filter((p) => !before.has(p.userId)).map((p) => p.userId), { kind: "share", app: "notes", actorId: v.userId || null, title: note.title || "Untitled", body: "a note", href: `/app/notes/${id}`, groupKey: `note:${id}` });
  return getNote(v, id);
}

/** Deletes an archived note for good. */
export async function deleteNote(v: NotesViewer, id: string) {
  const { note } = await requireNote(v, id, "manage");
  if (!note.archivedAt) throw new HttpError(409, "Archive the note before deleting it");
  await db.delete(notes).where(eq(notes.id, id));
  await destroyRoom(id);
  return note;
}

/** A WebSocket ticket for the editor; read-only for viewers and archived notes. */
export async function noteTicket(v: NotesViewer, id: string, name: string) {
  if (!v.userId) throw new HttpError(403, "Sign in to edit notes");
  const { note, role } = await requireNote(v, id);
  const canEdit = role !== "view" && !note.archivedAt;
  const color = userColor(v.userId);
  const ticket = await signTicket(
    { noteId: id, orgId: v.orgId, userId: v.userId, name, color, canEdit, exp: Date.now() + TICKET_TTL_MS },
    env.BETTER_AUTH_SECRET,
  );
  return { ticket, canEdit, user: { id: v.userId, name, color } };
}

/** People newly @mentioned in a note (from its room, src/notes/room.ts) who may open it hear about it. */
export async function notifyNoteMentions(noteId: string, added: string[], actorId: string | null) {
  if (!added.length) return;
  const [n] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!n || n.archivedAt) return;
  const [grants, members] = await Promise.all([
    db.select({ userId: noteAccess.userId, role: noteAccess.role }).from(noteAccess).where(and(eq(noteAccess.noteId, noteId), inArray(noteAccess.userId, added))),
    db.select({ userId: member.userId, role: member.role }).from(member).where(and(eq(member.organizationId, n.orgId), inArray(member.userId, added))),
  ]);
  const facts = { ownerId: n.ownerId, sharing: n.sharing, teamRole: n.teamRole };
  const can = members.filter((m) => noteRole(facts, { userId: m.userId, manager: canManage(toRole(m.role)) }, grants.find((g) => g.userId === m.userId)?.role ?? null));
  await notify(n.orgId, can.map((m) => m.userId), { kind: "mention", app: "notes", actorId, title: n.title || "Untitled", href: `/app/notes/${noteId}`, groupKey: `note:${noteId}` });
}

/** Members of the org, for sharing and @mentions. */
export async function notePeople(orgId: string) {
  return db
    .select({ id: user.id, name: user.name, email: user.email, image: user.image })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(user.name));
}

// Folders: shared by the whole org; anyone may add or rename one, owners and admins delete.

export const listFolders = (orgId: string) =>
  db.select({ id: noteFolders.id, name: noteFolders.name }).from(noteFolders).where(eq(noteFolders.orgId, orgId)).orderBy(asc(noteFolders.sort), asc(noteFolders.name));

async function requireFolder(orgId: string, id: string) {
  const [folder] = await db.select().from(noteFolders).where(and(eq(noteFolders.id, id), eq(noteFolders.orgId, orgId)));
  if (!folder) throw new HttpError(404, "Folder not found");
  return folder;
}

export async function createFolder(orgId: string, name: string) {
  const [folder] = await db.insert(noteFolders).values({ orgId, name }).returning({ id: noteFolders.id, name: noteFolders.name });
  return folder;
}

export async function renameFolder(orgId: string, id: string, name: string) {
  await requireFolder(orgId, id);
  await db.update(noteFolders).set({ name }).where(eq(noteFolders.id, id));
  return { id, name };
}

export async function deleteFolder(orgId: string, id: string) {
  const folder = await requireFolder(orgId, id);
  await db.batch([db.update(notes).set({ folderId: null }).where(eq(notes.folderId, id)), db.delete(noteFolders).where(eq(noteFolders.id, id))]);
  return folder;
}

