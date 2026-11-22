/**
 * Collections: lists a company defines itself (equipment, inventory, deals, tasks…). The fields live on the
 * collection (lib/collections/fields.ts), each record's values as `{ [fieldId]: value }`. Shared like notes
 * (lib/notes/access.ts `noteRole`): private to its creator, chosen people (collection_access) or the whole team.
 * View reads records, edit changes them, the creator (and managers for team ones) changes fields and sharing.
 */
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { AutomationAction, AutomationTrigger } from "@/lib/collections/automations";
import type { CollectionField, RecordValues } from "@/lib/collections/fields";
import type { CollectionSettings, RepeatUnit } from "@/lib/collections/settings";
import type { LinkKind } from "@/lib/collections/links";
import { createdAt, id, organization, updatedAt, user } from "./core";

export const collections = sqliteTable(
  "collections",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fields: text("fields", { mode: "json" }).$type<CollectionField[]>().notNull().default([]),
    sharing: text("sharing", { enum: ["private", "people", "team"] }).notNull().default("team"),
    /** What everyone gets when `sharing` is team. */
    teamRole: text("team_role", { enum: ["view", "edit"] }).notNull().default("edit"),
    /** Record IDs' prefix ("TSK"); empty = made from the name (lib/collections/ids.ts). */
    prefix: text("prefix").notNull().default(""),
    /** Rail and header look: an icon key (lib/collections/appearance.ts) and a hex colour; empty = a dot in the list's colour. */
    icon: text("icon").notNull().default(""),
    color: text("color").notNull().default(""),
    /** The next record's number. */
    nextNumber: integer("next_number").notNull().default(1),
    /** Cycles, triage, SLA and record templates (lib/collections/settings.ts). */
    settings: text("settings", { mode: "json" }).$type<CollectionSettings>().notNull().default({}),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("collections_org_idx").on(t.orgId, t.name)],
);

export const collectionRecords = sqliteTable(
  "collection_records",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    values: text("values", { mode: "json" }).$type<RecordValues>().notNull().default({}),
    /** Order on the board (ascending); new records go on top, a drop takes the midpoint of its neighbours. */
    position: real("position").notNull().default(0).$defaultFn(() => -Date.now()),
    /** "TSK-12"'s 12, unique per collection (reserved from collections.next_number). */
    number: integer("number").notNull().default(0),
    /** Rich text (a Plate document) and its plain text for search and AI apps. */
    description: text("description", { mode: "json" }).$type<unknown[]>(),
    descriptionText: text("description_text").notNull().default(""),
    /** A sub-record's parent, in the same collection. */
    parentId: text("parent_id").references((): AnySQLiteColumn => collectionRecords.id, { onDelete: "set null" }),
    /** Waiting in Triage (sent by a viewer, an API key or an AI app while triage is on) until someone accepts it. */
    triage: integer("triage", { mode: "boolean" }).notNull().default(false),
    /** The cycle it's planned in (lib/collections/settings.ts `cycleOf`); null = none. */
    cycle: integer("cycle"),
    /** In the trash since; emptied after 30 days. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    /** When its SLA breach was announced (once). */
    slaNotifiedAt: integer("sla_notified_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("collection_records_list_idx").on(t.collectionId, t.updatedAt),
    index("collection_records_parent_idx").on(t.parentId),
    index("collection_records_org_idx").on(t.orgId),
    uniqueIndex("collection_records_number_idx").on(t.collectionId, t.number),
  ],
);

export const collectionAccess = sqliteTable(
  "collection_access",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["view", "edit"] }).notNull().default("edit"),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.userId] }), index("collection_access_user_idx").on(t.userId)],
);

/** "When … then …" rules on a collection (lib/collections/automations.ts); actions run as their creator. */
export const collectionAutomations = sqliteTable(
  "collection_automations",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    trigger: text("trigger", { mode: "json" }).$type<AutomationTrigger>().notNull(),
    action: text("action", { mode: "json" }).$type<AutomationAction>().notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("collection_automations_collection_idx").on(t.collectionId)],
);

