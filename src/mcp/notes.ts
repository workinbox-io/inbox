/** MCP tools for shared notes: the same lib/server functions as /api/app/notes, so access works the same way. */
import { z } from "zod";
import { createNote, getNote, listNotes, updateNote } from "@/lib/server/notes/notes";
import type { NotesViewer } from "@/lib/server/notes/access";
import { noteCreateSchema, noteListSchema } from "@/lib/validation-notes";
import { defineTool, type McpContext, type McpModule, type Tools } from "./define";

/** Connected apps act as the user; API keys see team notes only. */
const viewer = (ctx: McpContext): NotesViewer => ({ orgId: ctx.orgId, role: ctx.role, userId: ctx.userId ?? "" });

const noteId = z.string().uuid().describe("Note id from notes_search");

/** What the model reads: markdown instead of the editor's JSON. */
const out = (note: Awaited<ReturnType<typeof getNote>>) => {
  const { value: _value, preview: _preview, ...rest } = note;
  return rest;
};

export const notesTools: Tools = {
  notes_search: defineTool({
    title: "Search notes",
    description:
      "Lists notes the user may open, pinned first then most recently changed, with a text preview. `q` searches titles and text; `view` narrows to mine, shared (with me), pinned or archived.",
    input: noteListSchema.pick({ view: true, q: true, folderId: true, limit: true }),
    async run(input, ctx) {
      return listNotes(viewer(ctx), { ...input, limit: input.limit ?? 20 });
    },
  }),

  notes_get: defineTool({
    title: "Read note",
    description: "One note with its content as markdown, its sharing and the user's role in it (owner, edit or view).",
    input: z.object({ id: noteId }),
    async run({ id }, ctx) {
      return out(await getNote(viewer(ctx), id));
    },
  }),

  notes_create: defineTool({
    title: "Create note",
    description:
      "Creates a note from markdown. It is private to the user unless `sharing` is team (everyone in the organization). Notes created with an API key are always team notes.",
    input: noteCreateSchema.pick({ title: true, markdown: true, sharing: true }),
    scope: "write",
    async run(input, ctx) {
      const note = await createNote(viewer(ctx), input);
      ctx.audit("note.create", { target: note.title || note.id });
      return out(note);
    },
  }),

  notes_update: defineTool({
    title: "Edit note",
    description:
      "Changes a note's content from markdown: `append` adds at the end (safe while others are editing), `replace` rewrites the whole note (confirm with the user first). Can also rename it. People with the note open see the change at once.",
    input: z.object({
      id: noteId,
      markdown: z.string().max(500_000).optional(),
      mode: z.enum(["append", "replace"]).default("append"),
      title: z.string().trim().max(200).optional(),
    }),
    scope: "write",
    async run({ id, ...input }, ctx) {
      const note = await updateNote(viewer(ctx), id, input);
      ctx.audit("note.update", { target: note.title || note.id, details: { content: input.markdown !== undefined ? input.mode : undefined } });
      return out(note);
    },
  }),

  notes_archive: defineTool({
    title: "Archive note",
    description: "Archives a note (or restores it with archived: false). Archived notes are read-only and can be restored later.",
    input: z.object({ id: noteId, archived: z.boolean().default(true) }),
    scope: "write",
    async run({ id, archived }, ctx) {
      const note = await updateNote(viewer(ctx), id, { archived, mode: "replace" });
      ctx.audit(archived ? "note.archive" : "note.restore", { target: note.title || note.id });
      return { id: note.id, title: note.title, archived: note.archived };
    },
  }),
};

export const notesModule: McpModule = {
  name: "notes",
  instructions: "Notes: shared team notes in markdown; notes_search, then notes_get for the full text. Private notes stay private to their owner.",
  tools: notesTools,
};
