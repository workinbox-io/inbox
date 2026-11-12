import { COMPETITORS } from "@/config/compare";
import { CURRENCY, FREE_PEOPLE, MIN_SEATS, PLAN_LIST, PLANS, TRIAL_DAYS, amount, planFeatures } from "@/config/plans";
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
    "- What ships today: team email on the organization's own domains (or a free <name>.workinbox.io address), shared notes with live editing, a team address book, a shared drive and team calendars.",
    "- Mail: a personal mailbox per person, shared mailboxes (support@, sales@) that several people open with their own accounts and answer from the shared address, unlimited aliases, a catch-all per domain, plus addressing, a spam score on every message and sender rules (always allow or block a sender or domain). Search operators: from:, to:, subject:, has:attachment, is:unread, is:starred. Keyboard shortcuts. Scheduled send and undo send, drafts that follow the person across devices, HTML signatures from a company template (logo, colour, role, phone), and the original .eml of every message, received or sent (Show original). ⌘K in the top bar switches apps and starts a new e-mail or note.",
    "- Setup: start on a free <name>.workinbox.io address (set up automatically) or add a domain in Settings → Mail; Work Inbox lists the DNS records (MX, DKIM, DMARC) and checks them; for a domain on Cloudflare, Connect Cloudflare adds them with a one-time API token. Admins add people on the domain, each with a mailbox and a temporary password.",
    "- Import: old mail from an .mbox (Google Takeout) or .eml files (Outlook, Zoho and others) in Settings → Mail → Import mail; it arrives read, with its dates and threads, without duplicates.",
    "- Contacts: one address book per team that everyone reads and edits, filled automatically from mail the team sends, with Google and Outlook CSV and vCard import and export, groups, and suggestions in the composer's To and Cc.",
    `- Drive: folders and files in R2, each shared privately, with chosen people (view or edit) or the whole team, and shares apply to everything inside a folder. A file explorer with a folder tree, list and grid views, multi-select, drag and drop (including whole folders from the computer), stars, copies and ZIP downloads. Previews for images, PDF, text, video and audio; large uploads in parts; trash kept 30 days; public links with an optional password and expiry; attach drive files to mail and save mail attachments to the drive. Storage per person on the hosted plans (${Object.values(PLANS).map((p) => `${p.name} ${p.driveGbPerPerson} GB`).join(", ")}, pooled across the team); unlimited when self-hosted.`,
    "- Calendar: a calendar per person plus shared ones (private, chosen people or the whole team), keyboard-first week, day and month views, drag to create and move, recurring events (this / this and following / all), up to three time zones side by side, colleagues' calendars overlaid (busy blocks where their events are private), free slots picked in the grid and copied as text, and reminders by browser notification. Invitations to people outside the organization go out by e-mail as standard iCalendar (Gmail, Outlook and Apple Mail show Accept/Decline) and their answers update the event; invitations received from Google or Outlook land in the calendar with Accept/Decline in the mail. A private read-only .ics subscription link for Google, Apple or Outlook Calendar, and .ics import. Not available: CalDAV sync, two-way Google Calendar sync and booking pages.",
    "- Notes: live co-editing with cursors, headings, checklists, tables, images and @mentions; private, shared with chosen people (view or edit), or with the whole team.",
    "- Security: optional authenticator-based two-factor authentication (2FA) for password sign-in on every plan, including free and self-hosted. Single-use backup codes, authenticator replacement without disabling protection, and security-change emails. Google sign-in uses Google's own security settings. Organization-wide 2FA enforcement is not available. 2FA does not revoke existing API keys or OAuth grants.",
    "- Not available yet: IMAP/SMTP access for Outlook, Apple Mail or Thunderbird, and native mobile apps (the web app can be installed on phones and computers).",
    `- Self-hosting: open source (${siteConfig.repoUrl}), runs on the company's own Cloudflare account (Workers, D1, R2, Queues, Email Routing and Email Service), every feature, no fee to Work Inbox. Messages are stored in D1, each original .eml and attachments in R2.`,
    ...plans,
    `- Up to ${FREE_PEOPLE} people are free on every plan: a team of five uses Work Inbox for free (a personal mailbox each, shared mailboxes, aliases and notes). From the ${FREE_PEOPLE + 1}th person a plan is needed, billing the people beyond the free ones with a minimum of ${MIN_SEATS} (Starter: €${(MIN_SEATS * PLANS.starter.priceMonthly) / 100} a month covers up to ${FREE_PEOPLE + MIN_SEATS} people). The API, changes from AI apps (MCP) and the audit log need Pro or Business; AI apps can read on every plan. Shared mailboxes and aliases are free on every plan. Prices exclude VAT. Yearly billing gives two months free. ${TRIAL_DAYS}-day free trial, no card needed.`,
    "- REST API with an OpenAPI 3.1 spec (Pro and Business). MCP server at /mcp for Claude, ChatGPT, Claude Code and Cursor: search and read mail, notes, contacts and drive files on every plan; on Pro and Business also create and update notes and contacts, and reply to mail. Replies are drafts the person sends with a button in the chat, never by the AI alone. OAuth sign-in, changes audited.",
    "",
    "## Product",
    "",
    link("/", "Home", "overview, screens of the app, features, roadmap, pricing and FAQ"),
    link("/security", "Security", "two-factor authentication, individual mailbox access, sessions and integration access"),
    link("/pricing", "Pricing", "plans per person, the self-hosted option"),
    link("/shared-mailbox", "Shared mailboxes", "how support@ and sales@ work, compared with Google, Microsoft, Zoho and Proton"),
    link("/google-workspace-alternative", "Google Workspace alternative", "what a team keeps and gives up, and what five people cost on six plans"),
    link("/cloudflare-email-routing", "Inbox for Cloudflare Email Routing", "reply from your own domain instead of only forwarding: hosted with Connect Cloudflare, or self-hosted next to Email Routing"),
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
