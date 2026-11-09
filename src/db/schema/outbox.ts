/** Durable outgoing mail and delivery receipts; quota reservations live with the job. */
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, id, organization, time } from "./core";
import { mailboxes } from "./mail";
import type { EmailMessage } from "@/lib/server/email";

export type OutboxStatus = "pending" | "sending" | "sent" | "cancelled" | "failed" | "uncertain";
export interface OutboxPayload { htmlKey?: string | null; email: EmailMessage; threadId?: string; files: { url: string; filename: string; mediaType: string; size: number }[] }
export const mailOutbox = sqliteTable("mail_outbox", {
  id: id(), orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id"), apiKeyId: text("api_key_id"),
  idempotencyKey: text("idempotency_key").notNull(), fingerprint: text("fingerprint").notNull(),
  payload: text("payload", { mode: "json" }).$type<OutboxPayload>().notNull(),
  status: text("status").$type<OutboxStatus>().notNull().default("pending"),
  sendAt: time("send_at").notNull(), quotaDay: text("quota_day").notNull(), recipientCount: integer("recipient_count").notNull(),
  providerId: text("provider_id"), threadId: text("thread_id"), messageId: text("message_id"),
  error: text("error"), deliveryStatus: text("delivery_status"), updatedAt: time("updated_at").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("mail_outbox_idempotency_idx").on(t.orgId, t.idempotencyKey), index("mail_outbox_due_idx").on(t.status, t.sendAt), index("mail_outbox_quota_idx").on(t.orgId, t.quotaDay, t.status)]);
export const mailSendLimits = sqliteTable("mail_send_limits", {
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  scopeId: text("scope_id").primaryKey(), dailyRecipients: integer("daily_recipients").notNull(),
});
export const mailSuppressions = sqliteTable("mail_suppressions", {
  id: id(), orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(), reason: text("reason").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("mail_suppressions_recipient_idx").on(t.orgId, t.recipient)]);
export const mailDeliveryEvents = sqliteTable("mail_delivery_events", {
  id: text("id").primaryKey(), orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  outboxId: text("outbox_id").notNull().references(() => mailOutbox.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(), type: text("type").notNull(), occurredAt: time("occurred_at").notNull(),
  createdAt: createdAt(),
});
