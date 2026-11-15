import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { notesViewer } from "@/lib/server/notes/access";
import { createNote, listNotes } from "@/lib/server/notes/notes";
import { noteCreateSchema, noteListSchema } from "@/lib/validation-notes";

/** Notes the viewer may open: ?view=all|mine|shared|pinned|archived&folderId=&q=&before=&limit= */
export const GET = handler(async (ctx) => {
  const query = noteListSchema.safeParse(Object.fromEntries(ctx.url.searchParams));
  if (!query.success) throw new HttpError(422, query.error.issues[0]?.message ?? "Invalid query");
  return json(await listNotes(notesViewer(ctx), query.data));
});

export const POST = handler(async (ctx) => {
  const note = await createNote(notesViewer(ctx), await parseBody(ctx.request, noteCreateSchema));
  ctx.audit("note.create", { target: note.title || note.id });
  return json(note, 201);
});
