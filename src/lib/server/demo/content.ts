/**
 * The demo story (Brightloop's spring campaign at Acme), shared by the public demo (`/demo`) and the marketing
 * screenshots (scripts/marketing-shots.ts). Pure data: names here are looked up by the shots script, so renaming one
 * means re-running `pnpm shots --seed`. Times are minutes ago / days from this week's Monday. The Polish copy
 * (content-pl.ts) has the same shape (checked by seed.ts's types and test/demo.test.ts); change both.
 */
import { COLLECTION_TEMPLATES, type FieldInput } from "@/lib/collections/fields";
import { fileBodies } from "./files";

export { pdf } from "./files";

/** People in the demo org: local part, name, role, signature title. Anna is the visitor. */
export type PersonKey = "anna" | "marek" | "diana" | "tomasz";
export type Person = { local: string; name: string; role: "owner" | "member"; title: string };
export const PEOPLE: Record<PersonKey, Person> = {
  anna: { local: "anna", name: "Anna Kowalska", role: "member", title: "Account manager" },
  marek: { local: "marek", name: "Marek Zieliński", role: "owner", title: "Founder" },
  diana: { local: "diana", name: "Diana Nowak", role: "member", title: "Designer" },
  tomasz: { local: "tomasz", name: "Tomasz Wiśniewski", role: "member", title: "Project manager" },
};

export const ORG_NAME: string = "Acme Studio";
export const SUPPORT: string = "support";

/** Incoming mail. `to`: a person's local part or SUPPORT; `from` with no @ = a colleague's local part. */
export interface DemoMail {
  fromName: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  ago: number;
  unread?: boolean;
  starred?: boolean;
  spam?: boolean;
  label?: string;
  /** A PDF attached under this name. */
  attach?: string;
  /** Anna's answer, sent `ago` minutes ago, in the same thread. */
  reply?: { text: string; ago: number };
}

/** Drive files the chat and the client note link to. */
export const BRIEF_FILE: string = "Spring campaign brief.pdf";
export const CONTRACT_FILE: string = "Signed contract.pdf";

export const CONTRACT_SUBJECT: string = "Contract for the spring campaign";
export const SUPPORT_SUBJECT: string = "Question about shared mailboxes";

export const MAIL: DemoMail[] = [
  {
    fromName: "Marta Kaczmarek", from: "marta@brightloop.io", to: "anna", subject: CONTRACT_SUBJECT, ago: 9, unread: true, starred: true,
    label: "Brightloop", attach: "Signed contract.pdf",
    text: "Hi Anna,\n\nAttached is the signed contract for the spring campaign. Could you confirm the kickoff date? We'd like to start on the 18th if that works for your team.\n\nThanks,\nMarta",
  },
  {
    fromName: "Oliver Smith", from: "oliver@northwind.co", to: SUPPORT, subject: "Can't log in after the password reset", ago: 24, unread: true,
    text: "Hello,\n\nI reset my password this morning but the new one doesn't work. I tried twice. Can you help?\n\nOliver",
  },
  {
    fromName: "Lena Weber", from: "lena.weber@fjord.de", to: SUPPORT, subject: "Invoice 2026-114 has the wrong VAT number", ago: 52, unread: true,
    text: "Hi team,\n\nOur VAT number on invoice 2026-114 is missing the DE prefix. Could you send a corrected copy?\n\nBest,\nLena",
  },
  {
    fromName: "Tomasz Wiśniewski", from: "tomasz", to: "anna", subject: "Notes from the client call", ago: 75,
    text: "Anna, I put the notes from today's call in the shared note \"Client call: Brightloop\". Two open questions at the bottom.\n\nT.",
  },
  {
    fromName: "GitHub", from: "noreply@github.com", to: "anna", subject: "[acme/web] Pull request #482 merged", ago: 130,
    text: "Diana merged pull request #482: new pricing page.",
  },
  {
    fromName: "Sofía García", from: "sofia@casa-garcia.es", to: SUPPORT, subject: SUPPORT_SUBJECT, ago: 190,
    text: "Hi! Can two people answer from the same support@ address? We're a team of four and want to stop forwarding mail around.\n\nGracias,\nSofía",
    reply: { ago: 170, text: "Hi Sofía,\n\nYes: a shared mailbox like support@ is read and answered by everyone you give access to, and replies go out from support@. Each of you sees who is drafting a reply, so nobody answers twice.\n\nBest,\nAnna" },
  },
  {
    fromName: "Diana Nowak", from: "diana", to: "anna", subject: "Design review moved to Thursday", ago: 260,
    text: "Moved the design review to Thursday 11:00, same room. Agenda is in the notes.",
  },
  {
    fromName: "Felix Wagner", from: "felix@studio-wagner.de", to: "anna", subject: "Re: Proposal for the new website", ago: 410, label: "Clients",
    text: "Thanks Anna, the proposal looks good. One question about the timeline: could the first draft be ready before Christmas?\n\nFelix",
    reply: { ago: 380, text: "Hi Felix,\n\nYes, the first draft can be ready by December 19th. I'll send the detailed timeline tomorrow.\n\nAnna" },
  },
  {
    fromName: "Cloudflare", from: "noreply@notify.cloudflare.com", to: "anna", subject: "Your monthly usage summary", ago: 900,
    text: "Workers requests, R2 storage and Email Routing usage for October.",
  },
  {
    fromName: "Crypto Wins", from: "promo@crypto-wins.biz", to: "anna", subject: "You've been selected for a 500% bonus", ago: 300, spam: true,
    text: "Claim your bonus now! Limited offer, act today.",
  },
];

