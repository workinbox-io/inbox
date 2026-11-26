/**
 * The bell's notifications from the apps other than mail and chat (lib/server/notifications.ts): shares, invitations,
 * assignments, mentions in notes and automations, grouped by `group_key` (one item, e.g. `note:<id>`). Plus each
 * person's settings: the e-mail summary and the kinds they muted.
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { NotifyApp, NotifyKind } from "@/lib/notifications";
import { createdAt, id, organization, time, user } from "./core";

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotifyKind>().notNull(),
    app: text("app").$type<NotifyApp>().notNull(),
    /** Who did it; null for automations. */
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href").notNull(),
    groupKey: text("group_key").notNull(),
    createdAt: createdAt(),
    readAt: time("read_at"),
    /** Included in an e-mail summary. */
    digestedAt: time("digested_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.orgId, t.createdAt), index("notifications_digest_idx").on(t.readAt, t.digestedAt, t.createdAt)],
);

export const notificationPrefs = sqliteTable("notification_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** An e-mail with what stayed unread for a few hours, at most once a day. */
  digest: integer("digest", { mode: "boolean" }).notNull().default(true),
  muted: text("muted", { mode: "json" }).$type<NotifyKind[]>().notNull().default([]),
  lastDigestAt: time("last_digest_at"),
});

/**
 * Groups taken off the bell: "Done" (something newer than `at` brings the group back), snoozed (back at `until`) or
 * muted (gone for good, until restored). Rules in lib/notifications.ts `placeGroup`.
 */
export const notificationDismissals = sqliteTable(
  "notification_dismissals",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    at: time("at").notNull(),
    until: time("until"),
    muted: integer("muted", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
