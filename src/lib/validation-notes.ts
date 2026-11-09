/** Request bodies of the notes API (/api/app/notes, /api/v1/notes). */
import { z } from "zod";

const title = z.string().trim().max(200);
const markdown = z.string().max(500_000);
const role = z.enum(["view", "edit"]);

export const noteListSchema = z.object({
  view: z.enum(["all", "mine", "shared", "pinned", "archived"]).default("all"),
  folderId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const noteCreateSchema = z.object({
  title: title.default(""),
  markdown: markdown.optional(),
  folderId: z.string().uuid().nullable().optional(),
  sharing: z.enum(["private", "team"]).optional(),
  teamRole: role.optional(),
});

export const noteUpdateSchema = z
  .object({
    title: title.optional(),
    icon: z.string().max(16).nullable().optional(),
    folderId: z.string().uuid().nullable().optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    /** Replaces or appends to the content (API and MCP; the editor syncs over the WebSocket instead). */
    markdown: markdown.optional(),
    mode: z.enum(["replace", "append"]).default("replace"),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "mode"), { message: "Nothing to change" });

export const noteShareSchema = z.object({
  sharing: z.enum(["private", "people", "team"]),
  teamRole: role.default("edit"),
  people: z.array(z.object({ userId: z.string().min(1).max(100), role })).max(200).default([]),
});

export const noteFolderSchema = z.object({ name: z.string().trim().min(1, "Enter a name").max(80) });

export type NoteList = z.output<typeof noteListSchema>;
export type NoteCreate = z.output<typeof noteCreateSchema>;
export type NoteUpdate = z.output<typeof noteUpdateSchema>;
export type NoteShare = z.output<typeof noteShareSchema>;
