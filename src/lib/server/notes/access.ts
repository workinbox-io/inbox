/**
 * Which notes a viewer may see (lib/notes/access.ts has the rules). Every notes query goes through
 * `visibleNotes` or `requireNote`.
 */
import { and, db, eq, inArray, noteAccess, notes, or, type SQL } from "@/db";
import { HttpError, type HandlerContext } from "@/lib/server/api";
import { atLeast, canManageNote, noteRole, type NoteRole } from "@/lib/notes/access";
import { canManage, type OrgRole } from "@/lib/server/roles";

export type Note = typeof notes.$inferSelect;

export interface NotesViewer {
  orgId: string;
  /** Empty for API keys: they see team notes only. */
  userId: string;
  role: OrgRole;
}

export function notesViewer(ctx: Pick<HandlerContext, "locals" | "orgId" | "role">): NotesViewer {
  if (ctx.locals.apiKeyId) return { orgId: ctx.orgId, role: ctx.role, userId: "" };
  const user = ctx.locals.user;
  if (!user) throw new HttpError(401, "Unauthorized");
  return { orgId: ctx.orgId, userId: user.id, role: ctx.role };
}

const facts = (v: NotesViewer) => ({ userId: v.userId, manager: canManage(v.role) });

/** WHERE for the notes a viewer may open. */
export function visibleNotes(v: NotesViewer): SQL {
  const team = eq(notes.sharing, "team");
  if (!v.userId) return and(eq(notes.orgId, v.orgId), team)!;
  const granted = and(
    eq(notes.sharing, "people"),
    inArray(notes.id, db.select({ id: noteAccess.noteId }).from(noteAccess).where(eq(noteAccess.userId, v.userId))),
  );
  return and(eq(notes.orgId, v.orgId), or(eq(notes.ownerId, v.userId), team, granted))!;
}

/** The viewer's grants for these notes. */
export async function grantsFor(v: NotesViewer, ids: string[]) {
  if (!v.userId || !ids.length) return new Map<string, "view" | "edit">();
  const rows = await db
    .select({ noteId: noteAccess.noteId, role: noteAccess.role })
    .from(noteAccess)
    .where(and(eq(noteAccess.userId, v.userId), inArray(noteAccess.noteId, ids)));
  return new Map(rows.map((r) => [r.noteId, r.role]));
}

export const roleOf = (note: Note, v: NotesViewer, grant?: "view" | "edit" | null) => noteRole(note, facts(v), grant);
export const managesNote = (note: Note, v: NotesViewer, role: NoteRole | null) => canManageNote(note, facts(v), role);

/**
 * The note with the viewer's role, or 404 when they can't open it (also when it exists but isn't theirs to
 * see) and 403 when they can open it but lack `need` ("manage": change sharing, archive, delete).
 */
export async function requireNote(v: NotesViewer, id: string, need: NoteRole | "manage" = "view") {
  const [note] = await db.select().from(notes).where(and(eq(notes.id, id), eq(notes.orgId, v.orgId)));
  if (!note) throw new HttpError(404, "Not found");
  const grant = (await grantsFor(v, [id])).get(id) ?? null;
  const role = roleOf(note, v, grant);
  if (!role) throw new HttpError(404, "Not found");
  const manage = managesNote(note, v, role);
  if (need === "manage" ? !manage : !atLeast(role, need)) throw new HttpError(403, "You can't change this note");
  return { note, role, manage };
}
