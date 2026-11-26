import { defineConfig } from "drizzle-kit";

// Only generates SQL; wrangler applies it (pnpm db:migrate / db:migrate:remote).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
});
