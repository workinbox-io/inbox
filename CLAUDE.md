# CLAUDE.md

WorkInbox (workinbox.io): open-source mail, contacts, calendar and drive for teams, a Google Workspace alternative.
Runs self-hosted (`DEPLOY_MODE=self`, one company on its own Cloudflare account) or hosted (`cloud`, plans on).
Plan and phases: see the project plan; phase 1 (domains, mailboxes, mail) is in place.

## Organizations' mail (product)

- Tables: `src/db/schema/mail.ts` (re-exported from `app.ts`): `mail_domains`, `mailboxes` (personal per member or
  shared), `mailbox_access`, `mail_aliases`, `mail_threads`, `mail_messages`, `mail_sender_rules`. Mailboxes hand out
  IMAP-style UIDs (`uid_next`, `uid_validity`) and bump `modseq` on every change, used by the IMAP gateway (mail bridge, `services/mail-bridge`).
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
- Out of office (`mail_auto_replies`, log `mail_auto_reply_log`) and templates (`mail_templates`), per mailbox: rule in
  `lib/mail/auto-reply.ts`, `maybeAutoReply` (`lib/server/mail/auto-reply.ts`) runs after filters in `handleOrgMail` and
  sends with `autoReply: true` (`Auto-Submitted: auto-replied`, no quote); templates in `lib/server/mail/filters.ts`,
  settings sections and the composer's Templates menu in `components/mailbox/mail-replies.tsx`.
- Drafts: per person on the server (`mail_drafts`, key = thread id for a reply, `new`, or `d-<uuid>`;
  `lib/server/mail/drafts.ts`, `/api/app/mail/drafts[/key]`). The browser keeps a copy for instant reads and syncs it
  (`components/mailbox/drafts.ts`: debounced PUT/DELETE, `syncDrafts()` on load, newest wins). Drafts and Outbox are
  folders of the same list (`MailView`, `isVirtualFolder`): rows from `draftRows` / `outboxRows`, detail pane = the
  thread (reply drafts), `ComposeWindow inline` (new ones) or `OutboxDetail`; `?pane=drafts|outbox`, `?draft=<key>`. AI apps' `mail_draft` lands there (`source: "ai"`).
  Colleagues' drafts in shared mailboxes show read-only ("Draft by …", `teamDrafts`, `GET …/drafts?team=1`); "Take over"
  (`takeOverDraft`, `POST …/drafts`) moves the row to the viewer, and the author's browser drops its copy on its next sync.
