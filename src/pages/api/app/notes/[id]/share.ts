import { handler, json, parseBody } from "@/lib/server/api";
import { notesViewer } from "@/lib/server/notes/access";
import { shareNote } from "@/lib/server/notes/notes";
import { noteShareSchema } from "@/lib/validation-notes";

/** Who may open the note: private, chosen people (with view or edit) or the whole team. */
export const PUT = handler(async (ctx) => {
  const input = await parseBody(ctx.request, noteShareSchema);
  const note = await shareNote(notesViewer(ctx), ctx.params.id!, input);
  ctx.audit("note.share", { target: note.title || note.id, details: { sharing: input.sharing, people: input.people.length } });
  return json(note);
});
