import { handler, json, parseBody } from "@/lib/server/api";
import { notesViewer } from "@/lib/server/notes/access";
import { deleteNote, getNote, updateNote } from "@/lib/server/notes/notes";
import { noteUpdateSchema } from "@/lib/validation-notes";

export const GET = handler(async (ctx) => json(await getNote(notesViewer(ctx), ctx.params.id!)));

export const PATCH = handler(async (ctx) => {
  const input = await parseBody(ctx.request, noteUpdateSchema);
  const note = await updateNote(notesViewer(ctx), ctx.params.id!, input);
  const target = note.title || note.id;
  if (input.archived !== undefined) ctx.audit(input.archived ? "note.archive" : "note.restore", { target });
  if (input.markdown !== undefined || input.title !== undefined || input.folderId !== undefined)
    ctx.audit("note.update", { target, details: { content: input.markdown !== undefined ? input.mode : undefined } });
  return json(note);
});

/** Deletes an archived note for good. */
export const DELETE = handler(async (ctx) => {
  const note = await deleteNote(notesViewer(ctx), ctx.params.id!);
  ctx.audit("note.delete", { target: note.title || note.id });
  return json({ ok: true });
});
