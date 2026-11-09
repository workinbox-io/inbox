import { COMPETITORS } from "@/config/compare";
import { CURRENCY, PLAN_LIST, TRIAL_DAYS, planFeatures } from "@/config/plans";
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
    (p) => `- ${p.name}: ${p.priceMonthly / 100} ${CURRENCY} per person (personal mailbox) a month: ${planFeatures(p).map((f) => (f.soon ? `${f.label} (coming)` : f.label)).join(", ")}`,
  );
  const docs = await getDocs();

  const body = [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description}`,
    "",
    "Key facts:",
    "",
    "- What ships today: team email on the organization's own domains and shared notes with live editing. Calendar, contacts and drive are on the roadmap, not available yet.",
    "- Mail: a personal mailbox per person, shared mailboxes (support@, sales@) that several people open with their own accounts and answer from the shared address, unlimited aliases, a catch-all per domain, plus addressing, a spam score on every message and sender rules (always allow or block a sender or domain). Search operators: from:, to:, subject:, has:attachment, is:unread, is:starred. Keyboard shortcuts.",
    "- Setup: add a domain in Settings → Mail; WorkInbox lists the MX, SPF and DMARC records and checks them (on Cloudflare, turning on Email Routing adds them). Admins add people on the domain, each with a mailbox and a temporary password.",
    "- Notes: live co-editing with cursors, headings, checklists, tables, images and @mentions; private, shared with chosen people (view or edit), or with the whole team.",
    "- Not available yet: IMAP/SMTP access for Outlook, Apple Mail or Thunderbird, and native mobile apps (the web app can be installed on phones and computers); importing old mail from Gmail or Outlook.",
    `- Self-hosting: open source (${siteConfig.repoUrl}), runs on the company's own Cloudflare account (Workers, D1, R2, Queues, Email Routing and Email Service), every feature, no fee to WorkInbox. Messages are stored in D1, each original .eml and attachments in R2.`,
    ...plans,
    `- Shared mailboxes and aliases are free on every plan. Prices exclude VAT. Yearly billing gives two months free. ${TRIAL_DAYS}-day free trial, no card needed.`,
    "- REST API with an OpenAPI 3.1 spec (Pro and Business). MCP server at /mcp for Claude, ChatGPT, Claude Code and Cursor (Pro and Business): search, read and answer mail, search, read, create and update notes. OAuth sign-in, changes audited.",
    "",
    "## Product",
    "",
    link("/", "Home", "overview, screens of the app, features, roadmap, pricing and FAQ"),
    link("/pricing", "Pricing", "plans per person, the self-hosted option"),
    link("/shared-mailbox", "Shared mailboxes", "how support@ and sales@ work, compared with Google, Microsoft, Zoho and Proton"),
    link("/google-workspace-alternative", "Google Workspace alternative", "what a team keeps and gives up, and what five people cost on six plans"),
    link("/vs", "Comparisons", "WorkInbox next to other products, with sources"),
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
