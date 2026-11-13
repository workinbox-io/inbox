# Roadmap

WorkInbox (workinbox.io) is open-source mail, contacts, calendar and drive for teams, running on Cloudflare
(Workers, D1, R2, Queues, Durable Objects, Email Routing, Email Service), with Amazon SES for hosted custom domains. Two ways to run it: self-hosted on your own Cloudflare account
(`DEPLOY_MODE=self`) or hosted multi-tenant (`DEPLOY_MODE=cloud`, Paddle plans).

Status: ✅ done · 🚧 in progress · ⬜ planned

## Next up (2026-11-12)

1. 🚧 Acceptance on production:
   - Web Push on a real phone
   - A first free `<name>.workinbox.io` address: claim, verify, Gmail → mailbox → reply
   - The drive signed in: upload a large file and a folder, share with a member, a public link, ZIP, attach to mail
   - The hourly SES sweep's first run (`[ses-inbound]` in the Worker logs)
   - The calendar: an invitation to Gmail and Outlook shows their own RSVP buttons, the answer comes back and updates
     the attendee; a CANCEL by mail; a colleague's calendar overlaid with real events; a reminder push on a phone
2. ⬜ Calendar toward Notion Calendar (phase 3, "Next"): ⌘K with events typed in plain words, then the smaller gaps
   (meeting notes shipped 2026-11-13)
3. ⬜ ChatGPT directory: submit the app (`chatgpt-app/`), then the `/chatgpt` page and the `/vs` row once OpenAI approves
4. ⬜ Drive follow-ups: a link instead of a large attachment, resized thumbnails, copies of large folders through the queue

## Phase 0: groundwork

- ✅ Project from the template (v1.13.0), `inbox` name and site config
- ✅ Production deploy: Worker `inbox`, D1 `inbox`, R2 `inbox-files`, queue `inbox-jobs`, daily cron
- ✅ System mail through Email Service (DKIM/SPF/DMARC)
- ✅ First customer domain wired up: `notelio.pl` (Email Routing catch-all → Worker, Email Sending on)
- ✅ `LICENSE` (AGPL-3.0) and a self-hosting guide (README, `/docs/self-host`)
- ✅ Upstreamed to the template (v1.17.0): Worker hooks (`src/app-worker.ts`), product settings tabs
  (`APP_SETTINGS`), the composer's `footer` and address book `search`
- ✅ Remove the template's `projects` example
- ✅ App on its own domain: https://workinbox.io, system mail from `noreply@workinbox.io`
- ✅ Brand: WorkInbox, icon: a robot peeking into a mailbox

## Phase 1: domains, mailboxes and mail

Done:

- ✅ Domains per organization with DNS records, a DNS-over-HTTPS check (also run on add) and catch-all
- ✅ Personal and shared mailboxes, access to shared ones, aliases, plus addressing
- ✅ Incoming mail: recipient → mailbox / alias / catch-all, threading, raw `.eml` and files in R2
- ✅ Spam score from SPF/DKIM/DMARC results plus per-org block/allow rules; Spam folder, "Report spam / Not spam"
- ✅ IMAP-ready storage: UIDs per mailbox (`uid_next`, `uid_validity`) and `modseq` on every change
- ✅ Web app in the style of Cron: folder rail, mailboxes as coloured toggles, keyboard shortcuts, search operators
  (`from: to: subject: has:attachment is:unread is:starred`), star, snooze, archive, trash, reply / reply all / forward,
  drafts, signatures, sandboxed HTML with remote images blocked
- ✅ Settings → Mail for owners and admins, audit log entries

Completion update (2026-11-10): everything deployed and the Gmail end-to-end check passed; only Web Push on a real
device is left.
Operational instructions: [docs/phase1-operations.md](docs/phase1-operations.md).

Implemented and acceptance:

