/**
 * Team drive: folders and files (content in R2 under `drive/<org>/<id>`). Any item can be shared like a note
 * (private / people / team) and shares are inherited down the tree; lib/drive/access.ts decides.
 * `path` is `/<rootId>/…/<id>/`: an item's ancestors are the ids in it, a subtree is a prefix.
 */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, id, organization, time, updatedAt, user } from "./core";

export const driveItems = sqliteTable(
  "drive_items",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** null: at the root of the owner's "My drive". */
    parentId: text("parent_id"),
    path: text("path").notNull(),
    kind: text("kind", { enum: ["folder", "file"] }).notNull(),
    name: text("name").notNull(),
    /** Who it belongs to; null when made with an API key or its owner left (run by the managers). */
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    sharing: text("sharing", { enum: ["private", "people", "team"] }).notNull().default("private"),
    teamRole: text("team_role", { enum: ["view", "edit"] }).notNull().default("view"),
    size: integer("size").notNull().default(0),
    mediaType: text("media_type"),
    r2Key: text("r2_key"),
    trashedAt: time("trashed_at"),
    trashedBy: text("trashed_by"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("drive_items_parent_idx").on(t.orgId, t.parentId, t.trashedAt),
    index("drive_items_path_idx").on(t.orgId, t.path),
    index("drive_items_owner_idx").on(t.ownerId),
  ],
);

/** People an item is shared with (sharing = people), inherited by everything inside it. */
export const driveAccess = sqliteTable(
  "drive_access",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => driveItems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["view", "edit"] }).notNull().default("view"),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.userId] }), index("drive_access_user_idx").on(t.userId)],
);

/** A multipart upload between start and complete; its bytes count toward the quota while it runs. */
export const driveUploads = sqliteTable(
  "drive_uploads",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    mediaType: text("media_type").notNull(),
    size: integer("size").notNull(),
    r2Key: text("r2_key").notNull(),
    uploadId: text("upload_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("drive_uploads_org_idx").on(t.orgId, t.createdAt)],
);

/** Public links: anyone with the token (and the password, if set) can view and download until it expires. */
export const driveLinks = sqliteTable(
  "drive_links",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => driveItems.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    passwordHash: text("password_hash"),
    expiresAt: time("expires_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("drive_links_token_idx").on(t.token), index("drive_links_item_idx").on(t.itemId)],
);
