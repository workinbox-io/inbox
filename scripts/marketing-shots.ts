/**
 * Screenshots of the app for the marketing site (public/marketing/*.webp), modelled on Luxivo's scripts/marketing-shots.ts.
 *
 *   node scripts/marketing-shots.ts --seed   send the demo mail and notes first (adds them again on every run; contacts and drive files only once)
 *   node scripts/marketing-shots.ts          all shots
 *   node scripts/marketing-shots.ts notes    only the ones whose file name contains "notes"
 *
 * Needs `pnpm dev` (localhost:4321) and the demo org in the local D1: SHOTS_ORG, by default Anna Kowalska's team with
 * the domain acme.test (anna@, support@ shared, diana@, tomasz@). Mail goes in through the local email handler, the same
 * path as real mail; notes through the app's API. --seed also archives the org's old test threads so they don't show.
 * It signs in by writing a Better Auth session row (removed at the end). 1440x900 at 2x, saved as webp, each shot in the
 * light theme and as <name>-dark.webp in the dark one (the marketing pages are dark).
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, type Page } from "playwright";
import sharp from "sharp";

const BASE = process.env.SHOTS_URL ?? "http://localhost:4321";
const ORG_ID = process.env.SHOTS_ORG ?? "a52cd338-6c2f-4391-8673-2631e99a57db";
const DOMAIN = process.env.SHOTS_DOMAIN ?? "acme.test";
const OUT = "public/marketing";

type Api = <T>(method: string, path: string, body?: unknown) => Promise<T>;
type Shot = {
  file: string;
  path: string | ((db: DatabaseSync) => string);
  viewport?: { width: number; height: number };
  /** Mail and notes keep the user view (full screen); settings show the admin view. */
  view?: "user" | "admin";
  prepare?: (page: Page) => Promise<void>;
};

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toUTCString();

/** Incoming demo mail: [from name, from address, to, subject, text, minutes ago]. */
const MAIL: [string, string, string, string, string, number][] = [
  ["Marta Kaczmarek", "marta@brightloop.io", "anna", "Contract for the spring campaign",
    "Hi Anna,\n\nAttached is the signed contract for the spring campaign. Could you confirm the kickoff date? We'd like to start on the 18th if that works for your team.\n\nThanks,\nMarta", 9],
  ["Oliver Smith", "oliver@northwind.co", "support", "Can't log in after the password reset",
    "Hello,\n\nI reset my password this morning but the new one doesn't work. I tried twice. Can you help?\n\nOliver", 24],
  ["Lena Weber", "lena.weber@fjord.de", "support", "Invoice 2026-114 has the wrong VAT number",
    "Hi team,\n\nOur VAT number on invoice 2026-114 is missing the DE prefix. Could you send a corrected copy?\n\nBest,\nLena", 52],
  ["Tomasz Wiśniewski", `tomasz@${DOMAIN}`, "anna", "Notes from the client call",
    "Anna, I put the notes from today's call in the shared note \"Client call: Brightloop\". Two open questions at the bottom.\n\nT.", 75],
  ["GitHub", "noreply@github.com", "anna", "[acme/web] Pull request #482 merged",
    "Diana merged pull request #482: new pricing page.", 130],
  ["Sofía García", "sofia@casa-garcia.es", "support", "Question about shared mailboxes",
    "Hi! Can two people answer from the same support@ address? We're a team of four and want to stop forwarding mail around.\n\nGracias,\nSofía", 190],
  ["Diana Nowak", `diana@${DOMAIN}`, "anna", "Design review moved to Thursday",
    "Moved the design review to Thursday 11:00, same room. Agenda is in the notes.", 260],
  ["Felix Wagner", "felix@studio-wagner.de", "anna", "Re: Proposal for the new website",
    "Thanks Anna, the proposal looks good. One question about the timeline: could the first draft be ready before Christmas?\n\nFelix", 410],
  ["Cloudflare", "noreply@notify.cloudflare.com", "anna", "Your monthly usage summary",
    "Workers requests, R2 storage and Email Routing usage for October.", 900],
];

