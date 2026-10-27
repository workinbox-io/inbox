# Changelog

Template releases. Note anything a product has to do by hand after `pnpm template:update`
(new secret, binding or env var; `pnpm db:generate` after schema changes).

## v1.4.0 (2026-10-27)

- Storyboards (`src/components/storyboard`): animated SVG diagrams for marketing pages, drawn like a
  node editor. Bordered cards on a dotted canvas, thin edges between handles, a spark running along
  an edge when something moves, and a request card with a method badge, a status light and a dashed
  line to the node it belongs to. You describe a scene (grid, nodes, edges, steps) with
  `defineScene()` and render it with `<Scene scene={...} />`. There is a wide and a phone layout,
  reduced motion gets numbered captions, and light and dark themes come from CSS variables.
  `scenes/example.ts` is a scene to copy from, and the README covers the rest. GSAP is a new
  dependency. **Manual step:** `pnpm install`. v1.3.0 already contained an unfinished copy of these
  files without GSAP, which doesn't typecheck; update to v1.4.0 rather than stopping at v1.3.0.

## v1.3.0 (2026-10-27)

- MCP server at `/mcp` for Claude, ChatGPT, Claude Code and Cursor (`@modelcontextprotocol/server`
  v2, stateless, also serves 2025-era clients). Tools live in `src/mcp` (`core.ts` template,
  `app.ts` yours) and call `lib/server` like API routes: org scoping, plan limits, audit (with the
  app's name as `via`). Read-only and write tools follow the `read` / `write` scopes; `manage: true`
  tools are for owners and admins only.
- OAuth 2.1 server for those apps (Better Auth `jwt` + `@better-auth/mcp`, dynamic client
  registration and Client ID Metadata Documents): `/oauth/organization` picks the organization,
  `/oauth/consent` asks for consent, Settings → AI apps lists and disconnects connections.
  Organization API keys work on `/mcp` too.
- MCP Apps widgets (render in Claude and ChatGPT): `src/mcp/widgets/*.tsx` imported with `?widget`
  are bundled into one HTML document by `scripts/mcp-widgets.ts`. Example: the projects list.
- New plan feature `mcpAccess` (Pro and up).
- **Manual steps:** `pnpm install`, `pnpm db:generate` (new OAuth tables in `schema/core.ts`), then
  `pnpm db:migrate`. `wrangler.jsonc` gains the `global_fetch_strictly_public` compatibility flag.
  Add `mcpAccess` to `FEATURE_PLAN` / `FEATURE_LABELS` if your `config/plans.ts` differs.

## v1.2.0 (2026-10-27)

- IndexNow: `scripts/indexnow.ts` sends the built sitemap's URLs to IndexNow after `pnpm deploy`
  and the `Deploy` workflow, so Bing (and ChatGPT search, Copilot) recrawl changed pages sooner.
  A failed ping only warns. `pnpm setup` creates the key file. **Manual step:** in an existing
  product run `node scripts/indexnow.ts --init` once and commit the new `public/<key>.txt`.

## v1.1.0 (2026-10-26)

- `components/ui/segmented-control.tsx`: one segmented picker with a sliding thumb, arrow-key
  navigation, `fullWidth`, `shortLabel` for phones and an optional count. `PeriodTabs` is now a thin
  wrapper over it. Its `animated` prop does nothing anymore. No manual steps.

## v1.0.0 (2026-10-25)

First release, extracted from CloudFile and moved to Cloudflare: Workers, D1, Queues, Cron,
Rate Limiting, R2, Email Service.
