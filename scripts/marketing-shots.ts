/**
 * Screenshots of the app for the marketing site (public/marketing/*.webp), modelled on Luxivo's scripts/marketing-shots.ts.
 *
 *   node scripts/marketing-shots.ts --seed   rebuild the demo org first (the public demo's story, lib/server/demo)
 *   node scripts/marketing-shots.ts          all shots
 *   node scripts/marketing-shots.ts notes    only the ones whose file name contains "notes"
 *
 * Needs `pnpm dev` (localhost:4321). The org is the public demo's (`POST /demo?domain=acme.example`, dev only), so the
 * site shows exactly what a visitor gets: Anna Kowalska (member) in the apps, Marek (owner) in the admin console.
 * It signs in by writing a Better Auth session row (removed at the end). 1440x900 at 2x, saved as webp, each shot in the
 * light theme and as <name>-dark.webp in the dark one (the marketing pages are dark).
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { CHANNEL, CLIENT_NOTE, CONTACT_GROUP, CONTRACT_SUBJECT, PROJECT_FOLDER, SUPPORT, SUPPORT_SUBJECT, TASKS } from "../src/lib/server/demo/content.ts";

const BASE = process.env.SHOTS_URL ?? "http://localhost:4321";
const DOMAIN = process.env.SHOTS_DOMAIN ?? "acme.example";
let ORG_ID = "";
const OUT = "public/marketing";

type Shot = {
  file: string;
  path: string | ((db: DatabaseSync) => string);
  viewport?: { width: number; height: number };
  /** Who takes it: Anna in the apps ("user", default), or Marek, the owner, in the admin console ("admin"). */
  view?: "user" | "admin";
  prepare?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  { file: "mail.webp", path: "/app/mail", view: "user" },
  {
    file: "mail-thread.webp",
    path: "/app/mail",
    view: "user",
    async prepare(page) {
      await page.getByText(CONTRACT_SUBJECT).first().click();
      await page.waitForTimeout(1200);
    },
  },
  {
    file: "shared-mailbox.webp",
    path: "/app/mail",
    view: "user",
    async prepare(page) {
      await page.getByText(`${SUPPORT}@${DOMAIN}`).first().click().catch(() => page.getByText("support", { exact: false }).first().click());
      await page.waitForTimeout(800);
      await page.getByText(SUPPORT_SUBJECT).first().click();
      await page.waitForTimeout(1200);
    },
  },
  { file: "notes.webp", path: (db) => `/app/notes/${noteId(db, CLIENT_NOTE)}`, view: "user", prepare: (page) => page.waitForTimeout(2500) },
  {
    file: "contacts.webp",
    path: (db) => `/app/contacts/${rowId(db, "contacts", "Marta Kaczmarek")}`,
    view: "user",
    async prepare(page) {
      await page.getByText(CONTACT_GROUP, { exact: true }).first().click();
      await page.waitForTimeout(2500);
    },
  },
  {
    file: "drive.webp",
    path: "/app/drive",
    view: "user",
    async prepare(page) {
      await page.getByText(PROJECT_FOLDER, { exact: true }).first().click();
      await page.waitForTimeout(1500);
    },
  },
  {
    file: "chat.webp",
    path: (db) => `/app/chat/${(db.prepare("select id from chat_channels where org_id = ? and name = ?").get(ORG_ID, CHANNEL) as { id: string }).id}`,
    view: "user",
    prepare: (page) => page.waitForTimeout(2000),
  },
  { file: "calendar.webp", path: "/app/calendar", view: "user", prepare: (page) => page.waitForTimeout(2000) },
  {
    file: "collections.webp",
    path: (db) => `/app/collections/${(db.prepare("select id from collections where org_id = ? and name = ?").get(ORG_ID, TASKS) as { id: string }).id}?view=board`,
    view: "user",
    prepare: (page) => page.waitForTimeout(1500),
  },
  {
    file: "mail-settings.webp",
    path: "/admin/mail",
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

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => !a.startsWith("--"));
  const shots = only ? SHOTS.filter((s) => s.file.includes(only)) : SHOTS;
  if (!shots.length) throw new Error(`No shot matches "${only}"`);
  mkdirSync(OUT, { recursive: true });

  if (args.includes("--seed")) {
    const res = await fetch(`${BASE}/demo?domain=${DOMAIN}`, { method: "POST", headers: { origin: BASE }, redirect: "manual" });
    if (res.status !== 303) throw new Error(`POST /demo: ${res.status} ${(await res.text()).slice(0, 500)}`);
    console.log(`seeded the demo org on ${DOMAIN}`);
  }
  const db = new DatabaseSync(dbFile());
  ORG_ID = (db.prepare("select org_id from mail_domains where domain = ?").get(DOMAIN) as { org_id: string } | undefined)?.org_id ?? "";
  if (!ORG_ID) throw new Error(`No demo org on ${DOMAIN}: run with --seed`);
  const person = (local: string) => (db.prepare("select id from user where email = ?").get(`${local}@${DOMAIN}`) as { id: string }).id;
  const anna = person("anna");
  const marek = person("marek");

  const sessions: string[] = [];
  // A session like Better Auth's own: the cookie is the token plus its HMAC.
  const signIn = (userId: string) => {
    const token = randomBytes(24).toString("base64url");
    const id = randomUUID();
    const now = Date.now();
    db.prepare("insert into session (id, expires_at, token, user_id, active_organization_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)").run(id, now + 3_600_000, token, userId, ORG_ID, now, now);
    sessions.push(id);
    return encodeURIComponent(`${token}.${createHmac("sha256", secret()).update(token).digest("base64")}`);
  };
  const signed = { user: { id: anna, cookie: signIn(anna) }, admin: { id: marek, cookie: signIn(marek) } };

  const browser = await chromium.launch();
  try {
    // Each shot in both themes: <name>.webp (light, docs and comparisons) and <name>-dark.webp (the dark marketing pages).
    for (const [shot, scheme] of shots.flatMap((s) => (["light", "dark"] as const).map((c) => [s, c] as const))) {
      const viewport = shot.viewport ?? { width: 1440, height: 900 };
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
      const who = signed[shot.view ?? "user"];
      await context.addCookies([
        { name: "better-auth.session_token", value: who.cookie, url: BASE },
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
    for (const id of sessions) db.prepare("delete from session where id = ?").run(id);
    db.close();
  }
}

await main();