export const LABELS = ["Brightloop", "Clients"];

export const NOTES: { title: string; markdown: string; folder?: string }[] = [
  {
    title: "Client call: Brightloop",
    folder: "Clients",
    markdown: `Call with **Marta Kaczmarek** (Brightloop) about the spring campaign.

## Decisions
- Kickoff on the 18th, weekly check-ins on Mondays
- Brightloop sends the brand assets by Friday
- We own the landing page and the e-mail sequence

## To do
- [x] Send the signed contract to finance
- [ ] Draft the timeline (Tomasz)
- [ ] Book the kickoff room

## Open questions
1. Do they need the landing page in German too?
2. Who approves the final copy on their side?`,
  },
  { title: "Onboarding checklist", markdown: "- [x] Mailbox and password\n- [x] Access to support@\n- [ ] Read the brand guide\n- [ ] Connect your phone (Settings → Mail clients)" },
  { title: "Q4 planning", markdown: "## Goals\n- Two new retainer clients\n- Launch the Brightloop campaign\n\n## Budget\nSee **Q4 budget.csv** in Drive.\n\n## Hiring\nOne more designer from January." },
  { title: "Support replies we reuse", markdown: "### Password reset\nUse \"Forgot password\" on the sign-in page; the link is valid for an hour.\n\n### Invoices\nCorrected invoices go out from finance within a day." },
];
export const CLIENT_NOTE = NOTES[0]!.title;

/** Address book: name, company, title, email, phone. */
export const CONTACTS: [string, string, string, string, string][] = [
  ["Marta Kaczmarek", "Brightloop", "Marketing lead", "marta@brightloop.io", "+48 601 234 567"],
  ["Felix Wagner", "Studio Wagner", "Founder", "felix@studio-wagner.de", "+49 30 1234 5678"],
  ["Lena Weber", "Fjord", "Finance", "lena.weber@fjord.de", ""],
  ["Oliver Smith", "Northwind", "Operations", "oliver@northwind.co", ""],
  ["Sofía García", "Casa García", "Owner", "sofia@casa-garcia.es", "+34 612 345 678"],
];
export const CONTACT_GROUP: string = "Partners";

