# CLAUDE.md

WorkInbox (workinbox.io): open-source mail, contacts, calendar and drive for teams, a Google Workspace alternative.
Runs self-hosted (`DEPLOY_MODE=self`, one company on its own Cloudflare account) or hosted (`cloud`, plans on).
Plan and phases: see the project plan; phase 1 (domains, mailboxes, mail) is in place.

## Organizations' mail (product)

- Tables: `src/db/schema/mail.ts` (re-exported from `app.ts`): `mail_domains`, `mailboxes` (personal per member or
  shared), `mailbox_access`, `mail_aliases`, `mail_threads`, `mail_messages`, `mail_sender_rules`. Mailboxes hand out
  IMAP-style UIDs (`uid_next`, `uid_validity`) and bump `modseq` on every change, for a future IMAP gateway / sync API.
- Incoming: `email()` in `src/worker.ts` calls `handleOrgMail` (`lib/server/mail/store.ts`) first: address → mailbox,
  alias or the domain's catch-all (plus addressing stripped), spam score and sender rules (`lib/mail/rules.ts`), raw .eml
  in R2 under `mail-raw/<org>/<mailbox>/`, files under the org's `attachments/`. Unknown addresses fall through to the
  staff mailboxes, then are rejected.
- Access: `lib/server/mail/access.ts` (`viewerMailboxes`): own personal mailbox, shared ones granted in
  `mailbox_access`, all shared ones for owners/admins. Every mail query is scoped to that list.
- UI: `/app/mail` (`components/mailbox/*`, a copy of `components/admin-mail` adapted: starred and spam folders, search
  operators `from: to: subject: has:attachment is:unread is:starred`). Settings → Mail (`/app/settings/mail`,
  `components/mailbox/mail-settings.tsx`) manages domains (DNS records + DoH check), mailboxes, aliases, catch-all.
- Two experiences: owners/admins get the dashboard (AppLayout) with mail inside; members get mail only
  (`layouts/MailLayout.astro`, `MailboxApp` with `account`: full screen, account menu in the rail with signature,
  password, theme, sign out). `pages/app/index.astro` sends members to `/app/mail` (product change to a template page).
- People on the org's domain (Settings → Mail → Add person, `lib/server/mail/people.ts`): user + credential account +
  member + personal mailbox + shared access in one `db.batch`, written directly (no verification mail, no personal
  org from the sign-up hook); the admin gets a temporary password once and can reset it (`mailOnly` mailboxes).
- API: `/api/app/mail/threads` (list/send/patch/delete), `/threads/[id]`, `/threads/[id]/reply`,
  `/messages/[id]/raw`, `/mailboxes` (own signature), `/settings` (owners/admins, one `action` per POST).
- Test incoming mail locally: `curl -X POST "localhost:4321/cdn-cgi/handler/email?from=a@b.com&to=anna@acme.test" --data-binary @mail.eml`.
- Template files changed here (upstream them to the template): `src/worker.ts` (org mail hook),
  `components/app/settings-nav.tsx` (Mail tab). Template bug to fix there: `components/admin-mail/composer.tsx` shows
  a hardcoded "Luxivo" sender name and `admin-mail/drafts.ts` uses `luxivo:` storage keys (fixed in `components/mailbox`).

## Workspace apps: views and UI kit (product)

- Two views of the apps (mail, notes, and the ones to come): the **user view** (MailLayout, full screen, app rail on the
  left, `AppTopBar`, account menu at the bottom of the app's rail) and the **admin view** (inside AppLayout, controls in
  its header slot "actions"). Members always get the user view; owners and admins pick it in the avatar menu ("Switch to
  user/admin view" → `/app/view?to=user|admin&next=…`), stored per user in a cookie (`lib/server/workspace-view.ts`,
  `workspaceView()` in each app page).
- UI kit in `components/workspace/` (extracted from Mail, so new apps look like Inbox): `AppFrame` (both views' frame,
  toasts in the user view), `Rail`/`RailAction`/`RailItem`/`RailSection`, `ListPane`/`ListHeader`/`ListSearch`/
  `ListRow`/`ListEmpty`, `SplitView` (resizable list + detail from md, one of them on phones), `DetailHeader`/
  `IconAction`, `ui.tsx` (`Kbd`, `tint`, `WORKSPACE_COLORS`, `useMediaQuery`, `isTyping`, `useMounted`), and the Astro
  parts `AppRail.astro` (app switcher) and `AppTopBar.astro`. Shortcuts follow Mail: `c` new, `/` search, `Esc` close;
  check `shortcutsPaused(e)` so they pause while typing or with a dialog or menu open.
