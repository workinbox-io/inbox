/**
 * Your product's tables. The template never edits this file, so `pnpm template:update` doesn't
 * conflict here. `projects` is the example resource behind /app/projects; rename or delete it.
 */
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, organization, updatedAt } from "./core";

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_org_idx").on(t.orgId)],
);
export * from "./mail";

export * from "./outbox";

export * from "./mail-accounts";

export * from "./mail-storage";
export * from "./mail-integrations";

export * from "./notes";

export * from "./contacts";