/** Drive: folders at the root, then files [name, folder or null]. Content comes from `fileBody`. */
export const FOLDERS = ["Brightloop", "Brand assets", "Contracts", "Finance", "Onboarding"];
export const FILES: [string, string | null][] = [
  ["Spring campaign brief.pdf", null],
  ["Q4 budget.csv", null],
  ["Kickoff agenda.txt", null],
  ["Signed contract.pdf", "Brightloop"],
  ["Media plan.csv", "Brightloop"],
  ["Brand guide.pdf", "Brand assets"],
  ["Welcome.txt", "Onboarding"],
];
/** Diana's folder, shared with the team: Anna finds it under "Shared with me". */
export const SHARED_FOLDER: string = "Brand assets";
export const PROJECT_FOLDER: string = "Brightloop";

const CSV: Record<string, string> = {
  "Q4 budget.csv": "Item,Owner,Budget (EUR),Spent (EUR)\nBrightloop campaign,Anna,24000,8200\nNew website (Studio Wagner),Anna,12000,3100\nDesign tools,Diana,1800,1650\nOffsite,Marek,6500,0\nHiring,Marek,9000,2500\n",
  "Media plan.csv": "Week,Channel,Spend (EUR),Goal\n1,LinkedIn,2500,Awareness\n1,Newsletter,0,Launch\n2,Google Ads,3000,Sign-ups\n3,Instagram,2000,Awareness\n4,Retargeting,1500,Sign-ups\n",
};
const TEXT: Record<string, string> = {
  "Kickoff agenda.txt": "Kickoff: Brightloop spring campaign\n\n1. Introductions (5 min)\n2. Goals and success metrics (15 min)\n3. Timeline and milestones (20 min)\n4. Brand assets and approvals (15 min)\n5. Next steps (5 min)\n",
  "Welcome.txt": "Welcome to Acme Studio!\n\nYour mail, chat, notes, calendar, files and contacts live in one place.\nAsk Tomasz for access to the project boards.\n",
};

const PDF_LINES: Record<string, string[]> = {
  "Spring campaign brief.pdf": ["Client: Brightloop", "Goal: 5,000 sign-ups in six weeks", "Channels: landing page, e-mail sequence, LinkedIn, Google Ads", "Kickoff: the 18th"],
  "Signed contract.pdf": ["Between Brightloop sp. z o.o. and Acme Studio", "Scope: spring campaign (landing page, e-mails, ads)", "Fee: EUR 24,000", "Signed by Marta Kaczmarek"],
  "Brand guide.pdf": ["Colours: ink #1d1d1f, coral #ff6b5b", "Type: Inter for text, Funnel Display for headlines", "Logo: keep 16 px clear space"],
};

/** The bytes and media type of a demo file (FILES and the mail attachment). */
export const fileBody = fileBodies(CSV, TEXT, PDF_LINES);

export const CHANNEL: string = "spring-campaign";

/** This week (day 0 = Monday), hours local to the org's zone. `team`: Diana and Tomasz invited; Anna organizes
 *  unless `by` says otherwise (then Anna is invited and has to answer). */
export const EVENTS: { title: string; day: number; from: number; to: number; rrule?: string; location?: string; team?: boolean; by?: PersonKey; notes?: boolean }[] = [
  { title: "Weekly check-in", day: 0, from: 10, to: 10.5, rrule: "FREQ=WEEKLY;BYDAY=MO", team: true },
  { title: "Focus: landing page", day: 1, from: 9, to: 12 },
  { title: "Kickoff: Brightloop spring campaign", day: 2, from: 11, to: 12.5, location: "Room 2 / video", team: true, notes: true },
  { title: "Lunch with Marta", day: 2, from: 13, to: 14, location: "Bistro Wola" },
  { title: "Design review", day: 3, from: 11, to: 12, team: true, by: "diana" },
  { title: "Support rota", day: 3, from: 15, to: 17 },
  { title: "Q4 planning", day: 4, from: 14, to: 15.5, team: true, by: "marek" },
];
export const KICKOFF = EVENTS[2]!.title;