const NOTES: { title: string; markdown: string }[] = [
  {
    title: "Client call: Brightloop",
    markdown: `Call with **Marta Kaczmarek** (Brightloop) about the spring campaign.

## Decisions
- Kickoff on the 18th, weekly check-ins on Mondays
- Brightloop sends the brand assets by Friday
- We own the landing page and the e-mail sequence

## To do
- [x] Send the signed contract to finance
- [ ] Draft the timeline (@Tomasz)
- [ ] Book the kickoff room

## Open questions
1. Do they need the landing page in German too?
2. Who approves the final copy on their side?`,
  },
  { title: "Onboarding checklist", markdown: "- [ ] Mailbox and password\n- [ ] Access to support@\n- [ ] Read the brand guide" },
  { title: "Q4 planning", markdown: "Goals, budget and hiring for Q4." },
  { title: "Support replies we reuse", markdown: "Password reset, invoices, shared mailboxes." },
];

/** Address book entries: [name, company, title, email, phone]. */
const CONTACTS: [string, string, string, string, string][] = [
  ["Marta Kaczmarek", "Brightloop", "Marketing lead", "marta@brightloop.io", "+48 601 234 567"],
  ["Felix Wagner", "Studio Wagner", "Founder", "felix@studio-wagner.de", "+49 30 1234 5678"],
  ["Lena Weber", "Fjord", "Finance", "lena.weber@fjord.de", ""],
  ["Oliver Smith", "Northwind", "Operations", "oliver@northwind.co", ""],
  ["Sofía García", "Casa García", "Owner", "sofia@casa-garcia.es", "+34 612 345 678"],
];

/** Drive: folders at the root, then files [name, media type, folder or null for the root]. */
const FOLDERS = ["Brightloop", "Brand assets", "Contracts", "Finance", "Onboarding"];
const FILES: [string, string, string | null][] = [
  ["Spring campaign brief.pdf", "application/pdf", null],
  ["Q4 budget.csv", "text/csv", null],
  ["Team offsite photos.zip", "application/zip", null],
  ["Kickoff agenda.txt", "text/plain", null],
  ["Signed contract.pdf", "application/pdf", "Brightloop"],
];

const SHOTS: Shot[] = [
  { file: "mail.webp", path: "/app/mail", view: "user" },
  {
    file: "mail-thread.webp",
    path: "/app/mail",
    view: "user",
    async prepare(page) {
      await page.getByText("Contract for the spring campaign").first().click();
      await page.waitForTimeout(1200);
    },
  },
  {
    file: "shared-mailbox.webp",
    path: "/app/mail",
    view: "user",
    async prepare(page) {
      await page.getByText(`support@${DOMAIN}`).first().click().catch(() => page.getByText("support", { exact: false }).first().click());
      await page.waitForTimeout(800);
      await page.getByText("Question about shared mailboxes").first().click();
      await page.waitForTimeout(1200);
    },
  },
  { file: "notes.webp", path: (db) => `/app/notes/${noteId(db, "Client call: Brightloop")}`, view: "user", prepare: (page) => page.waitForTimeout(2500) },
  {
    file: "contacts.webp",
    path: (db) => `/app/contacts/${rowId(db, "contacts", "Marta Kaczmarek")}`,
    view: "user",
    async prepare(page) {
      await page.getByText("Partners", { exact: true }).first().click();
      await page.waitForTimeout(2500);
    },
  },
  {
    file: "drive.webp",
    path: "/app/drive",
    view: "user",
    async prepare(page) {
      await page.getByText("Brightloop", { exact: true }).last().click();
      await page.waitForTimeout(1500);
    },
  },
  {
    file: "mail-settings.webp",
    path: "/app/settings/mail",
    view: "admin",
    async prepare(page) {
      // The domain with its DNS records, not the sending limits above it.
      await page.getByRole("heading", { name: "Domains" }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -32));
      await page.waitForTimeout(500);
    },
  },
];

function noteId(db: DatabaseSync, title: string) {
  const row = db.prepare("select id from notes where org_id = ? and title = ? order by created_at desc").get(ORG_ID, title) as { id: string } | undefined;
  if (!row) throw new Error(`Note "${title}" missing: run with --seed`);
  return row.id;
}

