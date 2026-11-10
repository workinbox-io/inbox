/**
 * The team address book: one per organization, every member may read and edit it. Filled by hand, by import
 * (CSV / vCard) and from sent mail (lib/server/contacts.ts `recordSent`). The org's own people and shared
 * mailboxes are not stored here: they are read live from `mailboxes` (the directory).
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, organization, time, updatedAt } from "./core";

export interface ContactValue {
  value: string;
  label?: string;
}

const orgRef = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const contacts = sqliteTable(
  "contacts",
  {
    id: id(),
    orgId: orgRef(),
    name: text("name").notNull().default(""),
    company: text("company").notNull().default(""),
    title: text("title").notNull().default(""),
    note: text("note").notNull().default(""),
    /** In the order shown; the first is the main address. Mirrored in contact_emails for lookups. */
    emails: text("emails", { mode: "json" }).$type<ContactValue[]>().notNull().default([]),
    phones: text("phones", { mode: "json" }).$type<ContactValue[]>().notNull().default([]),
    source: text("source", { enum: ["manual", "sent", "import"] }).notNull().default("manual"),
    /** Mail sent to the contact: ranks composer suggestions. */
    contactCount: integer("contact_count").notNull().default(0),
    lastContactedAt: time("last_contacted_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contacts_org_idx").on(t.orgId, t.name), index("contacts_recent_idx").on(t.orgId, t.lastContactedAt)],
);

/** Every address of every contact, lower case: one address belongs to one contact per org. */
export const contactEmails = sqliteTable(
  "contact_emails",
  {
    orgId: orgRef(),
    email: text("email").notNull(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.email] }), index("contact_emails_contact_idx").on(t.contactId)],
);

export const contactGroups = sqliteTable(
  "contact_groups",
  {
    id: id(),
    orgId: orgRef(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("contact_groups_org_idx").on(t.orgId)],
);

export const contactGroupMembers = sqliteTable(
  "contact_group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => contactGroups.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.contactId] }), index("contact_group_members_contact_idx").on(t.contactId)],
);