- ✅ End-to-end check on `notelio.pl`: Gmail → mailbox, reply back in the same Gmail thread, SPF/DKIM/DMARC pass
- ✅ **Two experiences: admin console vs. plain mail** (like Google Workspace admin vs. Gmail). Regular members
  get mail only:
  - Members land on `/app/mail` in a mail-only layout: no app sidebar, no Overview/Billing/Settings; the folder rail
    holds their mailboxes (e.g. `diana@` plus shared `hello@`) and a small account menu (signature, password, sign out).
    Owners/admins keep the full app. ✅ A persisted switch for admins between mail-only and console views (mail-only by default).
  - ✅ "Add person" in Settings → Mail creates the user, their mailbox and shared access in one step: name, address
    (`diana@notelio.pl`), mailboxes to share. The new address can't receive an invitation before it exists, so the
    admin gets a temporary password or a one-time sign-in link to hand over; the user signs in with
    `diana@notelio.pl` (already verified, the domain belongs to the org) and sets their own password.
  - ✅ Optional: a private address for password recovery; forcing a new password on first sign-in.
- ✅ A member joining gets a personal mailbox; removing one hands the mailbox over or turns it shared
- ✅ Full-text search on D1 FTS5 instead of `LIKE`
- ✅ Labels and filters (condition → label / archive / forward)
- ✅ "Undo send" on the server (delayed send through the queue) and scheduled send
- ✅ Large HTML bodies in R2 instead of D1; per-mailbox storage quota
- 🚧 Notifications: PWA (manifest, service worker) and Web Push implemented and configured; real-device acceptance pending
- ✅ Collapse the app sidebar on the mail page, so there's one left column like Cron
- ✅ Public API `/api/v1/mail/*` and MCP tools `mail_search`, `mail_read_thread`, `mail_send`
- ✅ Bounce and complaint handling; send limits per mailbox and org
- ✅ HTML signatures: an org template (company, logo, colour) plus each mailbox's card
- ✅ Drafts on the server (synced between devices), Drafts and Outbox as folders, AI apps' drafts land there
- ✅ Live unread badge on Mail in the sidebar and app rail
- ✅ ChatGPT/Claude app: MCP modules, free reading, sending only from the draft card; plugin package ready for the
  ChatGPT directory (`chatgpt-app/`), submission pending
- ✅ An `.eml` for every sent message in R2 (backfilled for older ones), like received mail
- ✅ No lost inbound mail on SES: bounces for unknown addresses, full mailboxes and mail over 25 MB (only when SPF or
  DKIM passed); an hourly sweep re-queues mail left in S3; dead jobs logged from `inbox-jobs-dlq`
- ✅ Layouts judged by the app's own width (rail and sidebar included), ⌘K search in the user view's top bar

## Phase 2: contacts

- ✅ One team address book (emails, phones, notes, groups; no private contacts by design); the directory read live from
  members and shared mailboxes
- ✅ Contacts collected from sent mail; suggestions in the composer, groups add all their addresses
- ✅ Import/export vCard and CSV (Google Contacts, Outlook)
- ✅ `/app/contacts`, API, MCP tools, pixel banners with brand colours (Jev)

## Phase 3: calendar

Shipped 2026-11-12 (`b9f9510`, `40aa9aa`, then UI polish up to `08c1d0c`), deployed; production acceptance pending
(Next up).

- ✅ A personal calendar per person plus shared ones, shared like notes (private, people, team)
- ✅ Events with time zones, RRULE and exceptions ("this", "this and following", "all"); reminders by push from the
  every-minute cron
- ✅ Day, week and month views in the Cron / Notion Calendar style: drag to create, move and resize (the new event's
  rectangle too, synced with its panel), keyboard shortcuts, right-click menus, the rail's mini month, labels that
  grow with the width
- ✅ Several time zones side by side; colleagues' calendars overlaid (busy blocks when you can't see the details);
  availability picked on the grid and copied as text (busy time excluded, merged selections, removable slots and a
  preview in the chosen time zone; no reservation is made)
- ✅ Invitations over iMIP: outgoing `text/calendar` REQUEST/CANCEL to outside attendees, incoming
  REQUEST/REPLY/CANCEL update RSVPs, an invitation card in the mail thread
