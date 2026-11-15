import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, time, updatedAt } from "./core";
import { mailboxes, mailMessages, mailThreads } from "./mail";

export const mailStorageUsage = sqliteTable("mail_storage_usage", {
  mailboxId: text("mailbox_id").primaryKey().references(() => mailboxes.id, { onDelete: "cascade" }),
  usedBytes: integer("used_bytes").notNull().default(0),
  quotaBytes: integer("quota_bytes").notNull().default(10 * 1024 ** 3),
});
export const mailStorageReservations = sqliteTable("mail_storage_reservations", {
  id: text("id").primaryKey(),
  mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  bytes: integer("bytes").notNull(),
  createdAt: createdAt(),
}, t => [index("mail_storage_reservations_mailbox_idx").on(t.mailboxId)]);
export const mailLabels = sqliteTable("mail_labels", {
  id: id(), mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  name: text("name").notNull(), createdAt: createdAt(),
}, t => [index("mail_labels_mailbox_idx").on(t.mailboxId)]);
export const mailThreadLabels = sqliteTable("mail_thread_labels", {
  threadId: text("thread_id").notNull().references(() => mailThreads.id, { onDelete: "cascade" }),
  labelId: text("label_id").notNull().references(() => mailLabels.id, { onDelete: "cascade" }),
}, t => [primaryKey({ columns: [t.threadId, t.labelId] })]);
export interface FilterCondition { field: "from" | "to" | "subject" | "text" | "attachment"; value: string }
export interface FilterActions { labelId?: string; archive?: boolean; forwardTargetId?: string }
export const mailFilters = sqliteTable("mail_filters", {
  id: id(), mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  name: text("name").notNull(), position: integer("position").notNull().default(0), enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  conditions: text("conditions", { mode: "json" }).$type<FilterCondition[]>().notNull(),
  actions: text("actions", { mode: "json" }).$type<FilterActions>().notNull(), createdAt: createdAt(),
}, t => [index("mail_filters_mailbox_idx").on(t.mailboxId, t.position)]);
export const mailForwardTargets = sqliteTable("mail_forward_targets", {
  id: id(), mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  address: text("address").notNull(), tokenHash: text("token_hash"), expiresAt: time("expires_at"), verifiedAt: time("verified_at"), createdAt: createdAt(),
});
export const mailFilterRuns = sqliteTable("mail_filter_runs", {
  messageId: text("message_id").notNull().references(() => mailMessages.id, { onDelete: "cascade" }),
  filterId: text("filter_id").notNull().references(() => mailFilters.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, t => [primaryKey({ columns: [t.messageId, t.filterId] })]);
/** Out of office per mailbox: one reply per sender every few days (lib/mail/auto-reply.ts). */
export const mailAutoReplies = sqliteTable("mail_auto_replies", {
  mailboxId: text("mailbox_id").primaryKey().references(() => mailboxes.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  subject: text("subject").notNull().default(""), text: text("text").notNull().default(""),
  startsAt: time("starts_at"), endsAt: time("ends_at"), updatedAt: updatedAt(),
});
export const mailAutoReplyLog = sqliteTable("mail_auto_reply_log", {
  mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(), sentAt: time("sent_at").notNull(),
}, t => [primaryKey({ columns: [t.mailboxId, t.sender] })]);
/** Canned replies, per mailbox so a shared mailbox's team shares them. */
export const mailTemplates = sqliteTable("mail_templates", {
  id: id(), mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  name: text("name").notNull(), subject: text("subject").notNull().default(""), text: text("text").notNull(), createdAt: createdAt(),
}, t => [index("mail_templates_mailbox_idx").on(t.mailboxId)]);
