# CLAUDE.md

WorkInbox (workinbox.io): open-source mail, contacts, calendar and drive for teams, a Google Workspace alternative.
Runs self-hosted (`DEPLOY_MODE=self`, one company on its own Cloudflare account) or hosted (`cloud`, plans on).
Plan and phases: see the project plan; phase 1 (domains, mailboxes, mail) is in place.

## Organizations' mail (product)

- Tables: `src/db/schema/mail.ts` (re-exported from `app.ts`): `mail_domains`, `mailboxes` (personal per member or
  shared), `mailbox_access`, `mail_aliases`, `mail_threads`, `mail_messages`, `mail_sender_rules`. Mailboxes hand out
  IMAP-style UIDs (`uid_next`, `uid_validity`) and bump `modseq` on every change, for a future IMAP gateway / sync API.
- Incoming: `email()` in `src/worker.ts` calls `handleOrgMail` (hooked in `src/app-worker.ts`) (`lib/server/mail/store.ts`) first: address → mailbox,
  alias or the domain's catch-all (plus addressing stripped), spam score and sender rules (`lib/mail/rules.ts`), raw .eml
  in R2 under `mail-raw/<org>/<mailbox>/`, files under the org's `attachments/`. Unknown addresses fall through to the
  staff mailboxes, then are rejected. Sent mail gets its .eml a minute later: the every-minute cron rebuilds it from
  the stored message (`backfillSentRaw`, `lib/server/mail/raw.ts`, MIME builder `lib/mail/mime.ts`), so every message
  has a `raw_key` for "Show original", export and backup.
- Hosted (`cloud`) custom domains go through Amazon SES, not Cloudflare (which only serves zones in our account):
  `mail_domains.provider = "ses"`, SES identity per domain, sending via `sendOrgMail` (`mail/deliver.ts`), receiving
  S3 → SNS → `/api/ses/webhook` → job `mail.inbound` → `handleOrgMail`. Setup and runbook: `docs/ses.md`,
  `scripts/ses-setup.sh`. Self-hosted and older domains stay `cloudflare`. Free addresses `<name>.workinbox.io`
  (`claimSubdomain`, `kind: "subdomain"`) are SES too, records written with `MAIL_ZONE_TOKEN` (docs/ses.md). "Connect Cloudflare"
  (`connectCloudflare`, action `domain.connectCloudflare`) adds an `ses` domain's records with a one-time API token.
- Import (Settings → Mail → Import mail, owners/admins): .mbox or .eml files (joined into one mbox in the browser)
  uploaded to R2 in 10 MB parts (`/api/app/mail/imports`), then job `mail.import` (`lib/server/mail/import.ts`, pure
  parser `lib/mail/mbox.ts`) feeds batches of 40 to `handleOrgMail(…, imported)`: read, dated from the header, sent
  when from the mailbox, Gmail labels place it, no rules or notifications, duplicates skipped by Message-ID.
- Signatures: the org's brand (Settings → Mail → Signature template: company, website, logo, colour;
  `mail_signature_brands`) plus each mailbox's card (`mailboxes.signature_card`: name, role, phone; `signature` = its
  free lines). `lib/mail/signature.ts` renders text + e-mail-safe HTML; `prepareMailSend` appends it unless
  `signature: false` (composer checkbox) or an automated forward. The composer only previews it (ComposeBody `footer`).
- Drafts: per person on the server (`mail_drafts`, key = thread id for a reply, `new`, or `d-<uuid>`;
  `lib/server/mail/drafts.ts`, `/api/app/mail/drafts[/key]`). The browser keeps a copy for instant reads and syncs it
  (`components/mailbox/drafts.ts`: debounced PUT/DELETE, `syncDrafts()` on load, newest wins). Drafts and Outbox are
  folders of the same list (`MailView`, `isVirtualFolder`): rows from `draftRows` / `outboxRows`, detail pane = the
  thread (reply drafts), `ComposeWindow inline` (new ones) or `OutboxDetail`; `?pane=drafts|outbox`, `?draft=<key>`. AI apps' `mail_draft` lands there (`source: "ai"`).
- Access: `lib/server/mail/access.ts` (`viewerMailboxes`): own personal mailbox, shared ones granted in
  `mailbox_access`, all shared ones for owners/admins. Every mail query is scoped to that list.
