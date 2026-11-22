/** Apps turned on or off per organization (config/modules.ts). No row = on. */
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization, updatedAt } from "./core";

export const orgModules = sqliteTable(
  "org_modules",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.moduleId] })],
);
