# Changelog

Template releases. Note anything a product has to do by hand after `pnpm template:update`
(new secret, binding or env var; `pnpm db:generate` after schema changes).

## v1.12.1 (2026-11-04)

- The admin panel's top pages and referrers use `BarList variant="meter"` (a short meter beside the value), the
  style products standardise on for ranked lists. No API change, no manual steps.

## v1.12.0 (2026-11-04)

- `BarList` (`components/ui/bar-list.tsx`) draws a row's share three ways: `variant="fill"` (the bar behind the name, as
  before and still the default), `"track"` (a thin rounded track under the name, like `breakdown-card`) and `"meter"`
  (a short meter beside the value, nothing behind the name). `pattern="hatched"` stripes the track or meter;
  `track` and `meter` default to the muted foreground, `hoverColor` tints the row under the pointer.
- `BarList` can be a small table: `columns` adds a header, each item's `extra` adds cells after the value
  (`hideBelow: "sm"` hides a column on phones), `sort` + `onSort` make the headers sort buttons (the caller sorts).
  Items can be `muted` (a "not set" row) or `active` (the row the page is filtered by).
- `Sparkline` takes `null` points as gaps (a day not reported is not a zero) and `onHoverIndex` for scrubbing, with a
  cursor line. `KpiCard` uses it when given `trendLabels`: pointing at the trend shows that day's value and label.
- New `HeatmapChart` (`components/ui/heatmap-chart.tsx`): two-axis density such as weekday × hour, square cells at any
  width, tooltips, an optional Quiet → Busy legend. Its scale is `lib/heatmap.ts`.
- The admin panel's top pages and referrers use `BarList variant="track" showPercentage`.
- No manual steps.

## v1.11.0 (2026-11-04)

- Dashboard languages. `t("English text")` / `tp(n, forms)` / `appLocale()` from `lib/i18n/panel.ts` work in Astro
  components, React islands and `/api/app` handlers without passing anything around: the middleware resolves the
  language (the user's `locale`, else the `LOCALE_COOKIE` or `?lang=` on public pages, else Accept-Language, else the
  first code) and renders the request inside `withLocale()` (`lib/server/i18n.ts`, AsyncLocalStorage); the browser
  gets the words from `/i18n/<code>.js`, which `BaseLayout lang` loads before the islands. Dictionaries:
  `src/i18n/app/<area>/<code>.ts`, keyed by the English text, so anything untranslated stays English.
- `src/config/languages.ts` (a product file) lists the languages; the template ships `["en"]`, so nothing changes and
  the Settings → Account language picker stays hidden until a product adds a code. `user.locale` is a new column
  (Better Auth `additionalFields`), `locals.locale` is set on every request.
- Wrapped in `t()` so far: the sidebar and ⌘K labels, API error messages (`handler()`), `timeAgo`, the auth rate-limit
  message. Products wrap the rest of their UI as they translate it (Luxivo did all of the dashboard).
- `lib/format.ts` `formatNumber`/`formatDelta` default to `appLocale()` (still "en" unless a product adds languages).
- **Manual steps:** `pnpm db:generate` (adds `user.locale`). Products that already translated pages with their own
  `lib/i18n` files: keep yours where they conflict, the module names and exports match Luxivo's.

## v1.10.0 (2026-11-03)

- `components/ui` no longer imports `lucide-react`: every glyph a component draws (checks, chevrons, close, search,
  spinner, toast icons, data-table arrows) comes from `src/config/icons.tsx`. That file is a product file like the rest
  of `src/config` and ships lucide, so nothing changes until a product swaps it for its own icon set.
- `sonner.tsx` reads the theme from the `.dark` class on `<html>` (watched), not from `next-themes`.
- New in `components/ui`: `DialogBody` (the scrolling middle of a dialog), `Card variant="inset" | "elevated"`,
  `TabsList variant="underline"` with `tabsTriggerVariants` and `underlineTab(active)` for link rows,
  `CommandDialog shouldFilter` (server-ranked results), and `CommandKbd`, `CommandShortcutKeys`, `CommandFooter` in
  `command.tsx` (`CommandPaletteKbd`/`CommandPaletteShortcutKeys` stay as aliases).
