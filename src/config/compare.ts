/**
 * Comparison pages (/vs and /vs/<slug>), modelled on Luxivo's config/compare.ts: Work Inbox next to one competitor.
 * Competitor facts come from their own pricing and help pages on `checked` (links in `sources`); re-check them before
 * changing a page. Keep "pick them if" honest, and keep our gaps (no IMAP, no calendar yet) in the table: a comparison
 * that hides the other side's strengths, or ours' weaknesses, doesn't convert and doesn't get cited.
 */
import { FREE_PEOPLE, MIN_SEATS, PLAN_LIST, PLANS, amount } from "./plans";

const eur = (cents: number) => `€${amount(cents)}`;

/** How a product covers a row: included, limited, missing, coming, or just a fact ("info"). */
export type CellStatus = "yes" | "partial" | "no" | "soon" | "info";
export interface Cell {
  text: string;
  status: CellStatus;
}
const yes = (text: string): Cell => ({ text, status: "yes" });
const partial = (text: string): Cell => ({ text, status: "partial" });
const no = (text: string): Cell => ({ text, status: "no" });
const soon = (text: string): Cell => ({ text, status: "soon" });
const info = (text: string): Cell => ({ text, status: "info" });

export type RowKey = "price" | "trial" | "shared" | "aliases" | "notes" | "selfHost" | "imap" | "ai" | "suite";

export const ROW_LABELS: Record<RowKey, string> = {
  price: "Price per person",
  trial: "Free plan or trial",
  shared: "Shared mailboxes",
  aliases: "Aliases and catch-all",
  notes: "Notes or docs edited together",
  selfHost: "Self-hosting and source code",
  imap: "IMAP and mobile mail apps",
  ai: "Claude / ChatGPT (MCP)",
  suite: "Calendar, contacts, files",
};

/** Our side of every table. */
export const OURS: Record<RowKey, Cell> = {
  price: info(
    `${PLAN_LIST.map((p) => eur(p.priceMonthly)).join(" / ")} a month (${PLAN_LIST.map((p) => p.name).join(", ")}), billed monthly; first ${FREE_PEOPLE} people free, at least ${MIN_SEATS} billed; self-hosted free`,
  ),
  trial: yes(`Free for up to ${FREE_PEOPLE} people; 14-day trial for teams, no card. Self-hosting free for good`),
  shared: yes("Unlimited on every plan, no licence per mailbox"),
  aliases: yes("Unlimited aliases, catch-all per domain, plus addressing"),
  notes: yes("Shared notes with live editing, checklists, tables, @mentions"),
  selfHost: yes("Open source; runs on your own Cloudflare account"),
  imap: no("Not yet: web app only (installable). IMAP gateway planned"),
  ai: yes("MCP server on Pro and Business: search, read and answer mail and notes"),
  suite: soon("Calendar, contacts and drive are next"),
};

export interface Competitor {
  slug: string;
  name: string;
  /** Their icon in public/logos (from their own site), for menus, lists and table heads. */
  logo: string;
  /** Page title and H1: "<name> alternative". */
  tagline: string;
  intro: string;
  /** When the facts were read (YYYY-MM-DD). */
  checked: string;
  /** Their plans in one line each, as their page shows them. */
  theirPricing: string[];
  /** Their cheapest plan with a custom domain, in US dollars a person a month on annual billing (home page chart). */
  entry?: { plan: string; usd: number };
  rows: Record<RowKey, Cell>;
  whyUs: string[];
  pickThemIf: string[];
  faq: { question: string; answer: string }[];
  sources: string[];
}

const CHECKED = "2026-11-09";

