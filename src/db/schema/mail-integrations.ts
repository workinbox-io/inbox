import { sqliteTable, text, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { apiKeys, organization, user } from "./core";
import { mailboxes } from "./mail";

export const mailApiAccess = sqliteTable("mail_api_access", {
  apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.apiKeyId, t.mailboxId] })]);

export const mailPushSubscriptions = sqliteTable("mail_push_subscriptions", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
}, t => [uniqueIndex("mail_push_identity").on(t.orgId, t.userId, t.endpoint), index("mail_push_org").on(t.orgId)]);