- UI: `/app/mail` (`components/mailbox/*`, a copy of `components/admin-mail` adapted: starred and spam folders, search
  operators `from: to: subject: has:attachment is:unread is:starred`). Settings → Domains and mailboxes (the settings
  dialog's `mail-admin` section, `components/mailbox/mail-settings.tsx`) manages domains (DNS records + DoH check), mailboxes, aliases, catch-all.
- Two experiences: owners/admins get the dashboard (AppLayout) with mail inside; members get mail only
  (`layouts/MailLayout.astro`, `MailboxApp` with `account`: full screen, account menu in the rail with signature,
  password, theme, sign out). `pages/app/index.astro` sends members to `/app/mail` (product change to a template page).
- People on the org's domain (Settings → Mail → Add person, `lib/server/mail/people.ts`): user + credential account +
  member + personal mailbox + shared access in one `db.batch`, written directly (no verification mail, no personal
  org from the sign-up hook); the admin gets a temporary password once and can reset it (`mailOnly` mailboxes).
- API: `/api/app/mail/threads` (list/send/patch/delete), `/threads/[id]`, `/threads/[id]/reply`,
  `/messages/[id]/raw`, `/mailboxes` (own signature), `/settings` (owners/admins, one `action` per POST).
- Test incoming mail locally: `curl -X POST "localhost:4321/cdn-cgi/handler/email?from=a@b.com&to=anna@acme.test" --data-binary @mail.eml`.
- Worker hooks (org mail, delivery-event queue, every-minute cron) live in `src/app-worker.ts` (template v1.17.0);
  settings are one dialog (see "Workspace apps"). `src/worker.ts` stays the template's.

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
- Settings: one dialog for every app on Mail's settings UI (`components/settings/settings-dialog.tsx`, `SettingsHost`
  mounted once by MailLayout and AppLayout): Mail (signature, labels, filters, forwarding, storage), Calendar, this
  device, Account, AI apps and, for owners/admins, Organization (team, domains and mailboxes, API keys, audit log).
  Open it with `openSettings(section)` (`settings/open-settings.ts`) or `?settings=<section>`; the old
  `/app/settings/*` pages redirect there (`settingsRedirect`). Each section loads what its page used to from
  `/api/app/settings/<key>` (`lib/server/settings.ts`, owner/admin keys checked there); saves an open app shows
  elsewhere come back as `onSettingsSaved` (signatures, calendar prefs). A new app's settings = a section there.

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
- Template files changed here: `wrangler.jsonc` (`NOTE_ROOM` binding and DO migration), `astro.config.mjs`
  (`optimizeDeps`). The WebSocket route and the `NoteRoom` export are in `src/app-worker.ts`.

## Contacts (product)

- One team address book per org, everyone reads and edits it (no private contacts). Tables in
  `src/db/schema/contacts.ts`: `contacts` (emails/phones as `{ value, label? }[]` JSON), `contact_emails` (every address,
  PK `(org, email)`: one address = one contact, used for lookups and dedupe), `contact_groups` + `contact_group_members`.
- Logic in `lib/server/contacts.ts`, pure rules in `lib/contacts/rules.ts`, CSV (Google/Outlook) and vCard parsers and
  exports in `lib/contacts/import.ts` (tested in `test/contacts.test.ts`). The directory (our people and shared
  mailboxes) is read live from `mailboxes`, never copied.
- Sources: `recordSent` runs from `persistOutboxMail` (skips own domains, no-reply addresses and automated forwards,
  never fails a send); manual; import (the browser parses the file and POSTs 200 rows per request to stay under D1's
  query limits; rows merge into the contact that owns any of their addresses).
