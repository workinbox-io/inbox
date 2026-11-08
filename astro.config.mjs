// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { mcpWidgets } from "./scripts/mcp-widgets.ts";

// Only prerendered routes end up in the sitemap; app and auth pages stay out of it.
const NOT_INDEXED = /^\/(app|api|login|signup|forgot-password|reset-password|verified|pay|invite|oauth|mcp)(\/|$)/;

export default defineConfig({
  // Production URL; keep in sync with siteConfig.url (src/config/site.ts).
  site: "https://inbox.app",
  output: "server",
  adapter: cloudflare({
    // Images are served as-is; turn on the Images binding when you need resizing.
    imageService: "passthrough",
  }),
  // Better Auth keeps sessions in D1; Astro sessions (KV) aren't used.
  session: false,
  // The dashboard's ClientRouter would prefetch every link on hover: GET links like sign-out, and
  // pages that aren't cacheable anyway. Only links marked data-astro-prefetch are.
  prefetch: { prefetchAll: false },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !NOT_INDEXED.test(new URL(page).pathname),
      // Match the canonical URLs in BaseLayout, which have no trailing slash.
      serialize: (item) => ({ ...item, url: item.url.replace(/(.)\/$/, "$1") }),
    }),
  ],
  markdown: {
    shikiConfig: { themes: { light: "github-light", dark: "github-dark" }, defaultColor: "light" },
  },
  vite: {
    // mcpWidgets: `?widget` imports become MCP Apps HTML (src/mcp/widgets).
    plugins: [tailwindcss(), mcpWidgets({ srcDir: fileURLToPath(new URL("./src", import.meta.url)) })],
  },
});
