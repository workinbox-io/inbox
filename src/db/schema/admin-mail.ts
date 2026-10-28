/**
 * Staff mailboxes on our own domain (ADMIN_MAILBOXES, e.g. plugins@luxivo.app): mail that Email Routing
 * sends to the Worker, and what staff send from /app/admin/mail (lib/server/admin-mail.ts). Platform
 * data, not an org's: no orgId, only isAdmin users reach it.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, id, time } from "./core";

/** A file of an incoming mail, stored under attachments/admin-mail/… and served by /api/files. */
export interface AdminMailFile {
  url: string;
  filename: string;
  mediaType: string;
  size: number;
}

export const adminMailThreads = sqliteTable(
  "admin_mail_threads",
  {
    id: id(),
    /** Our address, one of ADMIN_MAILBOXES. */
    mailbox: text("mailbox").notNull(),
    subject: text("subject").notNull().default(""),
    /** The other side: the sender of the first incoming mail, or who we wrote to. */
    contactEmail: text("contact_email").notNull(),
    contactName: text("contact_name"),
    unread: integer("unread", { mode: "boolean" }).notNull().default(false),
    archivedAt: time("archived_at"),
    /** In the trash; "Delete forever" removes the thread and its files. */
    trashedAt: time("trashed_at"),
    /** Hidden until then; the next list read brings it back unread (wakeSnoozed in lib/server/admin-mail.ts). */
    snoozedUntil: time("snoozed_until"),
    lastMessageAt: time("last_message_at").notNull().$defaultFn(() => new Date()),
    createdAt: createdAt(),
  },
  (t) => [index("admin_mail_threads_mailbox_idx").on(t.mailbox, t.lastMessageAt), index("admin_mail_threads_contact_idx").on(t.mailbox, t.contactEmail)],
);

export const adminMailMessages = sqliteTable(
  "admin_mail_messages",
  {
    id: id(),
    threadId: text("thread_id")
      .notNull()
      .references(() => adminMailThreads.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    /** Comma-separated addresses. */
    to: text("to").notNull().default(""),
    cc: text("cc").notNull().default(""),
    subject: text("subject").notNull().default(""),
    text: text("text").notNull().default(""),
    /** The original HTML of an incoming mail, shown in a sandboxed frame. */
    html: text("html"),
    /** Message-ID with angle brackets, for threading and dedup. */
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references"),
    files: text("files", { mode: "json" }).$type<AdminMailFile[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("admin_mail_messages_thread_idx").on(t.threadId, t.createdAt), uniqueIndex("admin_mail_messages_message_id_idx").on(t.messageId)],
);

/** Per-mailbox settings: the signature replies and new e-mails start with. */
export const adminMailboxes = sqliteTable("admin_mailboxes", {
  mailbox: text("mailbox").primaryKey(),
  signature: text("signature").notNull().default(""),
  updatedAt: time("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});