- ✅ Private `.ics` feed, `.ics` import (Google Calendar export)
- ✅ API `/api/v1/calendar/events`, MCP `calendar_list_events`, `calendar_find_free_time`, `calendar_create_event`
- ⬜ Agenda view; resource calendars (rooms, equipment)

Next, toward Notion Calendar (2026-11-12), in this order:

1. ✅ Meeting notes: "Meeting notes" on an event makes a note linked to it (one per occurrence of a series), shared
   with its attendees, organizer and creator; the event shows the note and the note links back (2026-11-13)
2. ⬜ ⌘K for the calendar and events typed in plain words ("lunch with Ola tomorrow 1pm")
3. ⬜ Smaller gaps:
   - hide weekends; 2–4 day views; hour height (zoom)
   - search events
   - a colour per event
   - ⌘Z undo, copy, paste and duplicate (⌘D)
   - select several events at once
   - drag into the all-day row and between calendars
   - suggest a time free for every attendee while adding them
   - a "Join" prompt just before a meeting
   - the rail's calendars and settings on phones (today the rail is desktop only)
4. ⬜ Booking links: a page where the other side picks one of your free slots (today availability is copied as text;
   not claimed on the site until it ships)
5. ⬜ Connected Google and Outlook accounts in one view, and subscribing to outside `.ics` URLs (today import/export
   only; two-way sync with CalDAV is phase 6)
6. ⬜ Video links added on their own (Meet, Zoom, or our own meetings, see "Gaps to a full product"); today a link field

## Phase 4: drive (R2)

Shipped 2026-11-10 (`a340e88`, `4371c61`, `f32843c`), deployed; production acceptance pending (Next up).

- ✅ Folders and files; any item shared privately, with people (view/edit) or the whole org, inherited down the tree
- ✅ Public links with an optional password and expiry, revocable
- ✅ Trash, deleted for good after 30 days (daily task, job `drive.purge`)
- ✅ Large uploads through R2 multipart (10 MB parts, up to 5 GB); previews for images, PDF, text, video (Range) and audio
- ✅ Mail integration: attach from drive, save an attachment to drive
- ⬜ A link instead of a large attachment
- ✅ Storage quota per org (GB per person on the plan, pooled; unlimited self-hosted); MCP: `drive_search`, `drive_read`
- ✅ Explorer: folder tree, table and grid with thumbnails, sorting, selection (⌘/Shift/rectangle) with bulk actions,
  drag and drop (move; upload files and whole folders), details panel, Quick look, keyboard shortcuts
- ✅ ZIP downloads (also for public folder links), "Make a copy", stars and a Starred view
- ✅ Long work in one toast that morphs from loading to done: uploads with progress, ZIPs, copies, bulk moves, trash
  with Undo
- ⬜ Resized thumbnails for the grid (today the full image loads)
- ⬜ Copies of folders over 200 items / 1 GB through the queue (today refused)
- ⬜ Later: versions, full-text search in files

## Phase 5: hosted cloud and billing

