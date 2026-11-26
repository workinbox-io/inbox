/** Public status page: confirmed status per component, daily check counts and incidents (lib/server/status.ts). */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ServiceStatus } from "@/lib/status";
import { id, time } from "./core";

export const statusComponents = sqliteTable("status_components", {
  component: text("component").primaryKey(),
  status: text("status").$type<ServiceStatus>().notNull(),
  detail: text("detail"),
  since: time("since").notNull(),
  checkedAt: time("checked_at").notNull(),
  pendingStatus: text("pending_status").$type<ServiceStatus>(),
  pendingCount: integer("pending_count").notNull().default(0),
});

export const statusDays = sqliteTable("status_days", {
  component: text("component").notNull(),
  day: text("day").notNull(),
  ok: integer("ok").notNull().default(0),
  degraded: integer("degraded").notNull().default(0),
  down: integer("down").notNull().default(0),
}, t => [primaryKey({ columns: [t.component, t.day] })]);

export const statusIncidents = sqliteTable("status_incidents", {
  id: id(),
  component: text("component").notNull(),
  status: text("status").$type<ServiceStatus>().notNull(),
  detail: text("detail"),
  startedAt: time("started_at").notNull(),
  resolvedAt: time("resolved_at"),
}, t => [index("status_incidents_started_idx").on(t.startedAt)]);