/** Comments under a record; `text` holds chat-style tokens (`<@userId>`, `<@kind:id|Title>`, lib/mentions.ts). */
export const collectionComments = sqliteTable(
  "collection_comments",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    recordId: text("record_id")
      .notNull()
      .references(() => collectionRecords.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    /** A reply's thread root (one level). */
    parentId: text("parent_id").references((): AnySQLiteColumn => collectionComments.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("collection_comments_record_idx").on(t.recordId, t.createdAt)],
);

/** Saved views of a collection (lib/collections/view-config.ts): a person's own (`owner_id`) or the team's (null). */
export const collectionViews = sqliteTable(
  "collection_views",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    position: real("position").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("collection_views_collection_idx").on(t.collectionId, t.position)],
);

/**
 * A record's history (lib/collections/activity.ts): one row per changed field (`title`, a field id, `description`,
 * `__created`), values before and after as JSON. Quick repeats by the same person fold into one row.
 */
export const collectionActivity = sqliteTable(
  "collection_activity",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    recordId: text("record_id")
      .notNull()
      .references(() => collectionRecords.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    field: text("field").notNull(),
    from: text("from_value", { mode: "json" }).$type<unknown>(),
    to: text("to_value", { mode: "json" }).$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [index("collection_activity_record_idx").on(t.recordId, t.createdAt)],
);

/**
 * Links on a record: pull requests, issues, design files, any URL (lib/collections/links.ts reads the kind and title).
 * `state` is for integrations to fill later (a GitHub app marking a PR open or merged).
 */
export const collectionRecordLinks = sqliteTable(
  "collection_record_links",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    recordId: text("record_id")
      .notNull()
      .references(() => collectionRecords.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    kind: text("kind").$type<LinkKind>().notNull(),
    title: text("title").notNull(),
    state: text("state", { mode: "json" }).$type<Record<string, unknown>>(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("collection_record_links_record_idx").on(t.recordId, t.createdAt)],
);

/** Emoji reactions on comments, one per person and emoji. */
export const collectionCommentReactions = sqliteTable(
  "collection_comment_reactions",
  {
    commentId: text("comment_id")
      .notNull()
      .references(() => collectionComments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId, t.emoji] })],
);

/**
 * Relations between records (any collection of the org): `from` blocks `to`, is related to it, or duplicates it.
 * "Blocked by" is a `blocks` row read from the other end.
 */
export const collectionRelations = sqliteTable(
  "collection_relations",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    fromId: text("from_id")
      .notNull()
      .references(() => collectionRecords.id, { onDelete: "cascade" }),
    toId: text("to_id")
      .notNull()
      .references(() => collectionRecords.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["blocks", "related", "duplicate"] }).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("collection_relations_pair_idx").on(t.fromId, t.toId, t.kind), index("collection_relations_to_idx").on(t.toId)],
);

/** Following a record (bell in its panel): `on` true = subscribed, false = muted although assigned or commenting. */
export const collectionSubscriptions = sqliteTable(
  "collection_subscriptions",
  {
    recordId: text("record_id")
      .notNull()
      .references(() => collectionRecords.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    on: integer("on", { mode: "boolean" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.recordId, t.userId] }), index("collection_subscriptions_user_idx").on(t.userId)],
);

/** Records made again on a schedule (lib/collections/settings.ts `nextRun`), from a copy of a record. */
export const collectionRecurrences = sqliteTable(
  "collection_recurrences",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    values: text("values", { mode: "json" }).$type<RecordValues>().notNull().default({}),
    description: text("description", { mode: "json" }).$type<unknown[]>(),
    every: integer("every").notNull().default(1),
    unit: text("unit").$type<RepeatUnit>().notNull(),
    /** The next record's date (UTC midnight, ms). */
    nextAt: integer("next_at", { mode: "timestamp_ms" }).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("collection_recurrences_next_idx").on(t.nextAt), index("collection_recurrences_collection_idx").on(t.collectionId)],
);