export const TASKS: string = "Tasks";
/** Collections list their fields; a row's values follow the fields' order (seed.ts `byOrder`). */
export const TASK_FIELDS: FieldInput[] = COLLECTION_TEMPLATES.projects.fields;
/** The Tasks board: title, status, assignee, due in days, priority, labels. */
export const TASK_ROWS: [string, string, PersonKey, number, string, string[]][] = [
  ["Kickoff deck for Brightloop", "Done", "anna", -3, "High", ["Feature"]],
  ["Book the studio for the shoot", "Done", "tomasz", -1, "Medium", []],
  ["Landing page copy", "Review", "anna", 1, "High", ["Feature"]],
  ["Social posts for week one", "In progress", "tomasz", 3, "Medium", []],
  ["Hero visuals, three versions", "In progress", "diana", 4, "High", ["Feature"]],
  ["Fix the broken link in the newsletter footer", "To do", "diana", 2, "Urgent", ["Bug"]],
  ["Media plan and budget", "To do", "anna", 6, "High", []],
  ["Newsletter announcement", "To do", "tomasz", 9, "Low", []],
  ["Post-launch report template", "Backlog", "diana", 14, "Low", ["Improvement"]],
];

export const DEALS: string = "Deals";
export const DEAL_FIELDS: FieldInput[] = COLLECTION_TEMPLATES.crm.fields;
/** Deals: title, stage, company, value, owner, contact. */
export const DEAL_ROWS: [string, string, string, number, PersonKey, string][] = [
  ["Spring campaign", "Won", "Brightloop", 24000, "anna", "marta@brightloop.io"],
  ["New website", "Proposal", "Studio Wagner", 12000, "anna", "felix@studio-wagner.de"],
  ["Support retainer", "Qualified", "Northwind", 6000, "marek", "oliver@northwind.co"],
  ["Shop redesign", "Lead", "Casa García", 9000, "marek", "sofia@casa-garcia.es"],
];

export const RENTALS: string = "Equipment rental";
/** The studio's gear, lent to the team and rented to clients. Fields, then rows: title, status, category, with whom, customer, back in days, daily rate (EUR), serial. */
export const RENTAL_FIELDS: FieldInput[] = [
  { name: "Status", type: "select", style: "plain", options: ["Available", "Reserved", "Rented out", "In repair"] },
  { name: "Category", type: "select", options: ["Camera", "Lens", "Lighting", "Audio", "Drone"] },
  { name: "Handled by", type: "person" },
  { name: "Customer", type: "text" },
  { name: "Return by", type: "date" },
  { name: "Daily rate", type: "number" },
  { name: "Serial number", type: "text" },
];
export const RENTAL_ROWS: [string, string, string, PersonKey | null, string, number | null, number, string][] = [
  ["Sony FX3 kit", "Reserved", "Camera", "tomasz", "Acme: Brightloop shoot", 4, 90, "FX3-41827"],
  ["Canon R5 body", "Rented out", "Camera", "diana", "Studio Wagner", 2, 80, "R5-20931"],
  ["Sigma 24-70 f/2.8", "Rented out", "Lens", "diana", "Studio Wagner", 2, 25, "SG-77310"],
  ["Aputure 600d light", "Available", "Lighting", null, "", null, 45, "AP6-11205"],
  ["LED panels, set of 3", "Reserved", "Lighting", "tomasz", "Acme: Brightloop shoot", 4, 40, "LP3-09812"],
  ["Rode Wireless GO II", "Available", "Audio", null, "", null, 15, "RWG-55102"],
  ["Zoom H6 recorder", "In repair", "Audio", "marek", "", null, 20, "ZH6-30417"],
  ["DJI Mini 4 Pro", "Rented out", "Drone", "anna", "Casa García", -1, 60, "DJI-88420"],
];