- Row actions are defined once as `MenuAction[]` (`workspace/action-menu.tsx`, `cleanActions` drops hidden ones) and
  shown two ways: right-click / long press (`ActionMenu`) and the "…" on hover (`ActionMenuButton`). `ListRow` and
  `RailItem` take `actions`. In use: mail threads (`threadActions` in `mailbox-app.tsx`, acting on the selection when the
  row is in it), mailboxes in the rail, messages in a thread, notes (`noteActions`) and note folders. Editors and fields
  keep the browser's own menu.
  Mail still uses its own `FolderRail`/`ThreadList` (the kit's originals); move it onto the kit when touching them.

## Shared notes (product)

- Tables: `src/db/schema/notes.ts` (`notes`, `note_access`, `note_folders`). Sharing is `private` (owner only, admins
  included out), `people` (`note_access` with view/edit) or `team` (everyone, `team_role`). Rules in `lib/notes/access.ts`
  (pure), queries scoped by `lib/server/notes/access.ts` (`visibleNotes`, `requireNote`). API keys see team notes only.
- Live editing: one Durable Object per note, `NoteRoom` (`src/notes/room.ts`, y-partyserver `YServer`, hibernating,
  SQLite storage). The browser asks `POST /api/app/notes/:id/ticket` for a 60 s HMAC ticket (`lib/notes/ticket.ts`) and
  connects to `/notes-sync/:id?ticket=…`; `src/worker.ts` verifies it before Astro (`lib/server/notes/sync.ts`) and the
  room enforces read-only. The room saves content, plain text and title back to D1 (debounced, and when the last person
  leaves); a new room starts from D1. API/MCP content changes go through the room (`applyToRoom`: replace/append
  markdown), sharing/archive changes close sockets (`kickRoom`) so clients reconnect with new tickets.
- Document model: Plate (platejs v53) node types in `lib/notes/plate.ts` (server-side, markdown in/out) and the editor in
  `components/notes/editor/*` (plugins, nodes, floating toolbar, "/" menu, @mentions, cursors, image upload through
  `/api/app/attachments`). The Yjs doc holds the content (`XmlText "content"`) and the title (`Text "title"`),
  `lib/notes/ydoc.ts`. Plate's Slate context only exists inside `PlateContent`: render overlays with a plugin's
  `render.afterEditable`. Plate packages are in `optimizeDeps.include` (astro.config.mjs) so slate-react isn't duplicated.
  The editor is browser-only: `NotePane` mounts it after hydration (`useMounted`), since rendering it on the server
  never finishes the page stream. Fixed toolbar above the note (`editor/fixed-toolbar.tsx`, Plate playground layout)
  plus the floating one on selection; colours and alignment come from `@platejs/basic-styles`.
- UI: `/app/notes[/<id>]` (`pages/app/notes/[...id].astro`, `components/notes/notes-app.tsx`), built on the workspace
  kit below.
- API: `/api/app/notes` (list/search, create), `/[id]` (get with markdown, patch, delete archived), `/[id]/share`,
  `/[id]/ticket`, `/people`, `/folders`; `/api/v1/notes` re-exports them. MCP: `src/mcp/notes.ts` (`notes_search`,
  `notes_get`, `notes_create`, `notes_update`, `notes_archive`).
- Template files changed here: `src/worker.ts` (notes WebSocket route, `NoteRoom` export), `wrangler.jsonc`
  (`NOTE_ROOM` binding and DO migration), `astro.config.mjs` (`optimizeDeps`).

## Marketing site and SEO/GEO (product)

- Modelled on Luxivo (`../support-chat`): the same look system (`styles/marketing.css`, scoped to `.mk` by
  `MarketingLayout look="paper"`; docs, legal and error pages use `look="plain"`), GSAP motion
  (`scripts/marketing-motion.ts`: `data-split`, `data-reveal`, `data-magnetic`) and craft components
  (`components/site/craft/*`, `BrowserFrame`, `ComparisonTable`). WorkInbox colours: paper and ink, no brand colour,
  Instrument Serif headlines, emphasis = serif italic in `--mk-soft-ink`.
- Screens on the site are the real app: `pnpm shots [--seed] [name]` (`scripts/marketing-shots.ts`, needs `pnpm dev`)
  seeds the demo org (acme.test) through the local email handler and the notes API, then saves `public/marketing/*.webp`.
- Pages: home (`pages/index.astro`), `/pricing`, `/shared-mailbox`, `/google-workspace-alternative`, `/vs` and
  `/vs/<slug>` from `config/compare.ts` (competitor facts from their own pages with `checked` and `sources`; re-check
  before editing, keep "pick them if" and our gaps honest). `/llms.txt` is generated from `config/plans.ts` and
  `compare.ts` (`lib/llms.ts`): update it with every shipped feature, like Luxivo's feature rollout (landing, `/vs` row,
  `llms.txt`, docs, footer).