- Access: `lib/server/mail/access.ts` (`viewerMailboxes`): own personal mailbox, mailboxes granted in `mailbox_access`
  (shared ones, or someone's personal one delegated, e.g. biuro@ that one person signs in with), every mailbox for
  owners/admins. Every mail query is scoped to that list. `followed` (own, granted, shared) decides "All mailboxes",
  the bell and push, so admins aren't flooded by others' personal mail they can merely open.
- UI: `/app/mail` (`components/mailbox/*`, a copy of `components/admin-mail` adapted: starred and spam folders, search
  operators `from: to: subject: has:attachment is:unread is:starred`). Admin console → Domains and mailboxes
  (`/admin/mail`, settings section `mail-admin`, `components/mailbox/mail-settings.tsx`) manages domains (DNS records + DoH check), mailboxes, aliases, catch-all.
- People on the org's domain (Admin console → Domains and mailboxes → Add person, `lib/server/mail/people.ts`): user + credential account +
  member + personal mailbox + shared access in one `db.batch`, written directly (no verification mail, no personal
  org from the sign-up hook); the admin gets a temporary password once and can reset it (`mailOnly` mailboxes).
- API: `/api/app/mail/threads` (list/send/patch/delete), `/threads/[id]`, `/threads/[id]/reply`,
  `/messages/[id]/raw`, `/mailboxes` (own signature), `/settings` (owners/admins, one `action` per POST).
- Mail apps (IMAP/SMTP via the mail bridge): one Stalwart account per person and mailbox, but people sign in with the
  mailbox address; device passwords are `<login_tag>.<secret>` and the bridge swaps the login (`imap-login.mjs`,
  `Accounts.loginAccount`). Settings → Mail clients → "Connect device" (`connect-device.tsx`, `POST
  /api/app/mail/native/device`) returns the passwords once as JSON or an Apple profile (`lib/mail/mobileconfig.ts`).
  Autoconfig/autodiscover: `lib/server/mail/autoconfig.ts` + custom hostnames, see docs/ses.md.
  Drafts sync both ways with the IMAP Drafts folder: `HostedMirror.syncDrafts` (`hosted-sync.mjs`, table `hosted_drafts`,
  keyword `wi-draft-<key>-<updatedAt>`) ↔ `/api/internal/mail-bridge/mailboxes/<id>/drafts` (`lib/server/mail/native-drafts.ts`,
  .eml in/out `lib/mail/draft-eml.ts`); a re-saved copy finds its draft by `X-Workinbox-Draft` (`lib/mail/draft-key.ts`),
  a 409 keeps both edits.
- Test incoming mail locally: `curl -X POST "localhost:4321/cdn-cgi/handler/email?from=a@b.com&to=anna@acme.test" --data-binary @mail.eml`.
- Worker hooks (org mail, delivery-event queue, every-minute cron) live in `src/app-worker.ts` (template v1.17.0);
  settings are one page (see "Workspace apps"). `src/worker.ts` stays the template's.

## Workspace apps: views and UI kit (product)

- Three areas, one SPA (`components/app/panel-router.tsx`, routes `lib/app-routes.ts`, loaders `lib/server/app-page.ts`,
  documents `pages/{app,admin,staff}/[...path].astro` via `panelDocument`): **`/app/*`** the apps for everyone (app rail
  `AppRail`, `AppSearch`, account menu at the bottom of each app's rail; apps always get `account` and never know about
  other frames); **`/admin/*`** the admin console for owners/admins (`AppShell` sidebar from `ADMIN_NAV`: overview,
  team, domains and mailboxes, apps, billing, API keys, audit log, organization; settings pages render the dialog's
  sections through `SettingsPage`, map `ADMIN_SETTINGS`); **`/staff/*`** the platform operator's tools for
  `ADMIN_EMAILS` (analytics, staff mailboxes; 404 for everyone else). `context.area` picks the frame; members asking for
  `/admin` land on `/app/mail`. Entry: account menu "Admin console", ⌘K, "Go to apps" in the sidebar and overview. Old addresses
  (`/app`, `/app/billing`, `/app/admin*`, `/app/view`, `/app/settings/*`) redirect in `legacyRedirect`.
- UI kit in `components/workspace/` (extracted from Mail, so new apps look like Inbox): `AppFrame` (an app's frame), `Rail`/`RailAction`/`RailItem`/`RailSection`, `ListPane`/`ListHeader`/`ListSearch`/
  `ListRow`/`ListEmpty`, `SplitView` (resizable list + detail from md, one of them on phones), `DetailHeader`/
  `IconAction`, `ui.tsx` (`Kbd`, `tint`, `WORKSPACE_COLORS`, `useMediaQuery`, `isTyping`, `useMounted`), and the Astro
  parts `AppRail.astro` (app switcher) and `AppTopBar.astro`. Shortcuts follow Mail: `c` new, `/` search, `Esc` close;
  check `shortcutsPaused(e)` so they pause while typing or with a dialog or menu open.
- Apps on/off per org (`config/modules.ts`, table `org_modules`, no row = on; mail always on; also hides @mention kinds,
  Drive/meeting-note buttons via `appOn()`, and 404s `/s/`, `/n/`, `/cal/` links of a turned-off app): Admin console →
  Apps (`/admin/apps`, `modules-panel.tsx`, `PUT /api/app/org/modules`) or MCP `workspace_app_set`. Off = hidden from rail/sidebar/⌘K
  (`withoutDisabled`, `context.disabled`), 404 on its `/app`, `/api/app`, `/api/v1` paths (middleware, `appPage`), its MCP
  module not listed (`McpModule.name` = module id). A new optional app = an id in `OPTIONAL_MODULES`.
- One ⌘K for every app (`workspace/app-commands.tsx`): AppSearch (the apps) and AppShell (admin console, staff) host the palette;
  an app adds its groups on top with `useAppCommands({ groups: (query) => …, placeholder })` (Chat: conversations and
  people, Calendar: actions and a quick event from the typed text, `alwaysShow`) and opens it with `openCommandPalette()`.
  Never a second palette of its own.
- One file viewer (`workspace/file-viewer.tsx`, `FileViewer`): full screen like Google's, used by Drive's Quick look,
  mail attachments and chat files. Images with zoom, PDF inline (attachments serve PDFs inline, `?download=1` saves),
  video/audio, text as a page, CSV as a sheet (`lib/csv.ts`), else a "No preview" card. `FileBadge` = the coloured
  type tile for attachment cards.
- Row actions are defined once as `MenuAction[]` (`workspace/action-menu.tsx`, `cleanActions` drops hidden ones) and
  shown two ways: right-click / long press (`ActionMenu`) and the "…" on hover (`ActionMenuButton`). `ListRow` and
  `RailItem` take `actions`. In use: mail threads (`threadActions` in `mailbox-app.tsx`, acting on the selection when the
  row is in it), mailboxes in the rail, messages in a thread, notes (`noteActions`) and note folders. Editors and fields
  keep the browser's own menu.
  Mail still uses its own `FolderRail`/`ThreadList` (the kit's originals); move it onto the kit when touching them.
- Settings: one page for personal settings, laid out like Tapll's (`/app/settings/<section>`,
  `components/settings/settings-page.tsx`, `SettingsScreen`): every section on one scroll, a sticky grouped nav marks the
  one in view (IntersectionObserver; a select on phones), `/app/settings/<section>` scrolls to it. Mail's sections share
  one mailbox picker (`?mailbox=`) and one load of rules (`MailGroup`); same-key loads share a request (`DataCache`); each
  section has an error boundary; unsaved drafts guarded (`settings-draft.ts`). Groups: Mail (signature, labels, filters, forwarding, storage), Calendar, this device,
  Account, AI apps, and Organization (members: organization and team; owners/admins: a link to the admin console, and
  an org section's address redirects to its `/admin/<page>` in `legacyRedirect`, which also turns old `?settings=<section>`
  links into the page). Open it with `openSettings(section)` (`settings/open-settings.ts`). Cards are Tapll's: `bg-surface`,
  `rounded-2xl`, no border, header band and hairlines (`SettingsSection`; a section without inner cards is one itself);
  `PrefList` is an inset tile (`bg-background`). Each section loads what it shows from
  `/api/app/settings/<key>` (`lib/server/settings.ts`, owner/admin keys checked there); saves an open app shows
  elsewhere come back as `onSettingsSaved` (signatures, calendar prefs). A new app's settings = a section there.

## Notifications: the bell (product)

- One list for mail (`mail_notifications`, per message), chat (mentions and DMs, read = `last_read_at`) and the other
  apps (`notifications`, written by `notify(orgId, userIds, …)` in `lib/server/notifications.ts`: shares of notes,
  files, calendars and collections to newly added people, event invitations to colleagues, people put in a collection
  person field, @mentions in notes (diffed in `src/notes/room.ts`), automations' "notify" action). Grouped by
  `mail:<thread>`, `chat:<channel>:<threadRoot>`, `app:<group_key>`; read/unread/dismiss per group, read all, clear read
  (`notification_dismissals`, newer activity brings a group back). Opening a mail thread reads its notifications.
- Panel v2 (after GitHub/Linear/Jira inboxes): tabs "For you" (`direct`: mentions, DMs, assign, invite, share, mail to
  one's personal mailbox) / "Watching"; the badge counts only "For you". Done (E) = dismiss, Snooze (S, `until`) and
  Mute (M, `muted`) live in the same `notification_dismissals` row (`placeGroup`, `snoozeTimes` in `lib/notifications.ts`),
  side views Snoozed / Done, Undo = action `restore`. Inline RSVP (invite) and reply (chat kinds), app chips, unread-only,
  ⤢ full-size Dialog with a detail pane, J/K/Enter/U/R. Groups carry `items` (latest 3) for stacked previews.
- Live: `notify()`/mail announce `{ type: "notification" }` through the chat room (`publish`), the bell listens with
  `useChatSocket` (polls while chat is off); count in the tab title and app badge. Pure rules `lib/notifications.ts`
  (`test/notifications.test.ts`). UI `components/mailbox/notification-center.tsx`.
- Settings → Notifications (Account group): mute kinds, e-mail summary (`notification_prefs`; hourly cron
  `sendNotificationDigests`: unread 4 h+, at most once a day; read rows pruned after 60 days). API `/api/app/notifications`
  (GET `?filter=`, POST `action`), `/prefs`.

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

## Chat (product)

- Slack-like team chat. Tables `src/db/schema/chat.ts`: `chat_channels` (`kind` channel|dm, `private`, DMs keyed by
  `dm_key` = sorted member ids, `name` repeats it), `chat_members` (`last_read_at` drives unread, `muted`),
  `chat_messages` (`parent_id` = thread root, `reply_count`, soft `deleted_at`; mentions stored as `<@userId>` in
  `text`), `chat_reactions`, `chat_mentions`, `chat_saved`, `chat_pins`, `chat_follows` (Threads view).
- Access `lib/server/chat/access.ts`: public channels for everyone in the org, private ones and DMs for members only
  (owners/admins included out). `#general` is made lazily and everyone joins it on first load; posting in a public
  channel joins it. API keys get 403 (no person to post as).
- Pure rules `lib/chat/*` (`format.ts` tokens + mention encode/decode, `rules.ts`, `ticket.ts`), tested in
  `test/chat.test.ts`. Server `lib/server/chat/{channels,messages}.ts`.
- Live: one `ChatRoom` Durable Object per org (`src/chat/room.ts`, partyserver, hibernating, stores nothing).
  `POST /api/app/chat/ticket` → `/chat-sync?ticket=` (`lib/server/chat/sync.ts`, hooked in `src/app-worker.ts`);
  every write calls `publish(orgId, event, audience)`; presence = open sockets (tabs send away/active); typing goes
  through `POST …/channels/[id]/typing` so private ids never leak. Push (`pushToUser`, `kind: "chat"`) for DMs and
  mentions to people without a socket; `public/mail-sw.js` reads the text from `/api/app/chat/push`.
- UI `/app/chat[/<channelId>]` (`?view=threads|mentions|saved`, `?thread=`, `?m=`): `components/chat/chat-app.tsx`
  (rail, conversation, thread pane, ⌘K jump, dialogs), `message-row.tsx`, `composer.tsx` (@ suggestions, ⌘B/I/E,
  attachments via `/api/app/attachments`), `use-chat-socket.ts`. App badge (rail + sidebar): unread DMs + mentions from
  `/api/app/chat/unread`, `watchChatUnread`/`publishChatUnread` in `lib/mail/unread-badge.ts`.
  The notification bell (`mailbox/notification-center.tsx`) merges `/api/app/chat/notifications` (mentions + DMs,
  read = seen per `last_read_at`, `chatNotifications`) with mail's.
- API `/api/app/chat` (rail data), `/channels`, `/channels/[id]` (GET page `?before=&q=`, PATCH one `action`),
  `/channels/[id]/typing`, `/dm`, `/messages`, `/messages/[id]` (GET thread, PATCH edit|react|save|pin, DELETE),
  `/views`, `/people`, `/ticket`, `/push`. MCP `src/mcp/chat.ts` (`chat_list_channels`, `chat_read_channel`,
  `chat_search`, `chat_post`). Template files changed: `wrangler.jsonc` (`CHAT_ROOM`, migration `chat-v1`).

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
- Avatars (`UserAvatar`): a local service logo (`lib/sender-logo.ts`), else the company favicon via `/api/app/favicon?domain=`
  (`lib/server/favicon.ts`, fetched by the server, raster only, cached; free mail and the org's own domains get 404), else a
  boring-avatars face with a palette picked by the address hash.

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
- Google Calendar sync (one way in): a calendar with `source_url` (Google's secret iCal address, never sent to the
  browser) is read-only; `syncSubscribedCalendars` (every-minute cron, 5 due per run, every 30 min) pulls it through
  `writeIcs(…, prune)` in `lib/server/calendar/import.ts`, skipping unchanged feeds by `sync_hash`. Out = the .ics feed.
- Pure logic `lib/calendar/*` (tested in `test/calendar*.test.ts`): `time.ts` (zones through Intl, no date library),
  `recurrence.ts` (ical.js iterates the RRULE in floating wall time, UNTIL checked by us; `splitRule` for "this and
  following"), `ics.ts` (in/out, iTIP methods), `layout.ts`, `availability.ts`, `free-time.ts`, `import.ts`.
- Server `lib/server/calendar/*`: `access.ts` (`visibleCalendars`, `requireCalendar`, `requireEvent`: invited = view),
  `events.ts` (range lists with series expanded and colleagues overlaid as busy blocks, create/patch/delete with
  `scope` this|following|all, RSVP, prefs), `calendars.ts`, `invites.ts` (iMIP via `queueMailSend` from the
  organizer's personal mailbox, outside attendees only), `feed.ts`, `import.ts`, `reminders.ts` (every-minute cron;
  push via `pushToUser`, the service worker `public/mail-sw.js` reads the title with the session).
- Meeting notes: `calendar_event_notes` (master id + occurrence, 0 for single events → note), `lib/server/calendar/meeting-notes.ts`
  (`meetingNote`: POST makes a `people` note for the org attendees, organizer and creator, and adds whoever opens it
  later; `noteMeeting` = the note's link back, `meeting` in `getNote`). API `/api/app/calendar/events/[id]/notes`
  (`?occurrence=`), button in `EventPanel` (`MeetingNotes`), link in the note's header.
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

## Mentions: "@ anything" (product)

- One picker for people, Drive files/folders, notes, events, contacts, mail threads and channels, in Chat (textarea,
  `components/chat/composer.tsx`) and Mail (Plate editor `components/mailbox/mail-editor.tsx`, replaces the textarea in
  org mail; admin-mail keeps it). UI kit `components/workspace/mentions.tsx`: `MentionIcon` (avatar / `FileBadge` /
  app icon), `MentionChip`, `useMentionSearch`, `MentionList`, `useMentionAccess` (the dialog on send).
- Tokens (`lib/mentions.ts`, pure, `test/mentions.test.ts`): people stay `<@userId>`, the rest `<@kind:id|Title>` or
  `<@kind:id|Title|https://…/s|n/token>` when a link was made. Composers encode what was picked (label → token), never
  by re-reading names. Only our own `/s/` and `/n/` links survive on a chip (`sanitizeRefs`, `ownLink`).
- Mail body: the draft and send carry `doc` (Plate JSON) next to `text`; `lib/mail/doc-render.ts` (`docToHtml`,
  `docToText`, whitelist, escaped) renders it in `renderMail`. Mentions become links with an emoji (clients block SVG).
  A draft patch with new `text` (MCP) drops `doc`.
- Server `lib/server/mentions.ts`: `searchMentionables` (`GET /api/app/mentions?q=&kinds=`), `missingAccess` (who in the
  channel or among To/Cc can't open each ref, `POST …/mentions/access`), `shareRef` (`POST …/mentions/share`: `grant` =
  view access / invite to the event / add to the channel; `live` / `snapshot` = public link). Grants and links need
  manage rights. Threads and contacts get no links.
- Snapshots: `drive_links.mode = snapshot` copies the file to `drive-snapshots/<org>/<linkId>` (counted in the quota,
  deleted with the link or the item); `note_links` (`/n/<token>`, `lib/server/notes/links.ts`) keep the note's content.
- Chips open `/app/open/<kind>/<id>` (`pages/app/open`), which redirects to the right app.

## Collections: custom modules (product)

- Lists a company defines itself (equipment, inventory, deals, tasks…), an optional app (`collections` in
  `config/modules.ts`). Tables `src/db/schema/collections.ts`: `collections` (`fields` JSON: id, name, type, options),
  `collection_records` (`title`, `values` JSON keyed by field id), `collection_access`. Shared like notes (`noteRole`,
  `sharing` private|people|team, default team/edit): view reads, edit changes records, manage (creator; managers for
  team ones) changes fields/sharing/deletes; owners and admins create. Every server call takes a `CollectionViewer`
  (`getCollection(v, id, need)`); `ShareDialog` (`PUT …/[id]/share`, the notes body).
- Pure rules `lib/collections/fields.ts` (field types text/number/date/select/checkbox/person/url/email, `normalizeFields`
  gives new fields ids from their names and keeps existing ids, a field's `default` (person `"me"`, date `"today"`) fills new records via `defaultValues` on the server and in the new-record panel, `cleanValues` accepts a field's id or name, templates
  crm/equipment/inventory/projects), tested in `test/collections.test.ts`. Server `lib/server/collections.ts` (person
  values = org member ids, an e-mail is resolved; `filter` = json_extract equality).
- UI `/app/collections[/<id>]` (`components/collections/collections-app.tsx`), Linear-like. The view
  (`lib/collections/view-config.ts`: layout, columns and swimlanes by any choice/person field, ordering, fields shown,
  empty/collapsed columns, filters) lives in `use-collection-view.ts`: per collection in localStorage, or a saved view
  (`collection_views`, personal or team, `?v=<id>`, rail items, `display-menu.tsx`). Older `?view=&group=&lanes=` still apply.
  `views.tsx` = table, `board.tsx` = kanban (manual order = `collection_records.position`, new on top, drops take the
  midpoint / `spreadPositions`, `lib/collections/board.ts`; motion drag with tilt and auto scroll, the selection drags
  together; keyboard Space-lift; quick create in a column). One action list `record-actions.tsx` (right-click, "…",
  selection bar `selection-bar.tsx`); shortcuts S/A/L (`field-picker.tsx`), ⌫, ⌘⇧C, ⌘A, X, C, J/K, Esc. Bulk:
  `POST …/records/batch` (`batchRecords`, ids in chunks of 90 for D1's 100 parameters).
- Collection dialog (template, fields, ID prefix), CSV import (browser maps columns by name, `lib/collections/csv.ts`,
  `POST …/[id]/import` 200 rows a call, managers get unknown choices added, bad rows reported) and export
  (`GET …/[id]/export`, people as e-mails). New collection from a CSV: `inferFields` guesses types ("From a
  spreadsheet"). `?record=<id>` opens a record (mentions: kind `record`, `/app/open/record/<id>`). Each collection is
  its own router screen (`appScreenKey`). Filter row `filter-menu.tsx`: ReUI's `Filters` (`components/reui/filters` + `cascader`, vendored from Tapll, also in the template; `@ts-nocheck`) over our `FilterRule`s, operators = our `FilterOp` ids, flat AND (client-side over the loaded 500). Icon and colour per collection (`collections.icon`/`color`, keys in `lib/collections/appearance.ts`, `collection-icon.tsx`; empty = the list-position dot).
- IDs like TAS-12: `collections.prefix` (empty = from the name, `lib/collections/ids.ts`; editable in the collection
  dialog) + `next_number`, `collection_records.number` reserved by one UPDATE … RETURNING (`reserveNumbers`); search and
  MCP accept them (`findRecord`).
- Record panel (`record-panel.tsx`, expands over the board): description = Plate doc in `collection_records.description`
  (+ `description_text` for search/MCP; lists leave it out, `listColumns`), edited with `MailEditor` (`label`,
  `readOnly`), autosaved; @people in it get `mention`. Links `collection_record_links` (`lib/collections/links.ts`
  reads GitHub PR/issue/commit, Figma, Linear; `state` is for a future GitHub app), icons on cards (`linkKinds`).
  Activity `collection_activity` (`lib/collections/activity.ts`, `logActivity`: one row per field, same person + field
  within 5 min folds) mixed with comments in `record-comments.tsx`.
- Live: record writes call `publishRecords` → `publish()` (chat room) `{ type: "collection" }` to whoever can open the
  collection; `collections-app.tsx` refetches `?ids=` (skipping its own in-flight changes); chat off → 30 s reload.
- Automations (`collection_automations`, pure `lib/collections/automations.ts`, server
  `lib/server/collection-automations.ts`, `automations-dialog.tsx`): when a record is added / a field changes (to a value)
  → e-mail org people (system mail) or post in a channel as the rule's creator. `createRecord`/`updateRecord` queue job
  `collections.automation`; imports don't trigger rules.
- Comments (`collection_comments`): under the open record (`record-comments.tsx`, chat `Composer` with `noFiles`, `RichText`),
  anyone who can view may comment; @mentioned people get `mention`, assignees/creator/earlier commenters get `comment`
  (`commentAudience` in `lib/collections/fields.ts`). "Mentioned in" = `recordBacklinks`: LIKE over chat, notes and mail
  the viewer can open (D1 caps LIKE patterns at 50 chars). Notes' editor only @mentions people so far.
- Linear parity (migration 0043): field types `multiselect` (labels), `relation` (`target` collection, value = record
  id, shown via `/api/app/collections/lookup` + `useRecordRefs`), `file` (an `/api/files/attachments/<org>/…` URL);
  select `style` status|priority (unset = guessed from the name, `fieldStyle`), workflow kinds `statusKind`/`isClosed`,
  `priorityLevel`. Layouts list (`list.tsx`, default) / table / board / timeline / calendar; filters are rules with
  operators (`FilterRule`, `matchesView`; the server's twin `ruleSql` runs when >500 records), `then` sort, `closed`.
  Records: `parent_id` (sub-records, progress), `collection_relations` (blocks/related/duplicate, `blockedBy` in lists),
  soft delete `deleted_at` (trash 30 days, `purgeTrash` daily; batch `delete|restore|purge|accept`), `triage`, `cycle`.
  `collections.settings` (`lib/collections/settings.ts`): cycles (rollover `rollCycles` daily), triage (viewers, API
  keys and MCP create into Triage), SLA per priority (`sweepSla` hourly, notify kind `update`), record templates;
  `collection_recurrences` (`runRecurrences` hourly), all in `lib/server/collection-planning.ts`. Comments: replies
  (`parent_id`, one level) and reactions; following (`collection_subscriptions`, bell in the panel). GitHub PR/issue
  state on links (`lib/server/github-links.ts`, optional `GITHUB_TOKEN`). UI: ⌘K (`useAppCommands`), Space = Peek,
  ⌘Z undo stack, ⌘. / ⌘⇧. copy ID / branch, P priority, rail items Triage / cycles / Trash (`?scope=`).
- API `/api/app/collections[/id[/records[/recordId[/activity|links|comments|related|follow]]]]`, `…/records/batch`,
  `…/views`, `…/recurrences`, `/lookup`, `/api/v1/collections` re-exports. MCP `src/mcp/collections.ts` (`collections_list`,
  `collection_create/update`, `collection_records_search`, `collection_record_get/create/update/delete/restore/relate`;
  descriptions as Markdown, records carry `key`).

## Public demo (product)

- "Try the demo" (hero form, header link → `pages/demo.astro`): a POST builds a fresh org per visitor
  (`createDemoOrg`, `lib/server/demo/seed.ts`) from the story in `demo/content.ts` (Brightloop campaign at "Acme Studio"; Polish
  copy `content-pl.ts`, same shape, picked by the page's language: `/demo?lang=` from the site, cookie or browser; change both,
  `test/demo.test.ts` compares them)
  through the apps' own server functions: mail via `handleOrgMail`'s import path, drafts, labels, templates, drive files
  (generated PDF/CSV/TXT), notes, calendar with a meeting note, contacts, Tasks, Deals and Equipment rental collections, chat with mentions,
  so the bell has items. The visitor is Anna (member); Marek is the owner. Session made with Better Auth's
  `internalAdapter.createSession`, no passwords. Per IP limit (`AUTH_RATE_LIMIT`, `demo:<ip>`) and 500 orgs a day.
- Marked by slug `demo-…`; domain `acme-<hex>.example`, so people's addresses can never receive mail. Plan row
  business/active without Paddle ids (never billed). Hourly task `demo` (`cleanDemoOrgs`) deletes orgs older than
  24 h with their R2 prefixes and users.
- Guards (pure rules `lib/demo.ts`, server `lib/server/demo/guard.ts`): `queuePrepared` refuses sending, `deliverEmail`
  drops mail to `.example`, middleware 403s risky writes (`demoBlocked`: account, org, billing, keys, devices, imports,
  public links, calendar feeds), the auth `before` hook allows only `DEMO_AUTH_PATHS`, drive capped at 50 MB.
- The same build makes the marketing screenshots' org: change the story in `content.ts`, then `pnpm shots --seed`.

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
  rebuilds the public demo's org on acme.example (`POST /demo?domain=`, dev only), shoots as Anna (the apps) and Marek
  (owner, admin console), and saves `public/marketing/*.webp` and `*-dark.webp`.
- Positioning: an equal suite of six apps (mail, chat, notes, calendar, drive, contacts), listed once in `config/apps.ts`
  (Product menu, footer, home cards and tour, llms.txt). Each has a page on `components/site/AppPage.astro`:
  `/custom-domain-email`, `/team-chat`, `/shared-notes`, `/team-calendar`, `/shared-drive`, `/shared-contacts`.
- Pages: home (`pages/index.astro`), `/pricing`, `/shared-mailbox`, `/google-workspace-alternative`, `/vs` and
  `/vs/<slug>` from `config/compare.ts` (competitor facts from their own pages with `checked` and `sources`; re-check
  before editing, keep "pick them if" and our gaps honest). `/llms.txt` is generated from `config/plans.ts` and
  `compare.ts` (`lib/llms.ts`): update it with every shipped feature, like Luxivo's feature rollout (landing, `/vs` row,
  `llms.txt`, docs, footer).
- Claim only what ships: IMAP and SMTP for mail apps ship (mail bridge + Stalwart, `infra/mail`, `mail.workinbox.io`,
  docs `mail-clients.md`); no CalDAV/CardDAV, booking pages or native mobile apps. Import is .mbox/.eml upload or a one-time IMAP copy (`imap-import.tsx`); "connect your existing mailbox" (External accounts, synced by the mail bridge) ships.
- Billing (workinbox.io runs `DEPLOY_MODE=cloud`, PADDLE_ENV production; self-hosters set `self`): per person = mailbox users
  (`billedPeople` in `lib/server/seats.ts`: personal mailboxes plus members granted any mailbox, so turning a personal one
  shared and handing it back doesn't free a seat). Checkout sells that quantity; adding/removing/converting a personal
  mailbox or changing grants calls `seatsChanged` → job `billing.seats` → PATCH the Paddle subscription (prorated next period); a daily task reconciles.
  The first 5 people are free (`FREE_PEOPLE`, `seatsFor`: quantity = people − 5, at least `MIN_SEATS` = 5 on a paid plan). Sending mail, adding people, mailboxes and domains need an active trial or plan
  only once the org has (or would have) more than `FREE_PEOPLE` people (`requireMailPlan`); shared mailboxes and
  aliases don't count. The Paddle webhook binds a subscription only to the org whose `paddleCustomerId` matches.
  Someone leaving an org (job `org.memberLeft`, `lib/server/member-left.ts`) loses chat rows, mailbox grants, unread
  notifications and open chat/note sockets; `notify()` skips non-members. Receiving and forwarding rules always keep working; API, MCP and audit log stay paid.
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

Deploy (production, workinbox.io): use GitHub Actions → "Deploy" (`.github/workflows/deploy.yml`, manual only:
`gh workflow run deploy.yml --ref main -R workinbox-io/inbox`; secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the repo's `production` environment). Do not deploy locally with `pnpm run deploy` or `wrangler deploy`.
The workflow builds, applies D1 migrations remotely, deploys with Wrangler and pings IndexNow. Check the triggered run and report its result. CI (`ci.yml`) only
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
  Here: English and Polish (`pl`). New UI text = `t("…")` (double-quoted literal) plus its Polish; `pnpm i18n:missing pl`
  lists gaps and `test/i18n-pl.test.ts` fails on them (API `HttpError` messages are keys too, `handler()` translates
  them). Text kept in a table and shown with `t(v.label)` is written `msg("…")` where it's defined, or the check
  can't see it. One English word, two meanings → a context key (`"person|Name"`, `"notes|Archive"`); all areas merge into
  one dictionary, so the same key must mean the same everywhere. System e-mails render in the recipient's language
  (`withLocale(await userLocale(…), …)`). Marketing site: `/pl/*` pages are wrappers of the English ones, copy via
  `tFor(locale)` from `lib/i18n/site.ts` and `src/i18n/site/pl.ts`; a new translated page = its path in
  `TRANSLATED_PAGES` (`config/languages.ts`), which drives hreflang, `lp()` links and the header's `LanguagePicker`.
- Panel navigation: one React Router SPA for `/app`, `/admin` and `/staff` (`panel-router.tsx`); each navigation loads
  `/api/app/page?path=` (same loaders as the first document). The rail or sidebar, palette and toasts stay mounted.
  Pages that change the address in place use `replaceUrl`/`pushUrl` (`lib/panel-history.ts`), never
  `history.*State(null, …)`; unsaved-change guards use `guardLeaving`; GET links to `/api` need `data-astro-reload`.
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

- Workspaces: a person can belong to several orgs (Better Auth, `session.activeOrganizationId`). Hosted only, owners/admins
  create more (`POST /api/app/org/workspaces`, `createWorkspace` in `lib/server/org.ts`, rule `lib/workspaces.ts`, at most
  `MAX_OWNED_ORGS` owned, each with its own trial/plan); the plugin's own create is off. Switching = `switchWorkspace`
  (`workspace/workspace-menu.tsx`, in both account menus), which first saves and drops mail drafts' browser copies (`leaveDrafts`).

- Staff mailboxes (`ADMIN_MAILBOXES`, e.g. support@ and legal@ on your domain; off while empty): Email Routing "Send
  to Worker" → `email()` in `src/worker.ts` → `handleAdminMail` (`lib/server/admin-mail.ts`, pure rules in
  `lib/admin-mail/rules.ts`, tables in `db/schema/admin-mail.ts`) stores and threads the mail and forwards a copy to
  `ADMIN_MAIL_FORWARD`. Staff (`ADMIN_EMAILS`) work at `/staff/mail` (`components/admin-mail/*`), laid out like Gmail:
  folders, search, bulk actions, shortcuts, reply / reply all / forward, a docked compose window, drafts and "Undo send"
  in the browser, a signature per mailbox. Incoming HTML renders in a sandboxed iframe whose CSP blocks remote images until
  "Show images". Mail goes out right away via `sendNow` (`lib/server/email.ts`) from the mailbox address.
- Status page `/status` (+ `/api/status`, footer dot), ported from CloudFile: the every-minute cron runs `runStatusChecks`
  (`lib/server/status.ts`: D1, R2, overdue outbox, mail bridge `/health` when `MAIL_BRIDGE_URL` is set), a change sticks
  after 2 identical checks (`nextStatus`, `lib/status.ts`), opens/closes `status_incidents` and e-mails `ALERT_EMAIL`.
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
