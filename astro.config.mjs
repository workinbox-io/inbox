// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { mcpWidgets } from "./scripts/mcp-widgets.ts";

// Only prerendered routes end up in the sitemap; app and auth pages stay out of it.
const NOT_INDEXED = /^\/(app|api|login|signup|forgot-password|reset-password|verified|pay|invite|oauth|mcp|mail)(\/|$)/;

export default defineConfig({
  // Production URL; keep in sync with siteConfig.url (src/config/site.ts).
  site: "https://workinbox.io",
  // Prerendered pages as pricing.html, not pricing/index.html (as in Luxivo): Cloudflare then serves /pricing as is
  // instead of redirecting to /pricing/, matching the canonical URLs and the sitemap.
  build: { format: "file" },
  output: "server",
  adapter: cloudflare({
    // Images are served as-is; turn on the Images binding when you need resizing.
    imageService: "passthrough",
    // The AI binding is remote-only: in `astro build` (CI, no Cloudflare token) prerendering doesn't need it, so don't
    // connect. Dev keeps it; the deployed Worker gets the real binding from wrangler.jsonc either way.
    remoteBindings: !process.argv.includes("build"),
  }),
  // Better Auth keeps sessions in D1; Astro sessions (KV) aren't used.
  session: false,
  // Only explicitly marked public links are prefetched; panel navigation uses its own loaders.
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
    // The notes editor (components/notes/editor): prebundle Plate and slate-yjs in one pass so they share one
    // slate-react (two copies mean two React contexts and "useSlateStatic must be used inside <Slate>").
    optimizeDeps: {
      include: [
        "platejs",
        "platejs/react",
        "slate-react",
        "@slate-yjs/core",
        "@slate-yjs/react",
        "@platejs/yjs/react",
        "@platejs/floating",
        "@platejs/link/react",
        "@platejs/list/react",
        "@platejs/table/react",
        "@platejs/media/react",
        "@platejs/basic-styles/react",
        "@platejs/mention/react",
        "@platejs/slash-command/react",
        "@platejs/code-block/react",
        "@platejs/basic-nodes/react",
        "@platejs/indent/react",
        "@platejs/combobox/react",
        "@platejs/markdown",
        "@ariakit/react",
        "y-partyserver/provider",
        "yjs",
      ],
    },
  },
});