- UI `/app/contacts[/<id>]` (`components/contacts/contacts-app.tsx`, workspace kit, in `AppRail` and `config/nav.ts`).
  Composer To/Cc ask `/api/app/contacts/suggest` (`AddressInput`'s `search` prop; a group adds all its addresses).
  Mail's `SenderPanel` shows the contact (thread detail returns `contact`) or "Save contact".
- API `/api/app/contacts` (+ `/[id]`, `/[id]/threads` (latest threads from the viewer's mailboxes), `/suggest`, `/groups`, `/import`, `/export?format=vcf|csv`), `/api/v1/contacts`
  re-exports list/get/create/patch/delete. MCP `src/mcp/contacts.ts`.
- Contact view: a pixel banner behind the avatar (`components/contacts/pixel-banner.tsx`, scenes in `banner-scenes.ts` on
  the site's pixel kit). `/api/app/contacts/banner?email=` → `lib/server/contacts-banner.ts`: reads the domain's homepage
  head (title, description, `theme-color`), asks Jev (`typesafe/jev`, Workers AI binding `AI`, optionally through
  `AI_GATEWAY_ID`) for an industry theme, a brand colour and an optional second one (palette keys `a`/`b`; labels and confidence thresholds in `lib/contacts/banner.ts`),
  caches it in `caches.default` (30 days, 1 day when unsure). Free mail never leaves the server; anything unsure or
  failing gets a generic scene from the domain hash. New theme = label in `BANNER_THEMES` + scene in `THEMES`.

## Drive (product)

- Tables `src/db/schema/drive.ts`: `drive_items` (folders and files; `path` = `/<rootId>/…/<id>/`, so ancestors are the
  ids in it and a subtree is a prefix; content in R2 at `r2Key` = `drive/<org>/<id>`, renames touch D1 only),
  `drive_access`, `drive_uploads` (multipart in progress, counted in the quota), `drive_links` (public links).
- Access: each item is judged like a note (`noteRole`), the viewer's role = the highest over the item and the folders
  above it (`driveRole` in `lib/drive/access.ts`, pure, `test/drive.test.ts`). Queries go through `visibleItems` /
  `requireItem` / `rolesFor` (`lib/server/drive/access.ts`). A trashed folder hides everything inside it.
- Logic in `lib/server/drive/*`: `items.ts` (lists, move = one UPDATE of the subtree's paths, trash, share, purge),
  `uploads.ts` (one PUT up to 10 MB, multipart above), `serve.ts` (Range, never HTML/SVG rendered: `safeServeType`),
  `quota.ts` (`driveGbPerPerson` in `config/plans.ts` × people, unlimited self-hosted), `links.ts`, `mail.ts`.
- Public links: `/s/<token>` (`pages/s/[token]/`), password unlock cookie signed per token for 12 h, attempts limited by
  `AUTH_RATE_LIMIT`. Daily task `drive` empties trash after 30 days and aborts stale uploads (job `drive.purge`).
- Mail: "Attach from Drive" (`components/drive/attach-from-drive.tsx`) fetches the file in the browser and passes it to
  the composer's own `attachments.add` (template components untouched); "Save to Drive" on a thread's attachment
  posts to `/api/app/drive/save-attachment`.
- UI `/app/drive[/<folderId>]` (`?view=shared|recent|starred|trash`, `?file=<id>` = selected with details): an explorer
  on the workspace kit. `drive-app.tsx` holds state and shortcuts; `folder-tree.tsx` (rail: lazy folder tree, drop
  targets via `useDropTarget`), `toolbar.tsx` (breadcrumbs, search, sort, list/grid, the bulk bar), `item-views.tsx`
  (table and grid, drag to move), `details.tsx` (details panel, Sheet on phones, Quick look), `upload-folder.ts`
  (folders from drops and `webkitdirectory`), `use-marquee.ts`. Pure rules (sort, ⌘/Shift selection, marquee, arrow
  focus) in `lib/drive/explorer.ts`. Preferences (layout, sort, panel) in localStorage. `DrivePicker` moves and
  attaches; sharing uses `components/workspace/share-dialog.tsx` with the public links as its children.
- Bulk: `POST /api/app/drive/batch` (move/trash/restore/delete/star/unstar, per-item `failed`), copies
  `POST /items/[id]/copy` (folders up to 200 items / 1 GB, synchronous), personal stars (`drive_stars`, view
  `starred`), ZIP downloads streamed without buffering (`lib/drive/zip.ts`: stored, data descriptors, no ZIP64, so
  4 GB / 65k entries) at `/api/app/drive/zip?ids=` and `/s/<token>/zip`.
- API `/api/app/drive/*`, `/api/v1/drive/items` re-exports list/get/patch/content. MCP `src/mcp/drive.ts` (read only).

## Calendar (product)

- Tables `src/db/schema/calendar.ts`: `calendars` (one `personal` per person, made lazily by `personalCalendar`, plus
  shared ones; sharing like notes via `noteRole`), `calendar_access`, `calendar_events` (UTC ms, `timezone` = the wall
  clock a series repeats in; series = master with `rrule`/`exdates`/`recur_until`, overrides = rows with `parent_id` +
  `original_start`), `calendar_attendees` (stored once on the master; `user_id` set for org people, who see the event
  without a copy), `calendar_prefs` (time zones, week start, working hours, default reminder), `calendar_feeds`,
  `calendar_reminder_log`.
- Pure logic `lib/calendar/*` (tested in `test/calendar*.test.ts`): `time.ts` (zones through Intl, no date library),
  `recurrence.ts` (ical.js iterates the RRULE in floating wall time, UNTIL checked by us; `splitRule` for "this and
  following"), `ics.ts` (in/out, iTIP methods), `layout.ts`, `availability.ts`, `free-time.ts`, `import.ts`.
- Server `lib/server/calendar/*`: `access.ts` (`visibleCalendars`, `requireCalendar`, `requireEvent`: invited = view),
  `events.ts` (range lists with series expanded and colleagues overlaid as busy blocks, create/patch/delete with
  `scope` this|following|all, RSVP, prefs), `calendars.ts`, `invites.ts` (iMIP via `queueMailSend` from the
  organizer's personal mailbox, outside attendees only), `feed.ts`, `import.ts`, `reminders.ts` (every-minute cron;
  push via `pushToUser`, the service worker `public/mail-sw.js` reads the title with the session).
- Public feed `/cal/<token>.ics` (`pages/cal/[token].ics.ts`, token = only credential, misses rate-limited).
- API `/api/app/calendar/{events,events/[id],events/[id]/rsvp,calendars,calendars/[id]/share,prefs,feed,import}`,
  `/api/v1/calendar/events` re-exports. MCP `src/mcp/calendar.ts` (`calendar_list_events`, `calendar_find_free_time`,
  `calendar_create_event`: outside attendees are returned as `notInvitedYet`, never mailed on the model's word).

## AI apps: MCP modules and the ChatGPT app (product)

- `src/mcp/app.ts` lists `appModules` (`McpModule` in `define.ts`: `tools`, `widgets`, one `instructions` line appended to
  the server's). A new app (files, calendar…) = `src/mcp/<app>.ts` exporting a module + an entry there.
- Reading is free on every plan; tools with `scope: "write"` need `mcpAccess` (Pro), checked per call (`needsPlan`).
- Mail never leaves on the model's word: `mail_draft` (read) returns the draft card widget (`widgets/mail-compose.tsx`),
  whose Send/Undo call `mail_send`/`mail_cancel_send`. Those are `appOnly`: MCP Apps `visibility: ["app"]` for OAuth
  apps, model-visible for API keys (`toolVisibility`). `mail_search` renders `widgets/mail-threads.tsx`;
  `mail_read_thread` returns text without quoted history, capped per message. ChatGPT directory listing and its
  marketing (`/chatgpt`, `/vs` row, llms.txt) come only after OpenAI approves the app.
- ChatGPT directory: `chatgpt-app/` (plugin ZIP sources, demo `.mbox`, release steps in its README). OpenAI's rules:
  explicit annotations (`persists` = saves without write scope), no internal ids in results, no upsells in tool text.

## Marketing site and SEO/GEO (product)

- Look after boat.dev in our ink (`styles/marketing.css`, scoped to `.mk` by `MarketingLayout look="paper"`; docs,
  legal and error pages use `look="plain"`): white page, full-bleed ink bands (`.mk-band`: hero via `PageHero` +
  `MarketingLayout ink` for the see-through header, `ClosingBand`, footer with a tmux-style status bar), a grey band
  (`.mk-band-grey`), square corners (a global rule in `.mk`, `rounded-full` and `.mk-light` exempt), 1px frames, no
  shadows. Funnel Display headlines (`mk-h1/h2/h3`, `<em>` = soft ink, not italic), Inter text, IBM Plex Mono captions,
  tabs and tables (`mk-cap`, `mk-seg`, `mk-cmd` via `CommandBox`). Pictures: our own pixel scenes on canvas
  (`components/site/pixel`: `scenes.ts`, `PixelScene`, `PixelIcon`; never copy boat.dev's art) and real app screens
  (`components/site/Shot.astro`: `<name>.webp` / `<name>-dark.webp`). `data-reveal` from `scripts/marketing-motion.ts`.
  No eyebrow pills above headlines. Competitor
  icons in `public/logos/<slug>.png` (`logo` in `config/compare.ts`), used in /vs, tables and the Compare menu.
  The brand is written "Work Inbox" (`siteConfig.name`); the domain stays workinbox.io.
- Screens on the site are the real app: `pnpm shots [--seed] [name]` (`scripts/marketing-shots.ts`, needs `pnpm dev`)
  seeds the demo org (acme.test) through the local email handler and the notes API, then saves `public/marketing/*.webp`
  and `*-dark.webp`.
- Pages: home (`pages/index.astro`), `/pricing`, `/shared-mailbox`, `/google-workspace-alternative`, `/vs` and
  `/vs/<slug>` from `config/compare.ts` (competitor facts from their own pages with `checked` and `sources`; re-check
  before editing, keep "pick them if" and our gaps honest). `/llms.txt` is generated from `config/plans.ts` and
  `compare.ts` (`lib/llms.ts`): update it with every shipped feature, like Luxivo's feature rollout (landing, `/vs` row,
  `llms.txt`, docs, footer).
- Claim only what ships: no IMAP, no CalDAV or booking pages. Import is .mbox/.eml upload only (no IMAP import).
- Billing (workinbox.io runs `DEPLOY_MODE=cloud`, PADDLE_ENV production; self-hosters set `self`): per person = personal
  mailboxes (`lib/server/seats.ts`). Checkout sells that quantity; adding/removing/converting a personal mailbox calls
  `seatsChanged` → job `billing.seats` → PATCH the Paddle subscription (prorated next period); a daily task reconciles.
  The first 5 people are free (`FREE_PEOPLE`, `seatsFor`: quantity = people − 5, at least `MIN_SEATS` = 5 on a paid plan). Sending mail, adding people, mailboxes and domains need an active trial or plan
  only once the org has (or would have) more than `FREE_PEOPLE` personal mailboxes (`requireMailPlan`); shared mailboxes and
  aliases don't count. Receiving and forwarding rules always keep working; API, MCP and audit log stay paid.
  Hosted sending: new unpaid orgs capped for 14 days, a ceiling over own limits, auto-pause on bounces/complaints
  (`sendingCaps`, `reputationPause` in `lib/mail/outbox-policy.ts`).
- Open source under AGPL-3.0 (LICENSE), public at github.com/workinbox-io/inbox.
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

Deploy (production, workinbox.io): either GitHub Actions → "Deploy" (`.github/workflows/deploy.yml`, manual only:
`gh workflow run deploy.yml --ref main -R workinbox-io/inbox`; secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the repo's `production` environment) or locally `pnpm run deploy` (needs `wrangler login`).
Both build, apply D1 migrations remotely, `wrangler deploy` and ping IndexNow. CI (`ci.yml`) only
typechecks, tests and builds on every push and PR. `gh` needs `-R workinbox-io/inbox` (two remotes).

E-mails in dev are printed to the dev server log (`astro dev logs`), including verification links.
Trigger the cron locally: `curl "localhost:4321/cdn-cgi/handler/scheduled?cron=17+3+*+*+*"`.

## Architecture

- `src/worker.ts` is the Worker entry: Astro's `handle()` for HTTP, plus `queue()` (jobs from
  `src/jobs`) and `scheduled()` (daily tasks in `src/jobs/cron.ts`); product hooks and Durable Objects in `src/app-worker.ts`.
- Bindings and secrets: `import { env } from "cloudflare:workers"`. Types come from
  `worker-configuration.d.ts` (generated, `pnpm cf-types`) plus secrets declared in `src/env.d.ts`.
- Domain logic lives in `src/lib/server`; API routes and pages call it. `contacts.ts` shows the full pattern (audit,
  API route, `/api/v1` re-export, MCP module). The template's `projects` example is deleted here: on `template:update`
  resolve modify/delete conflicts on its files with `git rm`.
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
- UI: pickers use `components/ui/segmented-control.tsx` (`PeriodTabs` wraps it); toasts are Ding
  (`toast` from `@yusufceng1z/ding-react`, one pill that morphs in place; `<Toaster />` in `components/ui/toaster.tsx`); small caps labels use the `eyebrow` utility.
  Animated marketing diagrams: `components/storyboard` (`defineScene()` + `<Scene />`, see its README).
  Faux product UI on marketing pages (homepage hero demo, features bento): `components/marketing/*` on the
  Stageshow kit in `components/stageshow` (see its README); stage colours read the site's variables (`look.css`).

## Template vs product files

Product code goes in `src/db/schema/app.ts`, `src/jobs/app*.ts`, `src/mcp/app.ts`, `src/config/*`,
content, and new files. Changes to template files (auth, api, settings panels, `components/ui`)
should be made in the template repo and merged, so products don't drift.