- Fixes found while a product used these components as they are: `TabsList variant="underline"` and `underlineTab`
  colour only the bottom edge (the trigger's 1px border made a box); `DialogContent` caps its height at the viewport,
  lays out as a column and scrolls, so a tall dialog no longer runs off the top; `SidebarMenuSkeleton` has a fixed width
  (no `Math.random` during render); `useIsMobile` uses `useSyncExternalStore`.
- Also in this release: staff mailboxes share the compose window's parts (`7300700`).
- **Manual steps:** none. If a product edited a `components/ui` file to change an icon, move that to `src/config/icons.tsx`.

## v1.9.1 (2026-11-02)

- E-mails on phones: the mobile styles now reach the padding react-email puts on the inner cell, so the card gets wider
  instead of narrower. Detail rows put the value under its label (no more words split mid-word), buttons go full width
  with a gap between them, the heading is 22px. Desktop is unchanged. `src/emails/components.tsx`.
- **Manual steps:** none. If you added your own `.email-container`/`.email-card` mobile rules, target `> tbody > tr > td`.

## v1.9.0 (2026-11-01)

- Homepage hero demo: the Projects screen under the headline, creating a project (New project, a name typed, the row
  and toast arrive). Plays once in view; reduced motion and thumbnails show the finished state. `components/marketing/hero-demo.tsx`.
- Features section is a bento grid (`components/marketing/features-bento.tsx`): Teams, a stat, sign-in, REST API,
  background jobs and audit log, each tile playing one small beat as the grid scrolls in. Replaces the `features` array in `index.astro`.
- Built on the Stageshow kit in `components/stageshow` (MIT). Stage colours read the site's variables (`marketing/look.css`),
  so palette changes and dark mode carry over.
- **Manual steps:** none. Replace the demo strings (project names, people, the stat) with your product's.

## v1.8.0 (2026-10-30)

- Marketing header: compact two-column dropdowns in a shared animated surface, mobile descriptions, keyboard navigation, reduced-motion support and a shrinking translucent header. Optional `description`, Lucide `icon` and local `logo` fields live on `NavLink`; dropdowns accept optional `footer` and `secondaryFooter` links. Example Product and Resources menus use template features only.
- Browser chrome follows the rendered page/dashboard background and the selected light/dark theme, including ClientRouter swaps. Use `data-browser-theme-surface` on a custom surface when its background differs from the body.
- Loading buttons hide their other direct SVG icons while the spinner is visible.
- **Manual steps:** none.

## v1.7.0 (2026-10-28)

- "Open in Claude Code / Codex / Cursor": `components/app/agent-buttons.tsx` opens a coding agent with a prompt typed in
  (nothing runs until Enter), plus "Copy prompt". Each agent tries its apps first (`claude-cli:`, then Claude Desktop's
  `claude:`, `codex:`), then a web page that takes the prompt (Claude.ai, ChatGPT, Cursor's hand-off page).
  `fallback="note"` stays on the page instead (dashboard). Links in `lib/agent-links.ts`, detection in `lib/open-deep-link.ts`.
- Docs: `agentPrompt: <name>` in a doc's frontmatter shows the buttons under the title, with prompts from the new
  `src/config/agent-prompts.ts` (product file). Every doc page links "Ask Claude" and "Ask ChatGPT" next to Markdown.
- **Manual steps:** none. Write your product's prompts in `config/agent-prompts.ts`.

## v1.6.1 (2026-10-28)

- Fix: toasts kept their styles only until the first page swap (the router dropped Sonner's injected CSS
  from `<head>`), so later toasts showed unstyled next to the sidebar. `AppLayout` hands that style to the
  next page. No manual steps.

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
