// Turns a fresh copy of the template into your product: name, domain, colors, Cloudflare resources.
// Usage: pnpm setup   (run once, right after creating the repo; safe to re-run before the first deploy)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

// Reads answers line by line, so it also works with piped input.
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
async function ask(question: string, def: string) {
  process.stdout.write(`${question} (${def}): `);
  const { value } = await lines.next();
  return (value ?? "").trim() || def;
}

const name = await ask("Product name", "Acme");
const slug = await ask("Worker / resource name", name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
const domain = await ask("Production domain", `${slug}.com`);
const support = await ask("Support email", `support@${domain}`);
const sender = await ask("Sender address for e-mails (on a domain onboarded in Cloudflare Email Service)", `noreply@${domain}`);
const accent = await ask("Accent color", "#2f5bff");
const description = await ask("One-line description", "The one-line pitch of your product.");
const createResources = (await ask("Create D1, R2 and the queue on Cloudflare now? [y/N]", "N")).toLowerCase().startsWith("y");
rl.close();

function edit(path: string, pairs: [string | RegExp, string][]) {
  let s = readFileSync(path, "utf8");
  for (const [from, to] of pairs) s = s.replace(from, to);
  writeFileSync(path, s);
}

edit("package.json", [[/"name": "[^"]+"/, `"name": "${slug}"`]]);
edit("wrangler.jsonc", [
  [/saas-template/g, slug],
  [/"EMAIL_FROM_ADDRESS": "[^"]*"/, `"EMAIL_FROM_ADDRESS": "${sender}"`],
]);
edit("src/config/site.ts", [
  [/name: "[^"]*",/, `name: "${name}",`],
  [/description: "[^"]*",/, `description: "${description}",`],
  [/url: "[^"]*",/, `url: "https://${domain}",`],
  [/supportEmail: "[^"]*",/, `supportEmail: "${support}",`],
  [/accent: "[^"]*",/, `accent: "${accent}",`],
  [/email: "legal@example.com"/, `email: "legal@${domain}"`],
]);
edit("astro.config.mjs", [[/site: "[^"]*"/, `site: "https://${domain}"`]]);
edit("src/styles/global.css", [[/--primary: #[0-9a-fA-F]{6};/g, `--primary: ${accent};`]]);
edit("src/lib/server/api-keys.ts", [[/API_KEY_PREFIX = "[^"]*"/, `API_KEY_PREFIX = "${slug.replace(/-/g, "").slice(0, 4)}_"`]]);
for (const file of ["public/logo.svg", "public/favicon.svg"]) edit(file, [[/#2f5bff/g, accent]]);
// IndexNow key file, so deploys can ping Bing and co. (scripts/indexnow.ts).
execFileSync("node", ["scripts/indexnow.ts", "--init"], { stdio: "inherit" });

if (createResources) {
  const wrangler = (...args: string[]) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  const d1 = wrangler("d1", "create", slug);
  const id = d1.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1] ?? d1.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1];
  if (id) edit("wrangler.jsonc", [[/"database_id": "[^"]*"/, `"database_id": "${id}"`]]);
  else console.warn("Couldn't read the D1 database id; put it in wrangler.jsonc yourself.");
  wrangler("r2", "bucket", "create", `${slug}-files`);
  wrangler("queues", "create", `${slug}-jobs`);
  console.log("Created D1, R2 and the queue.");
}

console.log(`
Done. Next:
  cp .dev.vars.example .dev.vars        # set BETTER_AUTH_SECRET (openssl rand -hex 32)
  pnpm db:migrate && pnpm dev
Before the first deploy:
  wrangler secret put BETTER_AUTH_SECRET  (and the Paddle secrets, see README)
  onboard ${domain} in Cloudflare Email Service, then pnpm deploy`);