- ✅ Plans per person (Paddle, first person free, seats synced on every mailbox change); API, MCP and audit log paid
- ✅ Hosted custom domains through Amazon SES (send and receive), "Connect Cloudflare" adds the DNS records
- 🚧 Free `<name>.workinbox.io` address in Settings → Mail (SES, records in our zone with `MAIL_ZONE_TOKEN`, the
  admin's mailbox on it, re-checked until verified): deployed, first live claim pending
- ✅ Bounce/complaint handling and send limits (phase 1)
- ✅ Sending reputation (hosted): new unpaid orgs send to 50/200 recipients a day for 14 days, a ceiling of
  2,000/20,000 over any org's own limits, sending pauses on its own at ≥5% bounces or ≥0.3% complaints over 7 days

## Phase 6: external clients and more

- ⬜ CardDAV and CalDAV (`/dav/*`, app passwords) for Apple, Thunderbird and DAVx⁵
- ⬜ WebDAV for the drive (`/dav/files`, the same app passwords): Finder and Explorer, rclone, and Synology Cloud Sync /
  Hyper Backup keeping a copy on a NAS
- ⬜ Optional IMAP/SMTP gateway (separate container) talking to a sync API on the Worker
- ⬜ JMAP
- ✅ Migration from Gmail (`.mbox` / `.eml` import through the queue, Gmail labels kept)
- ✅ Shared documents (Durable Objects + CRDT): shipped as shared notes, phase 7

## Phase 7: shared notes

- ✅ Personal and shared notes for the organization, with access for selected members or the whole team
- ✅ Create, edit, organize and search notes; archive and restore them
- ✅ Collaborative editing with changes synchronized between participants (Plate + Yjs on a Durable Object per note)
- ✅ `/app/notes`, public API and MCP tools for searching, reading and editing notes
- ⬜ Later: version history, comments, mention notifications, full-text search (FTS5), offline editing

## Phase 8: team chat

Slack-style chat, with the Macro idea that chat, mail, notes and files are one workspace: any of them can be talked
about in place and linked without copying.

- ⬜ Channels (public in the org, private by invitation), direct messages and group DMs; threads on any message
- ⬜ Live delivery over a Durable Object per channel (like `NoteRoom`: hibernating WebSockets, tickets), messages in D1,
  edits and deletes, typing and presence, unread counts and badges in the app rail
- ⬜ @mentions, @channel, reactions, Markdown, link previews; Web Push for DMs and mentions, quiet hours
- ⬜ Files from the drive and uploads (into the drive), previews in the conversation
- ⬜ Across apps: "Discuss" on a mail thread, note or file opens a thread linked to it; shared mailboxes get a team
  thread per conversation (internal comments next to the mail, never sent); paste a link to any item for a live card
- ⬜ Search (FTS5) with `from: in: has:file`, saved messages, pinned messages per channel
- ⬜ Shared channels with guests from other organizations (later)
- ⬜ API, MCP (`chat_search`, `chat_read`, `chat_post` as a draft the person sends), outgoing webhooks and slash commands
  for bots
- ⬜ Huddles: audio/video calls in a channel over Cloudflare Realtime (later, with meetings below)

## Gaps to a full product

What a team switching from Google Workspace or Microsoft 365 would still miss, beyond the phases above.

Must have before selling to larger teams:
- ⬜ The app in more languages, Polish first (the i18n is in place, `config/languages.ts` lists English only)
- ⬜ Mail: out-of-office replies, templates (canned replies), rules that reply; shared mailboxes with assignment,
  status (open/done) and internal comments (collision-free answering, like Front)
- ⬜ SSO (SAML/OIDC, Google and Microsoft sign-in for admins) and SCIM provisioning (Business, "Soon" on pricing)
- ⬜ Passkeys; admin-enforced 2FA; sign out a person everywhere; device and session list for admins
- ⬜ Organization export (mail as .mbox, contacts, notes as Markdown, the drive as ZIP) and leaving cleanly
- ⬜ Migration from Google Workspace in one go: mailboxes, contacts, calendars and Drive (today mail .mbox and contacts)

Expected by most teams:
- ⬜ Meetings: video calls with links in calendar events (Cloudflare Realtime), or Google Meet/Zoom/Teams links
- ⬜ One search across mail, chat, notes, contacts, files and events (⌘K today finds pages and actions)
- ⬜ One notification center and preferences for every app (today mail's)
- ⬜ Tasks: a to-do from any mail, message or note, with due dates and assignees, shown in the calendar
- ⬜ Native mobile apps (iOS, Android), or IMAP/CalDAV/CardDAV so phones' own apps work (phase 6)

Trust and compliance:
- ⬜ Retention policies, legal hold and eDiscovery export for admins
- ⬜ Mail encryption: S/MIME, and encrypted mail to outside recipients; DLP rules (block or warn on sensitive data)
- ⬜ GDPR: DPA, subprocessors list, data region (EU), status page and an uptime SLA for Business
- ⬜ Backups and restore for admins (D1 Time Travel plus R2 versions), deleted-mailbox recovery

Later:
- ⬜ Spreadsheets and documents beyond notes (or open-in with OnlyOffice/Collabora), forms
- ⬜ Browser extension and desktop app (the PWA installs today)
