import { APPS } from "@/config/apps";
import { COMPETITORS } from "@/config/compare";
import { CURRENCY, FREE_PEOPLE, MAX_OWNED_ORGS, MIN_SEATS, PLAN_LIST, PLANS, TRIAL_DAYS, amount, planFeatures } from "@/config/plans";
import { siteConfig } from "@/config/site";
import { SECTIONS, docHref, getDocs, type DocEntry } from "@/lib/docs";

const markdown = (body: string) => new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });

/** A doc page as Markdown: its title and description, then the source as written. */
export function docMarkdown(doc: DocEntry) {
  const updated = doc.data.updated.toISOString().slice(0, 10);
  return markdown(`# ${doc.data.title}\n\n> ${doc.data.description}\n\nUpdated ${updated}\n\n${doc.body?.trim() ?? ""}\n`);
}

/** /llms.txt (llmstxt.org): what the product is, the facts people ask about, and where the details are. */
export async function llmsTxt(site: URL) {
  const url = (path: string) => new URL(path, site).href;
  const link = (href: string, title: string, note?: string) => `- [${title}](${url(href)})${note ? `: ${note}` : ""}`;
  const plans = PLAN_LIST.map(
    (p) => `- ${p.name}: ${amount(p.priceMonthly)} ${CURRENCY} per person (personal mailbox) a month: ${planFeatures(p).map((f) => (f.soon ? `${f.label} (coming)` : f.label)).join(", ")}`,
  );
  const docs = await getDocs();

  const body = [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description}`,
    "",
    "Key facts:",
    "",
    "- What ships today: team email on the organization's own domains (or a free <name>.workinbox.io address), team chat, shared notes with live editing, a team address book, a shared drive, team calendars and collections (lists a company designs itself).",
    "- Mail: a personal mailbox per person, shared mailboxes (support@, sales@) that several people open with their own accounts and answer from the shared address, unlimited aliases, a catch-all per domain, plus addressing, a spam score on every message and sender rules (always allow or block a sender or domain). Search operators: from:, to:, subject:, has:attachment, is:unread, is:starred. Keyboard shortcuts. Scheduled send and undo send, drafts that follow the person across devices, HTML signatures from a company template (logo, colour, role, phone), out-of-office replies and reply templates per mailbox, and the original .eml of every message, received or sent (Show original). ⌘K in the top bar switches apps and starts a new e-mail or note.",
    "- Setup: start on a free <name>.workinbox.io address (set up automatically) or add a domain in Settings → Mail; Work Inbox lists the DNS records (MX, DKIM, DMARC) and checks them; for a domain on Cloudflare, Connect Cloudflare adds them with a one-time API token. Admins add people on the domain, each with a mailbox and a temporary password.",
    "- Import: old mail from an .mbox (Google Takeout) or .eml files (Outlook, Zoho and others) in Settings → Mail → Import mail; it arrives read, with its dates and threads, without duplicates.",
    "- Switching without moving first: each person can connect the mailbox they already have (any provider, over IMAP and SMTP, in Settings → Mail clients → External accounts) and read and send from Work Inbox while mail keeps arriving at the old provider; later a one-time import copies the old mailbox from its IMAP server (the original stays untouched, duplicates are skipped) before the domain's MX is switched.",
    "- Contacts: one address book per team that everyone reads and edits, filled automatically from mail the team sends, with Google and Outlook CSV and vCard import and export, groups, and suggestions in the composer's To and Cc.",
    `- Drive: folders and files in R2, each shared privately, with chosen people (view or edit) or the whole team, and shares apply to everything inside a folder. A file explorer with a folder tree, list and grid views, multi-select, drag and drop (including whole folders from the computer), stars, copies and ZIP downloads. Previews for images, PDF, text, video and audio; large uploads in parts; trash kept 30 days; public links with an optional password and expiry; attach drive files to mail and save mail attachments to the drive. Storage per person on the hosted plans (${Object.values(PLANS).map((p) => `${p.name} ${p.driveGbPerPerson} GB`).join(", ")}, pooled across the team); unlimited when self-hosted.`,
    "- Calendar: a calendar per person plus shared ones (private, chosen people or the whole team), keyboard-first week, day and month views, drag to create and move, recurring events (this / this and following / all), up to three time zones side by side, colleagues' calendars overlaid (busy blocks where their events are private), free slots picked in the grid and copied as text, reminders by browser notification, and meeting notes: one click on an event makes a shared note for the people in it, linked both ways. Invitations to people outside the organization go out by e-mail as standard iCalendar (Gmail, Outlook and Apple Mail show Accept/Decline) and their answers update the event; invitations received from Google or Outlook land in the calendar with Accept/Decline in the mail. A private read-only .ics subscription link for Google, Apple or Outlook Calendar, Google Calendar (or any .ics address) synced in as a read-only calendar refreshed about every 30 minutes, and .ics import. Not available: CalDAV sync, two-way Google Calendar sync and booking pages.",
    "- Chat: team chat like Slack, included on every plan: public and private channels, direct messages, threads, emoji reactions, @mentions, saved and pinned messages, unread markers, search in a channel, file sharing, typing and who's online, ⌘K to jump between conversations, and browser notifications for direct messages and mentions. Not available: voice or video calls, guest accounts from other organizations, and chat with people outside the organization.",
    "- Collections: lists a company designs itself, such as equipment, inventory, a simple CRM or project tasks. Owners and admins start from a template (Deals, Equipment, Inventory, Tasks, Projects) or from scratch and choose the fields (text, number, date, choice shown as a status or priority, labels, checkbox, person, link, e-mail, a record of another collection, file); each collection is shared like a note (only its creator, chosen people with view or edit access, or the whole team), and people work on records Linear-style: a grouped list, a table, a board (dragging cards between columns), a timeline or a calendar, with filters (is / is not, before / after, overdue, empty…), saved views, sub-records with progress, relations (blocks, blocked by, related, duplicate), ⌘K commands, keyboard shortcuts, undo and a 30-day trash. Planning: cycles (sprints whose unfinished records roll over), triage for requests from people who can only view, an SLA per priority, record templates and repeating records. Comments with replies and reactions; people follow records. GitHub pull requests and issues linked to a record show their state. A new collection straight from a CSV (Excel or Google Sheets, commas or semicolons; field types guessed from the columns), CSV import into a collection (columns matched to fields by name) and CSV export. Records can be @mentioned in chat and mail. Automations: when a record is added or a field changes (to a value), e-mail people of the organization or post in a chat channel. Also in the REST API and MCP, so an AI app can create a collection and add or update records by name. Owners and admins can turn the optional apps (chat, calendar, notes, contacts, drive, collections) on or off for the organization. Not available: formulas, rollups, automations beyond e-mail and chat.",
    "- Notes: live co-editing with cursors, headings, checklists, tables, images and @mentions; private, shared with chosen people (view or edit), or with the whole team.",
    `- Several companies from one login (hosted service): an owner or admin can create up to ${MAX_OWNED_ORGS} workspaces and switch between them from the account menu; each has its own domains, people, mail and plan, billed separately.`,
    "- Security: optional authenticator-based two-factor authentication (2FA) for password sign-in on every plan, including free and self-hosted. Single-use backup codes, authenticator replacement without disabling protection, and security-change emails. Google sign-in uses Google's own security settings. Organization-wide 2FA enforcement is not available. 2FA does not revoke existing API keys or OAuth grants.",
    "- Mail apps: every mailbox (personal and shared ones a person can open) works in Apple Mail, Outlook, Thunderbird and phone mail apps over IMAP (mail.workinbox.io:993) and SMTP (port 465), signing in with the mailbox address and a device password. Connect device in Settings → Mail clients installs every chosen mailbox on an iPhone, iPad or Mac with one profile; Thunderbird, Outlook and most phone apps find the servers from the address (autoconfig and autodiscover). Self-hosted, this needs the optional mail bridge (a Docker server with Stalwart). Not available: native mobile apps (the web app can be installed on phones and computers), CalDAV and CardDAV.",
    `- Self-hosting: open source (${siteConfig.repoUrl}), runs on the company's own Cloudflare account (Workers, D1, R2, Queues, Email Routing and Email Service), every feature, no fee to Work Inbox. Messages are stored in D1, each original .eml and attachments in R2.`,
    ...plans,
    `- Up to ${FREE_PEOPLE} people are free on every plan: a team of five uses Work Inbox for free (a personal mailbox each, shared mailboxes, aliases and notes). From the ${FREE_PEOPLE + 1}th person a plan is needed, billing the people beyond the free ones with a minimum of ${MIN_SEATS} (Starter: €${(MIN_SEATS * PLANS.starter.priceMonthly) / 100} a month covers up to ${FREE_PEOPLE + MIN_SEATS} people). The API, changes from AI apps (MCP) and the audit log need Pro or Business; AI apps can read on every plan. Shared mailboxes and aliases are free on every plan. Prices exclude VAT. Yearly billing gives two months free. ${TRIAL_DAYS}-day free trial, no card needed.`,
    "- REST API with an OpenAPI 3.1 spec (Pro and Business). MCP server at /mcp for Claude, ChatGPT, Claude Code and Cursor: search and read mail, chat, notes, contacts, collections and drive files on every plan; on Pro and Business also create and update notes, contacts and collection records, post to chat, and reply to mail. Replies are drafts the person sends with a button in the chat, never by the AI alone. OAuth sign-in, changes audited.",
    "",
    "## Product",
    "",
    link("/", "Home", "overview, screens of the app, features, roadmap, pricing and FAQ"),
    ...APPS.map((a) => link(`/${a.slug}`, a.label, a.description)),
    link("/security", "Security", "two-factor authentication, individual mailbox access, sessions and integration access"),
    link("/pricing", "Pricing", "plans per person, the self-hosted option"),
    link("/demo", "Demo", "a day-long copy of a small team's workspace, no sign-up: every app with sample data; mail is not sent out"),
    link("/shared-mailbox", "Shared mailboxes", "how support@ and sales@ work, compared with Google, Microsoft, Zoho and Proton"),
    link("/google-workspace-alternative", "Google Workspace alternative", "what a team keeps and gives up, and what five people cost on six plans"),
    link("/cloudflare-email-routing", "Inbox for Cloudflare Email Routing", "reply from your own domain instead of only forwarding: hosted with Connect Cloudflare, or self-hosted next to Email Routing"),
    link("/self-hosted", "Self-hosted email", "on your own Cloudflare account without running a mail server (no port 25 or IP reputation), next to mailcow, Mail-in-a-Box and mox, and self-hosted vs hosted side by side"),
    link("/vs", "Comparisons", "Work Inbox next to other products, with sources"),
    ...COMPETITORS.map((c) => link(`/vs/${c.slug}`, `${siteConfig.name} vs ${c.name}`, `facts checked ${c.checked}`)),
    "",
    "## Docs",
    "",
    ...SECTIONS.flatMap((section) =>
      docs.filter((d) => d.data.section === section).map((d) => link(`${docHref(d)}.md`, d.data.title, d.data.description)),
    ),
    "",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