- Claim only what ships: no IMAP, no import, calendar/contacts/drive are "Soon".
- Billing (workinbox.io runs `DEPLOY_MODE=cloud`, PADDLE_ENV production; self-hosters set `self`): per person = personal
  mailboxes (`lib/server/seats.ts`). Checkout sells that quantity; adding/removing/converting a personal mailbox calls
  `seatsChanged` → job `billing.seats` → PATCH the Paddle subscription (prorated next period); a daily task reconciles.
  Sending mail, adding people, mailboxes and domains need an active trial or plan (`requireActivePlan`); receiving and
  forwarding rules keep working.
- Open source under AGPL-3.0 (LICENSE), public at github.com/jakub-kalamarz/inbox.
- OpenSEO project "WorkInbox" (US/en) holds the keyword research and context.

## Template

Micro SaaS on Cloudflare Workers, built from the shared template (see TEMPLATE.md for how template
updates are merged). Astro 7 SSR + React islands, D1 + Drizzle, Better Auth with organizations,
Paddle billing, Queues + Cron, Cloudflare Email Service. pnpm, Node 22.18+.

## Commands

```sh
pnpm dev                 # astro dev (workerd, local D1/queues); manage with astro dev stop|status|logs
pnpm typecheck           # wrangler types + astro sync + tsc
pnpm test                # vitest, test/*.test.ts (pure modules only: no cloudflare:workers imports)
pnpm build
pnpm db:generate         # drizzle-kit: SQL migration from src/db/schema changes
pnpm db:migrate          # apply migrations to local D1
```

E-mails in dev are printed to the dev server log (`astro dev logs`), including verification links.
Trigger the cron locally: `curl "localhost:4321/cdn-cgi/handler/scheduled?cron=17+3+*+*+*"`.

## Architecture

- `src/worker.ts` is the Worker entry: Astro's `handle()` for HTTP, plus `queue()` (jobs from
  `src/jobs`) and `scheduled()` (daily tasks in `src/jobs/cron.ts`).
- Bindings and secrets: `import { env } from "cloudflare:workers"`. Types come from
  `worker-configuration.d.ts` (generated, `pnpm cf-types`) plus secrets declared in `src/env.d.ts`.
- Domain logic lives in `src/lib/server`; API routes and pages call it. `projects.ts` is the
  example resource showing the full pattern (limit check, audit, queue job, API route).
- API routes wrap logic in `handler()`/`manageHandler()` (`lib/server/api.ts`): throw `HttpError`,
  validate with `parseBody(request, schema)` (schemas in `lib/validation.ts`), call `audit()`.
- `src/middleware.ts` guards `/app` and `/api/app` (session) and `/api/v1` (API keys, rate limit,
  plan feature), and sets `locals.orgId`/`locals.role`. Every query must be scoped to the org.
- Languages (v1.11.0): `config/languages.ts` lists them (template: English only). UI text goes through `t("English
  text")` / `tp()` / `appLocale()` from `lib/i18n/panel.ts`, which works in Astro, islands and `/api/app` (the middleware
  runs each request in `withLocale()`, `lib/server/i18n.ts`; the browser loads `/i18n/<code>.js`). Dictionaries:
  `src/i18n/app/<area>/<code>.ts`, keyed by the English text. `user.locale` is the user's pick (Settings → Account).