export const COMPETITORS: Competitor[] = [
  {
    slug: "google-workspace",
    name: "Google Workspace",
    logo: "/logos/google-workspace.png",
    tagline: "Team email without Google: an open-source Google Workspace alternative",
    intro:
      "Google Workspace is the default for team email with Docs and Meet around it. Work Inbox does less (mail and shared notes today) for a lower price per person, with free shared mailboxes and the option to run it on your own Cloudflare account.",
    checked: CHECKED,
    entry: { plan: "Business Starter", usd: 7 },
    theirPricing: [
      "Business Starter: $7 a person a month on an annual plan, $8.40 flexible; 30 GB pooled storage",
      "Business Standard: $14 annual, $16.80 flexible; 2 TB",
      "Business Plus: $22 annual, $26.40 flexible; 5 TB",
    ],
    rows: {
      price: info("$7 to $22 a month (annual), $8.40 to $26.40 flexible"),
      trial: partial("14-day trial, no free plan"),
      shared: partial("No shared mailbox as such: Google Groups' collaborative inbox"),
      aliases: partial("Up to 30 aliases per user"),
      notes: yes("Google Docs, the most polished live co-editing"),
      selfHost: no("No: hosted by Google only"),
      imap: yes("Gmail apps on iOS and Android; IMAP"),
      ai: partial("Official MCP servers in developer preview; Gemini on Standard and up"),
      suite: yes("Calendar, Contacts, Drive, Meet, Sheets, Slides"),
    },
    whyUs: [
      "Shared mailboxes are real mailboxes, free on every plan, not Groups set up as an inbox.",
      `Free for up to ${FREE_PEOPLE} people, then from ${eur(PLANS.starter.priceMonthly)} a person, or free on your own Cloudflare account.`,
      "Open source: you can read the code that handles your mail.",
    ],
    pickThemIf: [
      "Your team lives in Docs, Sheets and Meet.",
      "You need Gmail on phones, Outlook or another IMAP app today.",
      "You need Gemini across mail, documents and meetings.",
    ],
    faq: [
      { question: "Can Work Inbox replace Google Workspace?", answer: "For mail and shared notes, yes. For calendar, files and video calls, not yet: calendar, contacts and drive are on the roadmap, and Work Inbox has no video calls." },
      { question: "Can I move my domain's mail from Google Workspace?", answer: "Yes: add the domain in Work Inbox and replace its MX records with the one Work Inbox lists. New mail then arrives in Work Inbox. Importing old mail isn't built yet." },
    ],
    sources: [
      "https://workspace.google.com/pricing",
      "https://knowledge.workspace.google.com/admin/getting-started/editions/business-editions",
      "https://knowledge.workspace.google.com/admin/users/add-or-delete-an-alternate-email-address-email-alias",
      "https://developers.google.com/workspace/guides/configure-mcp-servers",
    ],
  },
  {
    slug: "microsoft-365",
    name: "Microsoft 365",
    logo: "/logos/microsoft-365.png",
    tagline: "A lighter Microsoft 365 alternative for team email",
    intro:
      "Microsoft 365 Business bundles Exchange mail with Office, Teams and device management. Work Inbox covers team mail and shared notes in the browser, at a lower price per person, and can run on your own Cloudflare account.",
    checked: CHECKED,
    entry: { plan: "Business Basic", usd: 7 },
    theirPricing: [
      "Business Basic: $7 a person a month, annual commitment (was $6 before 1 July 2026)",
      "Business Standard: $14 (was $12.50)",
      "Business Premium: $22",
    ],
    rows: {
      price: info("$7 to $22 a month, annual commitment"),
      trial: info("Trial terms not confirmed on Microsoft's page"),
      shared: yes("Shared mailboxes without a licence up to 50 GB, up to 25 users"),
      aliases: info("Aliases supported; limits not confirmed"),
      notes: yes("Word, OneNote and Loop with co-authoring"),
      selfHost: no("No (Exchange Server on premises is a separate product)"),
      imap: yes("Outlook on desktop and phones"),
      ai: partial("Work IQ MCP server; Copilot may need a licence per user"),
      suite: yes("Outlook calendar and contacts, OneDrive, Teams"),
    },
    whyUs: [
      `No annual commitment needed, free for up to ${FREE_PEOPLE} people, then from ${eur(PLANS.starter.priceMonthly)} a person.`,
      "Shared mailboxes with no size or member caps to plan around.",
      "Open source and self-hostable on Cloudflare.",
    ],
    pickThemIf: [
      "You need Outlook, Word and Excel on the desktop, and Teams.",
      "You manage devices and identities with Intune and Entra.",
      "You need eDiscovery, litigation hold or archiving today.",
    ],
    faq: [
      { question: "Do shared mailboxes cost extra in Microsoft 365?", answer: "Microsoft says a shared mailbox needs no licence up to 50 GB, but everyone who opens it needs a licensed mailbox, and archives or 100 GB need Exchange Online Plan 2. In Work Inbox shared mailboxes are free on every plan." },
    ],
    sources: [
      "https://www.microsoft.com/en-us/licensing/news/2026-m365-packaging-pricing-updates",
      "https://learn.microsoft.com/microsoft-365/admin/email/about-shared-mailboxes",
      "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/overview",
    ],
  },
  {
    slug: "zoho-mail",
    name: "Zoho Mail",
    logo: "/logos/zoho-mail.png",
    tagline: "A Zoho Mail alternative you can self-host",
    intro:
      `Zoho Mail and Zoho Workplace are the budget choice, with a free plan for five people. Work Inbox is free for five people too, with shared mailboxes, aliases and live notes in the free plan, then ${eur(PLANS.starter.priceMonthly)} a person billed monthly, and can run on your own Cloudflare account.`,
    checked: "2026-11-10",
    entry: { plan: "Mail Lite", usd: 1 },
    theirPricing: [
      "Mail Free: up to 5 people and one domain, 5 GB each, no IMAP",
      "Mail Lite: $1 to $1.25 a person a month, annual only; Mail Premium: $4, annual only",
      "Workplace Standard: $3 annual, $4 monthly; Workplace Professional: $6 annual, $7 monthly",
    ],
    rows: {
      price: info("Free for 5, then $1 to $7 a month"),
      trial: yes("Free plan for 5 people; 15-day trial of Workplace Professional"),
      shared: yes("Shared mailbox group type"),
      aliases: partial("30 aliases per mailbox; catch-all per domain"),
      notes: yes("Zoho Writer in Workplace; Notebook separately"),
      selfHost: no("No: hosted by Zoho only"),
      imap: partial("Not on the free plan; paid plans not confirmed on the pricing page"),
      ai: yes("Official Zoho Mail MCP server"),
      suite: yes("Calendar, contacts, WorkDrive, Meeting, Cliq"),
    },
    whyUs: [
      `Free for ${FREE_PEOPLE} like Zoho Mail Free, with shared mailboxes, aliases and notes included; then ${eur(PLANS.starter.priceMonthly)} a person, billed monthly, no yearly commitment.`,
      "Open source, and free on your own Cloudflare account.",
      "Mail and live notes in one app with one search.",
    ],
    pickThemIf: [
      "You want a whole suite (drive, chat, meetings) from one vendor today.",
      "You need IMAP or mobile apps now (on Zoho's paid plans).",
      "You pay yearly anyway and only need mail: Mail Lite at $1 a person is cheaper for big teams.",
    ],
    faq: [
      { question: "What does Zoho Mail's free plan include?", answer: "Up to five people on one domain, 5 GB each, the web and mobile apps, without IMAP, POP or ActiveSync. From the sixth person every user moves to a paid plan. Work Inbox is free for five people too, with unlimited shared mailboxes, aliases, a catch-all and shared notes." },
      { question: "How much is Zoho Mail?", answer: "Mail Lite is $1 a person a month (5 GB) or $1.25 (10 GB), Mail Premium $4, both billed yearly only. Workplace Standard is $3 a month yearly or $4 monthly, Professional $6 or $7. Work Inbox Starter is €1 a person billed monthly, the first five people free, at least five billed." },
      { question: "Can I move from Zoho Mail to Work Inbox?", answer: "Yes: add your domain in Work Inbox and point its MX records at the new records Work Inbox lists. New mail then arrives in Work Inbox. Importing old mail isn't built yet." },
    ],
    sources: [
      "https://www.zoho.com/workplace/pricing.html",
      "https://www.zoho.com/mail/zohomail-pricing.html",
      "https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html",
      "https://www.zoho.com/mail/help/mcp/getting-started.html",
    ],
  },
  {
    slug: "proton-mail",
    name: "Proton Mail",
    logo: "/logos/proton-mail.png",
    tagline: "A Proton for Business alternative for team mailboxes",
    intro:
      "Proton for Business puts end-to-end encryption first. Work Inbox puts teamwork first: shared mailboxes that several people answer, live shared notes, and the option to run everything on your own Cloudflare account.",
    checked: CHECKED,
    entry: { plan: "Mail Essentials", usd: 6.99 },
    theirPricing: [
      "Mail Essentials: $6.99 a person a month, annual; 15 GB, 3 domains, 10 addresses each",
      "Workspace Standard: $8.99 intro price for new customers until 30 November 2026, then a higher regular price; 1 TB, 15 domains",
      "Workspace Premium: $14.99 intro; 3 TB, 20 domains",
    ],
    rows: {
      price: info("From $6.99 a month, annual"),
      trial: partial("14-day trial and a 30-day refund; no free business plan"),
      shared: no("No shared mailboxes listed; email groups on Workspace plans"),
      aliases: partial("10 to 20 addresses per person; catch-all on every plan"),
      notes: yes("Proton Docs and Sheets, end-to-end encrypted"),
      selfHost: partial("Apps are open source, the server isn't; no self-hosting"),
      imap: partial("Mobile apps; IMAP only through Proton Bridge on desktop"),
      ai: no("No MCP server or public mail API found"),
      suite: yes("Calendar, Drive, Pass, VPN"),
    },
    whyUs: [
      "Real shared mailboxes for support@ and sales@.",
      "The whole server is open source and runs on your own account.",
      "An API and an MCP server for your tools and AI apps.",
    ],
    pickThemIf: [
      "End-to-end encryption and Swiss jurisdiction come first.",
      "You want encrypted Drive, Pass and VPN in the same plan.",
      "You need mobile apps today.",
    ],
    faq: [],
    sources: ["https://proton.me/business/plans", "https://proton.me/business/mail", "https://proton.me/support/drive-collaborate-in-docs"],
  },
  {
    slug: "fastmail",
    name: "Fastmail",
    logo: "/logos/fastmail.png",
    tagline: "A Fastmail alternative with shared mailboxes and notes",
    intro:
      "Fastmail is fast, standards-based mail with excellent IMAP, CalDAV and JMAP support. Work Inbox trades that client support (no IMAP yet) for shared mailboxes, live notes and the option to self-host on Cloudflare.",
    checked: CHECKED,
    theirPricing: [
      "Basic, Standard and Professional: 6 GB, 60 GB and 150 GB a person (prices shown in the visitor's currency)",
      "Custom domains on Standard and Professional, not on Basic",
    ],
    rows: {
      price: info("Three plans, priced in your local currency"),
      trial: partial("Up to 30-day trial, no free plan"),
      shared: partial("Shared addresses and aliases, not separate shared mailboxes"),
      aliases: yes("600 aliases plus 15 per person; catch-all and plus addressing"),
      notes: no("No notes or document editor"),
      selfHost: no("No (its Cyrus IMAP server is open source)"),
      imap: yes("IMAP, SMTP, CalDAV, CardDAV, JMAP and mobile apps"),
      ai: partial("Public JMAP API; no official MCP server"),
      suite: yes("Calendar and contacts; file storage"),
    },
    whyUs: ["Shared mailboxes a whole team answers.", "Live shared notes next to the mail.", "Open source and self-hostable."],
    pickThemIf: [
      "You want to keep your IMAP and CalDAV apps on every device.",
      "Mail alone is what you need, from an independent vendor.",
      "You need calendar and contacts today.",
    ],
    faq: [],
    sources: ["https://www.fastmail.com/pricing/", "https://www.fastmail.help/hc/en-us/articles/1500000277382-Account-limits", "https://fastmail.com/dev/"],
  },
  {
    slug: "nextcloud",
    name: "Nextcloud",
    logo: "/logos/nextcloud.png",
    tagline: "A self-hosted alternative to Nextcloud for team email",
    intro:
      "Nextcloud is the open-source, self-hosted suite for files, calendar and office documents, but it has no mail server: Nextcloud Mail is a client for a mail server you run yourself. Work Inbox is the mail server and the app, on Cloudflare, with nothing to patch.",
    checked: CHECKED,
    theirPricing: [
      "Community edition: free to self-host (AGPLv3)",
      "Enterprise: €71.29, €104.99 or €204.75 a person a year from 100 people (Standard, Premium, Ultimate)",
    ],
    rows: {
      price: info("Free community edition; Enterprise from 100 people"),
      trial: yes("Community edition free"),
      shared: partial("Depends on the mail server you run"),
      aliases: partial("Depends on the mail server you run"),
      notes: yes("Nextcloud Text and Nextcloud Office"),
      selfHost: yes("Open source (AGPLv3), self-hosted on your servers"),
      imap: partial("Nextcloud Mail is itself an IMAP client"),
      ai: partial("MCP through the Context Agent app"),
      suite: yes("Files, calendar, contacts, Talk"),
    },
    whyUs: [
      "Mail included: no separate mail server to install and keep running.",
      "Runs on Cloudflare's network, not on a server you patch.",
      `Hosted plans for teams of any size, free for up to ${FREE_PEOPLE} people.`,
    ],
    pickThemIf: [
      "You need files, calendar and office documents on your own servers.",
      "You already run a mail server and want a web client and groupware for it.",
      "You need an enterprise subscription with SAML and support.",
    ],
    faq: [
      { question: "Does Nextcloud include a mail server?", answer: "No. Nextcloud's own groupware page says Nextcloud Mail is a client for IMAP infrastructure and Nextcloud doesn't include a mail server. Enterprise can bundle one at extra cost." },
    ],
    sources: ["https://nextcloud.com/pricing/", "https://nextcloud.com/groupware/", "https://docs.nextcloud.com/server/stable/admin_manual/ai/app_context_agent.html"],
  },
  {
    slug: "cloudflare-agentic-inbox",
    name: "Cloudflare Agentic Inbox",
    logo: "/logos/cloudflare-agentic-inbox.png",
    tagline: "A Cloudflare Agentic Inbox alternative for teams",
    intro:
      "Agentic Inbox is Cloudflare's open-source email client with an AI agent, deployed to your own Cloudflare account. It suits one person or a small team behind one Cloudflare Access policy. Work Inbox is built for a team: everyone signs in with their own account, shared mailboxes have their own access, and there is a hosted version you don't have to deploy.",
    checked: "2026-11-10",
    theirPricing: ["Free and open source (Apache 2.0); you pay Cloudflare for Workers, Durable Objects, R2, Workers AI and Email Service"],
    rows: {
      price: info("Free; you pay Cloudflare for what it uses"),
      trial: yes("Free to self-host"),
      shared: partial("Everyone who passes the Cloudflare Access policy can open every mailbox; no per-mailbox access"),
      aliases: partial("Mailboxes for any address on the domain via a catch-all rule; aliases not listed"),
      notes: no("Not included"),
      selfHost: yes("Open source (Apache 2.0), deploys to your own Cloudflare account"),
      imap: no("Not mentioned in its README"),
      ai: yes("Built-in agent on Workers AI that drafts replies, plus an MCP server"),
      suite: no("Not included"),
    },
    whyUs: [
      "Each person signs in with their own account; shared mailboxes are opened only by the people you choose.",
      `Hosted: add your domain and click Connect Cloudflare, nothing to deploy. Free for up to ${FREE_PEOPLE} people.`,
      "Shared notes, contacts and an audit log next to the mail.",
    ],
    pickThemIf: [
      "You want an AI agent drafting replies inside the inbox.",
      "You're one person, or a small team that's fine with everyone seeing every mailbox.",
      "You prefer the Apache 2.0 licence to our AGPL-3.0.",
    ],
    faq: [
      { question: "What is Cloudflare Agentic Inbox?", answer: "An open-source email client by Cloudflare that runs on Workers in your own account: Email Routing receives, Email Service sends, Durable Objects store each mailbox, and an agent on Workers AI reads, searches and drafts replies. Cloudflare Access guards the whole app." },
      { question: "Can a team use Agentic Inbox?", answer: "Its README says anyone who passes the shared Cloudflare Access policy can access all mailboxes, and that there is no per-mailbox authorization. Work Inbox gives each person their own mailbox and decides per shared mailbox who may open it." },
    ],
    sources: ["https://github.com/cloudflare/agentic-inbox"],
  },
];

export const competitorBySlug = (slug: string) => COMPETITORS.find((c) => c.slug === slug);
