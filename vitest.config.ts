import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure modules (no `cloudflare:workers` imports). Test request flows against `astro dev`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "astro:middleware": "astro/middleware" } },
  test: { include: ["test/**/*.test.ts"] },
});