- Dashboard navigation: `AppLayout` uses Astro's ClientRouter. The sidebar, command palette and toasts are one
  persisted island (`app-shell.tsx`, `transition:persist`); the header and page render next to it. Pages that change
  the address in place use `replaceUrl`/`pushUrl` (`lib/panel-history.ts`), never `history.*State(null, …)`;
  unsaved-change guards use `guardLeaving`; GET links to `/api` need `data-astro-reload`. Islands' module code runs
  once per tab: per-page work listens to `astro:after-swap`.
- D1 has no interactive transactions: use `db.batch([...])`. Times are integer ms (`timestamp_ms`).
- Async work goes through `enqueue()` (`lib/server/queue.ts`); handlers must be idempotent.
  `sendEmail()` also goes through the queue; `deliverEmail()` does the actual send.
- AI apps: `/mcp` (`lib/server/mcp.ts`) serves the tools in `src/mcp` (`core.ts` template, `app.ts`
  product) to Claude, ChatGPT and CLIs. Tools are `defineTool()` wrappers over `lib/server` with a
  zod `input`, `scope: "write"` for changes and `ctx.audit()`. Auth is an OAuth token from our own
  server (Better Auth `mcp` plugin, `lib/server/oauth.ts`: org picked at `/oauth/organization`,
  stored as the token's `org_id` claim, consent re-checked per request) or an org API key.
  Widgets: `src/mcp/widgets/*.tsx` imported with `?widget` become one HTML file (MCP Apps).
  Test with `npx @modelcontextprotocol/inspector` against `localhost:4321/mcp`.
- Billing: `lib/server/paddle.ts` (plain fetch, no SDK). Paddle prices carry
  `custom_data: { plan, interval }` (set by `pnpm paddle:sync`); webhooks re-fetch the subscription
  and mirror it into `subscriptions`. Plans, limits and features: `src/config/plans.ts`.

- Staff mailboxes (`ADMIN_MAILBOXES`, e.g. support@ and legal@ on your domain; off while empty): Email Routing "Send
  to Worker" → `email()` in `src/worker.ts` → `handleAdminMail` (`lib/server/admin-mail.ts`, pure rules in
  `lib/admin-mail/rules.ts`, tables in `db/schema/admin-mail.ts`) stores and threads the mail and forwards a copy to
  `ADMIN_MAIL_FORWARD`. Staff (`ADMIN_EMAILS`) work at `/app/admin-mail` (`components/admin-mail/*`), laid out like Gmail:
  folders, search, bulk actions, shortcuts, reply / reply all / forward, a docked compose window, drafts and "Undo send"
  in the browser, a signature per mailbox. Incoming HTML renders in a sandboxed iframe whose CSP blocks remote images until
  "Show images". Mail goes out right away via `sendNow` (`lib/server/email.ts`) from the mailbox address.
- Uploads: `POST /api/app/attachments` stores a file in R2 as `attachments/<orgId>/<random>/<safe-name>`
  (`lib/server/uploads.ts`, rules in `lib/uploads.ts`), served by `/api/files`; the composer UI is
  `components/uploads/attachments.tsx`. E-mail helpers (threading, quoted text, body text): `lib/mail/*`.
- UI: pickers use `components/ui/segmented-control.tsx` (`PeriodTabs` wraps it); custom toasts use
  `toastCard` from `components/ui/sonner.tsx`; small caps labels use the `eyebrow` utility.
  Animated marketing diagrams: `components/storyboard` (`defineScene()` + `<Scene />`, see its README).
  Faux product UI on marketing pages (homepage hero demo, features bento): `components/marketing/*` on the
  Stageshow kit in `components/stageshow` (see its README); stage colours read the site's variables (`look.css`).

## Template vs product files

Product code goes in `src/db/schema/app.ts`, `src/jobs/app*.ts`, `src/mcp/app.ts`, `src/config/*`,
content, and new files. Changes to template files (auth, api, settings panels, `components/ui`)
should be made in the template repo and merged, so products don't drift.
