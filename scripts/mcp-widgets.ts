/**
 * Vite plugin: `import html from "./widgets/x.tsx?widget"` bundles the widget (React and all) with
 * esbuild into one self-contained HTML document, which /mcp serves as an MCP Apps resource. Inline
 * scripts and styles need no CSP allowances in Claude or ChatGPT.
 */
import path from "node:path";
import { build } from "esbuild";
import type { ViteUserConfig } from "astro";

type VitePlugin = Extract<NonNullable<ViteUserConfig["plugins"]>[number], { name: string }>;

const PREFIX = "\0mcp-widget:";

const escapeScript = (js: string) => js.replace(/<\/(script)/gi, "<\\/$1");

export function mcpWidgets({ srcDir }: { srcDir: string }): VitePlugin {
  return {
    name: "mcp-widgets",
    enforce: "pre",
    async resolveId(source: string, importer: string | undefined) {
      const [file, query] = source.split("?");
      if (query !== "widget" || !file) return null;
      const resolved = await this.resolve(file, importer, { skipSelf: true });
      return resolved ? PREFIX + resolved.id : null;
    },
    async load(id: string) {
      if (!id.startsWith(PREFIX)) return null;
      const entry = id.slice(PREFIX.length);
      const out = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        outdir: "widget",
        format: "esm",
        platform: "browser",
        target: "es2022",
        minify: true,
        jsx: "automatic",
        metafile: true,
        alias: { "@": srcDir },
        define: { "process.env.NODE_ENV": '"production"' },
        logLevel: "silent",
      });
      // Rebuild when any file of the widget changes.
      for (const input of Object.keys(out.metafile.inputs)) {
        if (!input.includes("node_modules")) this.addWatchFile(path.resolve(input));
      }
      const js = out.outputFiles.filter((f) => f.path.endsWith(".js")).map((f) => f.text).join("\n");
      const css = out.outputFiles.filter((f) => f.path.endsWith(".css")).map((f) => f.text).join("\n");
      const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<style>${css}</style></head><body><div id="root"></div><script type="module">${escapeScript(js)}</script></body></html>`;
      return `export default ${JSON.stringify(html)};`;
    },
  };
}
