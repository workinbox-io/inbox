/**
 * Shared notes: personal or shared with chosen people or the whole team (lib/notes/access.ts decides who
 * may open or edit). The live document is a Yjs doc in the note's Durable Object (src/notes/room.ts);
 * `content` and `text` are its last saved snapshot, used for lists, search, the API and to seed a new room.
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, organization, time, updatedAt, user } from "./core";

/** A Plate (Slate) document: a list of block elements. */
export type NoteContent = Record<string, unknown>[];

export const noteFolders = sqliteTable(
  "note_folders",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("note_folders_org_idx").on(t.orgId)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Who the note belongs to; null for notes created with an API key (team notes). */
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull().default(""),
    icon: text("icon"),
    folderId: text("folder_id").references(() => noteFolders.id, { onDelete: "set null" }),
    /** private: the owner only; people: plus the note_access list; team: every member of the org. */
    sharing: text("sharing", { enum: ["private", "people", "team"] }).notNull().default("private"),
    /** What everyone gets when `sharing` is team. */
    teamRole: text("team_role", { enum: ["view", "edit"] }).notNull().default("edit"),
    content: text("content", { mode: "json" }).$type<NoteContent>(),
    /** Plain text of the content, for search and previews. */
    text: text("text").notNull().default(""),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    archivedAt: time("archived_at"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("notes_org_idx").on(t.orgId, t.archivedAt, t.updatedAt), index("notes_owner_idx").on(t.ownerId)],
);

/** People a `people` note is shared with, and whether they may edit it. */
export const noteAccess = sqliteTable(
  "note_access",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["view", "edit"] }).notNull().default("edit"),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.userId] }), index("note_access_user_idx").on(t.userId)],
);
