# Changelog

Template releases. Note anything a product has to do by hand after `pnpm template:update`
(new secret, binding or env var; `pnpm db:generate` after schema changes).

## v1.6.0 (2026-10-28)

- The dashboard swaps pages in place (Astro ClientRouter in `AppLayout`): the sidebar, command palette
  and toasts are one persisted island and no longer reload, flicker or lose state between pages. The
  header (sidebar toggle, breadcrumbs, a Search button that opens the palette, theme toggle) and the
  page are rendered by `AppLayout`; pages swap without a crossfade. The palette closes after it opens
  a page.
- The sidebar stays as you leave it (cookie `sidebar_state`, read on the server) and collapses to an
  icon rail with tooltips instead of hiding.
- `lib/panel-history.ts`: `replaceUrl`/`pushUrl` for pages that change the address themselves (back and
  forward keep working with the router) and `guardLeaving` for unsaved changes (dashboard links ask too).
  The staff mailbox uses both.
- The theme is applied to the next page before the swap (no light frame in dark mode); favicons persist.
- `prefetch: { prefetchAll: false }` in `astro.config.mjs` (hover prefetch would hit GET links like sign-out);
  `/api` links get `data-astro-reload`.
- UI: `PageHeader` actions align with the title and wrap on phones; muted placeholders; no bar for
  unlimited limits in `TickKpiCard`; Account shows 4 sessions with "Show all"; billing copy matches what's
  on the page; one width on the organization settings; the settings tab strip fades at its scrollable edge;
  no hydration warning in the audit log.
- **Manual steps:** none, unless your product changed `AppLayout`, `app-shell.tsx` or `BaseLayout`: merge by
  hand, keeping the layout split (page outside the persisted island). Pages that call `history.pushState` or
  `replaceState` should switch to `pushUrl`/`replaceUrl`, and `beforeunload` guards to `guardLeaving`.

## v1.5.1 (2026-10-28)

- Docs only: the README covers staff mailboxes, uploads and storyboards (feature table, file layout,
  a production step for Email Routing) and has two staff mailbox screenshots; the docs index links
  the AI apps page. No manual steps.

## v1.5.0 (2026-10-28)

- Staff mailboxes at `/app/admin-mail`: read and answer your own addresses (support@, legal@, …)
  from the dashboard, laid out like Gmail. Folders (inbox, snoozed, sent, archived, trash), search,
  bulk actions, keyboard shortcuts, reply / reply all / forward at the end of a thread, a docked
  compose window, drafts and "Undo send" kept in the browser, a signature per mailbox and a sender
  panel. Incoming HTML is shown in a sandboxed frame that holds back remote images until you allow
  them. Staff only (`ADMIN_EMAILS`); the sidebar shows "Mail" with an unread count when
  `ADMIN_MAILBOXES` lists any address.
- `sendNow()` in `lib/server/email.ts` sends right away and returns the Message-ID; `EmailMessage`
  takes `cc`, `fromName`, `fromEmail`, `headers` and `files` (uploads attached from R2).
- Uploads (`POST /api/app/attachments`, `/api/files`, `lib/uploads.ts`, `lib/server/uploads.ts`,
  `components/uploads/attachments.tsx`), e-mail helpers in `lib/mail/*`, `components/ui/input-group.tsx`,
  and `fullBleed` on `AppLayout` for full-width pages. `postal-mime` is a new dependency.
- **Manual steps:** `pnpm install`, `pnpm db:generate` (three `admin_mail*` tables), `pnpm cf-types`.
  To use it: set `ADMIN_MAILBOXES` (and `ADMIN_MAIL_FORWARD`, a verified Email Routing destination)
  in `wrangler.jsonc`, add an Email Routing rule "Send to Worker" for each address, and onboard the
  domain in Email Service so you can send from it. If your product already has an `email()` handler,
  call `handleAdminMail(message, to)` from it for those addresses.

## v1.4.1 (2026-10-27)

- Eyebrow labels (`eyebrow` utility in `global.css`): 12px semibold caps with 0.05em tracking in
  `foreground/55`, instead of 11px with 0.2em tracking in muted grey. Plan names and "Order summary"
  use full `text-foreground`; "Soon" and the error page label take the default colour. If a product
  page sets its own colour on `eyebrow` (e.g. `text-muted-foreground`), drop it to match.

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
- Toasts (`components/ui/sonner.tsx`): one neutral card with a tinted status icon instead of
  `richColors`. `toastCard` is exported so `toast.custom(...)` toasts match. No manual steps; drop
  `richColors` from your own `<Toaster />` if you added one.

## v1.1.0 (2026-10-26)

- `components/ui/segmented-control.tsx`: one segmented picker with a sliding thumb, arrow-key
  navigation, `fullWidth`, `shortLabel` for phones and an optional count. `PeriodTabs` is now a thin
  wrapper over it. Its `animated` prop does nothing anymore. No manual steps.

## v1.0.0 (2026-10-25)

First release, extracted from CloudFile and moved to Cloudflare: Workers, D1, Queues, Cron,
Rate Limiting, R2, Email Service.
