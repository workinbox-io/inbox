# Roadmap

Inbox (working name) is open-source mail, contacts, calendar and drive for teams, running entirely on Cloudflare
(Workers, D1, R2, Queues, Email Routing, Email Service). Two ways to run it: self-hosted on your own Cloudflare account
(`DEPLOY_MODE=self`) or hosted multi-tenant (`DEPLOY_MODE=cloud`, Paddle plans).

Status: ✅ done · 🚧 in progress · ⬜ planned

## Phase 0: groundwork

- ✅ Project from the template (v1.13.0), `inbox` name and site config
- ✅ Production deploy: Worker `inbox`, D1 `inbox`, R2 `inbox-files`, queue `inbox-jobs`, daily cron
- ✅ System mail from `noreply@inbox.swiftapps.us` (Email Service, DKIM/SPF/DMARC)
- ✅ First customer domain wired up: `notelio.pl` (Email Routing catch-all → Worker, Email Sending on)
- ⬜ `LICENSE` (AGPL-3.0) and a self-hosting guide in the README
- ⬜ Upstream to the template: the product mail hook in `src/worker.ts` and the Mail tab in `settings-nav.tsx`
- ⬜ Remove the template's `projects` example
- ⬜ Brand name and domain (candidates: InOffice, LetMail); app on its own domain instead of workers.dev

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

Next:

- ⬜ End-to-end check on `notelio.pl`: Gmail → mailbox, reply back in the same Gmail thread, SPF/DKIM/DMARC pass
- ⬜ **Two experiences: admin console vs. plain mail** (like Google Workspace admin vs. Gmail). What exists today is
  the admin view. Regular members get mail only:
  - Members land on `/app/mail` in a mail-only layout: no app sidebar, no Overview/Billing/Settings; the folder rail
    holds their mailboxes (e.g. `diana@` plus shared `hello@`) and a small account menu (signature, password, sign out).
    Owners/admins keep the full app and can switch between "Admin" and "Mail".
  - "Add person" in Settings → Mail creates the user, their mailbox and shared access in one step: name, address
    (`diana@notelio.pl`), mailboxes to share. The new address can't receive an invitation before it exists, so the
    admin gets a temporary password or a one-time sign-in link to hand over; the user signs in with
    `diana@notelio.pl` (already verified, the domain belongs to the org) and sets their own password.
  - Optional: a private address for password recovery.
- ⬜ A member joining gets a personal mailbox; removing one hands the mailbox over or turns it shared
- ⬜ Full-text search on D1 FTS5 instead of `LIKE`
- ⬜ Labels and filters (condition → label / archive / forward)
- ⬜ "Undo send" on the server (delayed send through the queue) and scheduled send
- ⬜ Large HTML bodies in R2 instead of D1; per-mailbox storage quota
- ⬜ Notifications: PWA (manifest, service worker) and Web Push for new mail
- ⬜ Collapse the app sidebar on the mail page, so there's one left column like Cron
- ⬜ Public API `/api/v1/mail/*` and MCP tools `mail_search`, `mail_read_thread`, `mail_send`
- ⬜ Bounce and complaint handling; send limits per mailbox and org

## Phase 2: contacts

- ⬜ Personal and shared contacts (emails, phones, notes); the org directory built from members and shared mailboxes
- ⬜ "Other contacts" collected from sent mail; autocomplete in the composer
- ⬜ Import/export vCard and CSV (Google Contacts export)
- ⬜ `/app/contacts`, MCP tools

## Phase 3: calendar

- ⬜ Personal, shared and resource calendars; events with time zones, RRULE and exceptions; reminders via queue/cron
- ⬜ Day, week, month and agenda views in the same Cron style as mail
- ⬜ Invitations over iMIP: outgoing `text/calendar` REQUEST, incoming REQUEST/REPLY/CANCEL update RSVPs and show
  an invitation card in the thread
- ⬜ Free/busy when scheduling, private ICS feed, `.ics` import (Google Calendar export)
- ⬜ MCP: `calendar_list_events`, `calendar_create_event`

## Phase 4: drive (R2)

- ⬜ Folders and files, sharing with people, the whole org or a public link (password, expiry), trash with cleanup
- ⬜ Large uploads through R2 multipart; previews for images, PDF and text
- ⬜ Mail integration: attach from drive, save an attachment to drive, link instead of a large attachment
- ⬜ Storage quota per org; MCP: `drive_search`, `drive_read`

## Phase 5: hosted cloud and billing

- ⬜ Plans: mailboxes, storage and domains per plan; paid features (custom domain, shared mailboxes, API/MCP)
- ⬜ Instant `<org>.inbox.app` subdomain on sign-up; custom domain wizard (zone added through the Cloudflare API,
  status refreshed by cron)
- ⬜ Sending reputation: limits for new orgs, verification before sending, bounce/complaint reports

## Phase 6: external clients and more

- ⬜ CardDAV and CalDAV (`/dav/*`, app passwords) for Apple, Thunderbird and DAVx⁵
- ⬜ Optional IMAP/SMTP gateway (separate container) talking to a sync API on the Worker
- ⬜ JMAP
- ⬜ Migration from Gmail (`.mbox` / `.eml` import through the queue)
- ⬜ Shared documents (Durable Objects + CRDT)
