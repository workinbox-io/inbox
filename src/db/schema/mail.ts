/**
 * Organizations' mail: domains, mailboxes (personal or shared), aliases, threads and messages.
 * Everything carries orgId; every query is scoped to the org and to the mailboxes the user may open
 * (lib/server/mail/access.ts).
 *
 * Ready for an IMAP gateway later: each mailbox hands out increasing UIDs (uidNext, uidValidity)
 * and bumps modseq on every change, so a client can sync only what changed.
 */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, id, organization, time, updatedAt, user } from "./core";

const orgRef = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

/** A file of a mail, stored in R2 under attachments/mail/<orgId>/… and served by /api/files. */
export interface MailFileRef {
  url: string;
  filename: string;
  mediaType: string;
  size: number;
}

export const mailDomains = sqliteTable(
  "mail_domains",
  {
    id: id(),
    orgId: orgRef(),
    /** Lower case, e.g. acme.com or acme.inbox.app. */
    domain: text("domain").notNull(),
    /** subdomain: under our own domain (works at once); custom: the org's own domain. */
    kind: text("kind", { enum: ["subdomain", "custom"] }).notNull().default("custom"),
    /** Who receives and sends for it: Cloudflare Email Routing + Email Service (self-hosted, our own subdomains,
     *  domains added before SES) or Amazon SES (hosted mode, the org's own domain: lib/server/ses.ts). */
    provider: text("provider", { enum: ["cloudflare", "ses"] }).notNull().default("cloudflare"),
    /** SES Easy DKIM tokens: the three CNAMEs the domain needs (lib/mail/rules.ts requiredDnsRecords). */
    dkimTokens: text("dkim_tokens", { mode: "json" }).$type<string[]>(),
    /** Last DNS check: pending until MX points at the provider (and, for SES, DKIM is verified). */
    status: text("status", { enum: ["pending", "active", "failing"] }).notNull().default("pending"),
    /** What the last check found, per record (mx, spf, dkim, dmarc). */
    checks: text("checks", { mode: "json" }).$type<Record<string, boolean>>().notNull().default({}),
    checkedAt: time("checked_at"),
    /** Mail to unknown addresses on this domain goes here; null rejects it. */
    catchAllMailboxId: text("catch_all_mailbox_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("mail_domains_domain_idx").on(t.domain), index("mail_domains_org_idx").on(t.orgId)],
);

export const mailboxes = sqliteTable(
  "mailboxes",
  {
    id: id(),
    orgId: orgRef(),
    domainId: text("domain_id")
      .notNull()
      .references(() => mailDomains.id, { onDelete: "cascade" }),
    /** Full address, lower case. */
    address: text("address").notNull(),
    kind: text("kind", { enum: ["personal", "shared"] }).notNull(),
    /** The owner of a personal mailbox. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Sender name on outgoing mail. */
    displayName: text("display_name").notNull().default(""),
    signature: text("signature").notNull().default(""),
    uidValidity: integer("uid_validity").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
    uidNext: integer("uid_next").notNull().default(1),
    modseq: integer("modseq").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("mailboxes_address_idx").on(t.address), index("mailboxes_org_idx").on(t.orgId), index("mailboxes_user_idx").on(t.userId)],
);

/** Who may read and send from a shared mailbox (owners and admins may always). */
export const mailboxAccess = sqliteTable(
  "mailbox_access",
  {
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.mailboxId, t.userId] }), index("mailbox_access_user_idx").on(t.userId)],
);

/** Another address delivering into a mailbox (sales@ → anna@). */
export const mailAliases = sqliteTable(
  "mail_aliases",
  {
    id: id(),
    orgId: orgRef(),
    address: text("address").notNull(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("mail_aliases_address_idx").on(t.address), index("mail_aliases_mailbox_idx").on(t.mailboxId)],
);

export const mailThreads = sqliteTable(
  "mail_threads",
  {
    id: id(),
    orgId: orgRef(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default(""),
    /** The other side: the sender of the first incoming mail, or who we wrote to. */
    contactEmail: text("contact_email").notNull(),
    contactName: text("contact_name"),
    unread: integer("unread", { mode: "boolean" }).notNull().default(false),
    starred: integer("starred", { mode: "boolean" }).notNull().default(false),
    /** Looked like spam on arrival (lib/mail/spam.ts); lives in the Spam folder until marked otherwise. */
    spam: integer("spam", { mode: "boolean" }).notNull().default(false),
    archivedAt: time("archived_at"),
    trashedAt: time("trashed_at"),
    snoozedUntil: time("snoozed_until"),
    lastMessageAt: time("last_message_at").notNull().$defaultFn(() => new Date()),
    modseq: integer("modseq").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index("mail_threads_mailbox_idx").on(t.mailboxId, t.lastMessageAt),
    index("mail_threads_contact_idx").on(t.mailboxId, t.contactEmail),
    index("mail_threads_org_idx").on(t.orgId),
  ],
);

export const mailMessages = sqliteTable(
  "mail_messages",
  {
    id: id(),
    orgId: orgRef(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => mailThreads.id, { onDelete: "cascade" }),
    /** IMAP UID within the mailbox. */
    uid: integer("uid").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    /** Comma-separated addresses. */
    to: text("to").notNull().default(""),
    cc: text("cc").notNull().default(""),
    subject: text("subject").notNull().default(""),
    text: text("text").notNull().default(""),
    /** Incoming HTML up to a size; bigger bodies stay only in the raw message (rawKey). */
    html: text("html"),
    htmlKey: text("html_key"),
    storageKeys: text("storage_keys", { mode: "json" }).$type<string[]>().notNull().default([]),
    storageVersion: integer("storage_version").notNull().default(1),
    /** Message-ID with angle brackets. Unique per mailbox: one mail to two of our mailboxes is two copies. */
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references"),
    files: text("files", { mode: "json" }).$type<MailFileRef[]>().notNull().default([]),
    /** The original .eml in R2 (incoming mail), for "Show original", export and IMAP. */
    rawKey: text("raw_key"),
    size: integer("size").notNull().default(0),
    /** Why the spam check flagged it, if it did. */
    spamReasons: text("spam_reasons", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    index("mail_messages_thread_idx").on(t.threadId, t.createdAt),
    uniqueIndex("mail_messages_message_id_idx").on(t.mailboxId, t.messageId),
    uniqueIndex("mail_messages_uid_idx").on(t.mailboxId, t.uid),
  ],
);

/** Senders an org (or one mailbox) never wants in the inbox, or always does. */
export const mailSenderRules = sqliteTable(
  "mail_sender_rules",
  {
    id: id(),
    orgId: orgRef(),
    /** null: the whole org. */
    mailboxId: text("mailbox_id").references(() => mailboxes.id, { onDelete: "cascade" }),
    /** An address or @domain. */
    pattern: text("pattern").notNull(),
    action: text("action", { enum: ["block", "allow"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("mail_sender_rules_org_idx").on(t.orgId)],
);
