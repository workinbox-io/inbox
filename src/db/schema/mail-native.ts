import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { mailboxes } from "./mail";
import { user } from "./core";

/** Capture changes only for mailboxes that have native clients. */
export const mailNativeWatchers = sqliteTable("mail_native_watchers", {
  mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, t => [primaryKey({ columns: [t.mailboxId, t.userId] })]);
// shortcut: retain the journal while native clients are a pilot; add acknowledged cursor compaction before broad rollout.
export const mailNativeChanges = sqliteTable("mail_native_changes", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
}, t => [index("mail_native_changes_box_seq").on(t.mailboxId, t.seq)]);
export const mailNativeGc = sqliteTable("mail_native_gc", {
  id: text("id").primaryKey(),
  mailboxId: text("mailbox_id").notNull(),
  keys: text("keys", { mode: "json" }).$type<string[]>().notNull(),
});
export const mailNativeImports = sqliteTable("mail_native_imports", {
  id: text("id").primaryKey(), mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(), fingerprint: text("fingerprint").notNull(),
  complete: integer("complete", { mode: "boolean" }).notNull().default(false),
  rootId: text("root_id"), revision: integer("revision"),
});
