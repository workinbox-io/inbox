/**
 * Public read-only links to a note (/n/<token>), made when a note is mentioned to someone without access:
 * "live" shows the note's last saved content, "snapshot" the content kept when the link was made.
 * A link dies with its note and stops working while the note is archived.
 */
import { and, db, eq, noteLinks, notes } from "@/db";
import { HttpError } from "@/lib/server/api";
import { randomBase64Url } from "@/lib/server/crypto";
import { requireNote, type NotesViewer } from "./access";

export async function createNoteLink(v: NotesViewer, noteId: string, input: { expiresAt?: number | null; snapshot?: boolean }) {
  const { note, manage } = await requireNote(v, noteId);
  if (!manage) throw new HttpError(403, "Only the note's owner can share it");
  if (input.expiresAt && input.expiresAt <= Date.now()) throw new HttpError(422, "Pick an expiry date in the future");
  const [row] = await db
    .insert(noteLinks)
    .values({
      orgId: v.orgId,
      noteId,
      token: randomBase64Url(16),
      mode: input.snapshot ? "snapshot" : "live",
      snapshotTitle: input.snapshot ? note.title : null,
      snapshotContent: input.snapshot ? note.content : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdBy: v.userId || null,
    })
    .returning();
  return row!;
}

/** What /n/<token> shows, or null for unknown, expired, archived or deleted. */
export async function openNoteLink(token: string) {
  if (!/^[\w-]{16,40}$/.test(token)) return null;
  const [row] = await db
    .select({ link: noteLinks, note: notes })
    .from(noteLinks)
    .innerJoin(notes, and(eq(notes.id, noteLinks.noteId), eq(notes.orgId, noteLinks.orgId)))
    .where(eq(noteLinks.token, token));
  if (!row || row.note.archivedAt || (row.link.expiresAt && row.link.expiresAt.getTime() < Date.now())) return null;
  const snapshot = row.link.mode === "snapshot";
  return {
    title: (snapshot ? row.link.snapshotTitle : row.note.title) || "Untitled",
    content: snapshot ? row.link.snapshotContent : row.note.content,
    snapshot,
    at: snapshot ? row.link.createdAt : row.note.updatedAt,
  };
}