function rowId(db: DatabaseSync, table: "contacts" | "drive_items", name: string) {
  const row = db.prepare(`select id from ${table} where org_id = ? and name = ? limit 1`).get(ORG_ID, name) as { id: string } | undefined;
  if (!row) throw new Error(`"${name}" missing from ${table}: run with --seed`);
  return row.id;
}

const dbFile = () => {
  const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")) {
    const db = new DatabaseSync(join(dir, f));
    const ok = db.prepare("select 1 from sqlite_master where name = 'mail_threads'").get();
    db.close();
    if (ok) return join(dir, f);
  }
  throw new Error("No local D1 with a mail_threads table. Run pnpm db:migrate and pnpm dev first.");
};

const secret = () => {
  const line = readFileSync(".dev.vars", "utf8").split("\n").find((l) => l.startsWith("BETTER_AUTH_SECRET="));
  if (!line) throw new Error("BETTER_AUTH_SECRET missing from .dev.vars");
  return line.slice("BETTER_AUTH_SECRET=".length).trim().replace(/^"|"$/g, "");
};

const apiAs =
  (cookie: string): Api =>
  async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(BASE + path, { method, headers: { cookie, origin: BASE, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  };

async function seed(db: DatabaseSync, api: Api, cookie: string) {
  // The old test threads stay, archived, so the inbox shows only the demo.
  const archived = db.prepare("update mail_threads set archived_at = ? where org_id = ? and archived_at is null and trashed_at is null").run(Date.now(), ORG_ID);
  console.log(`archived ${archived.changes} old threads`);
  // Oldest first, so the newest arrives last and sits on top.
  for (const [name, from, to, subject, text, ago] of [...MAIL].sort((a, b) => b[5] - a[5])) {
    const eml = [`From: ${name} <${from}>`, `To: ${to}@${DOMAIN}`, `Subject: ${subject}`, `Date: ${minutesAgo(ago)}`, `Message-ID: <${randomUUID()}@demo>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", text, ""].join("\r\n");
    const res = await fetch(`${BASE}/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(`${to}@${DOMAIN}`)}`, { method: "POST", body: eml });
    if (!res.ok) throw new Error(`email ${subject}: ${res.status} ${await res.text()}`);
  }
  // The handler stamps arrival time: put the threads back at their story time, and leave the newest four unread.
  for (const [, , , subject, , ago] of MAIL) {
    const at = Date.now() - ago * 60_000;
    db.prepare("update mail_threads set last_message_at = ?, unread = ? where org_id = ? and subject = ? and archived_at is null").run(at, ago < 60 ? 1 : 0, ORG_ID, subject);
    db.prepare("update mail_messages set created_at = ? where thread_id in (select id from mail_threads where org_id = ? and subject = ? and archived_at is null)").run(at, ORG_ID, subject);
  }
  db.prepare("update mail_threads set starred = 1 where org_id = ? and subject = 'Contract for the spring campaign'").run(ORG_ID);
  for (const n of [...NOTES].reverse()) await api("POST", "/api/app/notes", { title: n.title, markdown: n.markdown, sharing: "team", teamRole: "edit" });
  // Contacts and drive skip what's already there, so --seed can run again.
  const has = (table: "contacts" | "drive_items", name: string) => !!db.prepare(`select 1 from ${table} where org_id = ? and name = ? and ${table === "drive_items" ? "trashed_at is null" : "1"}`).get(ORG_ID, name);
  // The contacts shot shows the "Partners" group, so the org's own test contacts stay out of it.
  const group = (db.prepare("select id from contact_groups where org_id = ? and name = 'Partners'").get(ORG_ID) as { id: string } | undefined) ?? (await api<{ id: string }>("POST", "/api/app/contacts/groups", { name: "Partners" }));
  for (const [name, company, title, email, phone] of CONTACTS) {
    const body = { name, company, title, emails: [{ value: email, label: "work" }], phones: phone ? [{ value: phone, label: "work" }] : [], groupIds: [group.id] };
    if (has("contacts", name)) await api("PATCH", `/api/app/contacts/${rowId(db, "contacts", name)}`, { groupIds: [group.id] });
    else await api("POST", "/api/app/contacts", body);
  }
  // Other top-level drive items go to the trash (restorable, like the archived threads above).
  const keep = [...FOLDERS, ...FILES.filter((f) => !f[2]).map((f) => f[0])];
  db.prepare(`update drive_items set trashed_at = ? where org_id = ? and parent_id is null and trashed_at is null and name not in (${keep.map(() => "?").join(",")})`).run(Date.now(), ORG_ID, ...keep);
  const folders = new Map<string, string>();
  for (const name of FOLDERS) folders.set(name, has("drive_items", name) ? rowId(db, "drive_items", name) : (await api<{ id: string }>("POST", "/api/app/drive/items", { name })).id);
  for (const [name, type, folder] of FILES) {
    if (has("drive_items", name)) continue;
    const parent = folder ? `?parentId=${folders.get(folder)}` : "";
    const res = await fetch(`${BASE}/api/app/drive/files${parent}`, { method: "PUT", headers: { cookie, origin: BASE, "content-type": type, "x-filename": encodeURIComponent(name) }, body: `${name}\n`.repeat(2000) });
    if (!res.ok) throw new Error(`drive ${name}: ${res.status} ${await res.text()}`);
  }
  console.log(`seeded ${MAIL.length} messages, ${NOTES.length} notes, ${CONTACTS.length} contacts and ${FILES.length} files`);
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => !a.startsWith("--"));
  const shots = only ? SHOTS.filter((s) => s.file.includes(only)) : SHOTS;
  if (!shots.length) throw new Error(`No shot matches "${only}"`);
  mkdirSync(OUT, { recursive: true });

  const db = new DatabaseSync(dbFile());
  const owner = db.prepare("select user_id from member where organization_id = ? and role = 'owner'").get(ORG_ID) as { user_id: string } | undefined;
  if (!owner) throw new Error(`Org ${ORG_ID} not found in the local D1 (set SHOTS_ORG)`);

  // A session like Better Auth's own: the cookie is the token plus its HMAC.
  const token = randomBytes(24).toString("base64url");
  const sessionId = randomUUID();
  const now = Date.now();
  db.prepare("insert into session (id, expires_at, token, user_id, active_organization_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)").run(sessionId, now + 3_600_000, token, owner.user_id, ORG_ID, now, now);
  const signed = encodeURIComponent(`${token}.${createHmac("sha256", secret()).update(token).digest("base64")}`);

  const browser = await chromium.launch();
  try {
    const cookie = `better-auth.session_token=${signed}`;
    const api = apiAs(cookie);
    if (args.includes("--seed")) await seed(db, api, cookie);
    // Each shot in both themes: <name>.webp (light, docs and comparisons) and <name>-dark.webp (the dark marketing pages).
    for (const [shot, scheme] of shots.flatMap((s) => (["light", "dark"] as const).map((c) => [s, c] as const))) {
      const viewport = shot.viewport ?? { width: 1440, height: 900 };
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
      await context.addCookies([
        { name: "better-auth.session_token", value: signed, url: BASE },
        { name: `app-view-${owner.user_id}`, value: shot.view ?? "user", url: BASE },
        { name: "sidebar_state", value: "false", url: BASE },
      ]);
      const page = await context.newPage();
      const path = typeof shot.path === "string" ? shot.path : shot.path(db);
      await page.goto(BASE + path, { waitUntil: "load", timeout: 120_000 });
      await page.waitForTimeout(1500);
      if (new URL(page.url()).pathname.startsWith("/login")) throw new Error("Not signed in: check the session cookie");
      try {
        await shot.prepare?.(page);
        for (const frame of page.frames()) await frame.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove()).catch(() => {});
        const png = await page.screenshot({ type: "png" });
        const file = scheme === "dark" ? shot.file.replace(/\.webp$/, "-dark.webp") : shot.file;
        await sharp(png).resize(viewport.width * 2).webp({ quality: 86 }).toFile(join(OUT, file));
        console.log(`${file}  ${path}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    db.prepare("delete from session where id = ?").run(sessionId);
    db.close();
  }
}

await main();