/** Sub-tasks of COPY_TASK: title, status. Then a link, a blocker [blocked, by] and comments ("@anna" = a mention). */
export const COPY_TASK: string = "Landing page copy";
export const SUBTASKS: [string, string][] = [["Headline options", "Done"], ["Legal review of the claims", "To do"]];
export const BLOCKED: [string, string] = ["Social posts for week one", "Hero visuals, three versions"];
export const TASK_COMMENTS: [PersonKey, string][] = [
  ["diana", "@anna the second headline reads better on mobile, can we go with it?"],
  ["tomasz", "Marta wants to see it by Thursday."],
];

export const SUPPORT_NAME = `${ORG_NAME} Support`;
export const SIGNATURE_FOOTER = `${ORG_NAME} · ul. Prosta 20, Warsaw`;
/** A filter that labels mail from brightloop.io with LABELS[0]. */
export const FILTER_NAME: string = "Brightloop mail";
/** Reply templates: support@'s and Anna's own. */
export const TEMPLATES = {
  support: { name: "Password reset", subject: "", text: "Hi,\n\nUse \"Forgot password\" on the sign-in page and follow the link we e-mail you; it's valid for an hour. If it doesn't arrive, check your spam folder.\n\nBest," },
  anna: { name: "Kickoff follow-up", subject: "Next steps after our kickoff", text: "Thanks for the kickoff today! As agreed:\n\n- \n\nI'll send the timeline by Friday." },
};
/** Drafts: Anna's own, one an AI app left, and Diana's reply to MAIL's `support` thread in support@. */
export const DRAFTS = {
  own: { to: "felix@studio-wagner.de", subject: "Timeline for the new website", text: "Hi Felix,\n\nHere's the timeline we talked about:\n\n- Dec 1: wireframes\n- Dec 19: first draft\n- Jan 9: launch\n" },
  ai: { to: "marta@brightloop.io", subject: "Kickoff on the 18th: confirmed", text: "Hi Marta,\n\nThe 18th works for us. I've sent an invitation for 11:00 and put the agenda in the calendar event.\n\nSee you then,\nAnna" },
  support: { thread: "Can't log in after the password reset", to: "oliver@northwind.co", text: "Hi Oliver,\n\nSorry about that. I've sent you a fresh reset link; could you try it in a private window?\n\nDiana" },
};

/** Notes' folder (NOTES with `folder`), the links under the client note, and Diana's note shared with Anna alone. */
export const NOTE_LINKS = { heading: "Links", contract: "Contract", kickoff: "Kickoff", task: "Task" };
export const DIANA_NOTE = {
  title: "Hero visuals: feedback wanted",
  markdown: "Three directions for the hero, mock-ups in Drive → Brightloop.\n\n1. Photo with the product\n2. Pixel illustration\n3. Big type only\n\nWhich one fits Brightloop best?",
};

/** Chat: CHANNEL and #general. `{note}`, `{file}` = mention chips, "@anna" = a mention of Anna. */
export const CHAT = {
  topic: "Brightloop's spring campaign: kickoff on the 18th",
  generalTopic: "Everything Acme",
  welcome: "Welcome to the team chat 👋 Projects get their own channel, everything else goes here.",
  closed: "Office is closed on Friday afternoon, the cleaners come at 2.",
  signed: "Brightloop signed the contract 🎉 Kickoff is on the 18th, notes from the call: {note}",
  assets: "Great! @anna do we have their brand assets yet? I'd like to start on the landing page.",
  friday: "Marta sends them by Friday. I'll drop them in Drive → Brightloop.",
  questions: "I'm drafting the timeline today. Two questions for the kickoff:\n1. Landing page in German too?\n2. Who approves the final copy on their side?",
  german: "German would add about a week, I'd keep it for phase two.",
  approver: "@anna can you ask Marta about the approver?",
  brief: "The brief is here if you need it: {file}. First draft of the hero is in the shared folder, comments welcome 👀",
  dm: "Got 5 minutes after lunch? I'd like your eye on the hero before I send it.",
};
