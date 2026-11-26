// Prepares a self-hosted Work Inbox: points wrangler.jsonc at your domain, switches DEPLOY_MODE to "self" and,
// if you want, creates the Cloudflare resources (D1, R2, queues) under the names wrangler.jsonc already uses.
// Usage: pnpm run setup   (not `pnpm setup`, which is pnpm's own command; safe to re-run before the first deploy)
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

// Reads answers line by line, so it also works with piped input.
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
async function ask(question: string, def: string) {
  process.stdout.write(`${question} (${def}): `);
  const { value } = await lines.next();
  return (value ?? "").trim() || def;
}

const domain = await ask("Address of your Work Inbox, without https://", "mail.example.com");
const sender = await ask("Sender address for the app's e-mails (on a domain onboarded in Cloudflare Email Service)", `noreply@${domain.split(".").slice(-2).join(".")}`);
const admin = await ask("Your e-mail (ADMIN_EMAILS)", "");
const createResources = (await ask("Create D1, R2 and the queues on Cloudflare now? [y/N]", "N")).toLowerCase().startsWith("y");
rl.close();

const set = (s: string, key: string, value: string) => s.replace(new RegExp(`"${key}": "[^"]*"`), `"${key}": "${value}"`);
let config = readFileSync("wrangler.jsonc", "utf8");
// workinbox.io's own route; add your domain to the Worker in the Cloudflare dashboard (or put it here).
config = config.replace(/\n\s*\/\/[^\n]*workinbox\.io[^\n]*\n\s*"routes": \[[^\]]*\],/, "");
config = set(config, "PUBLIC_APP_URL", `https://${domain}`);
config = set(config, "EMAIL_FROM_ADDRESS", sender);
config = set(config, "ADMIN_EMAILS", admin);
config = set(config, "DEPLOY_MODE", "self");
// workinbox.io's own services: empty turns them off (your mail bridge host goes in MAIL_CLIENT_HOST, infra/mail).
for (const key of ["PADDLE_ENV", "AI_GATEWAY_ID", "MAIL_BASE_DOMAIN", "MAIL_CLIENT_HOST", "MAIL_SETUP_ORIGIN"]) config = set(config, key, "");
writeFileSync("wrangler.jsonc", config);
// Your own IndexNow key instead of workinbox.io's (scripts/indexnow.ts pings with it after each deploy).
rmSync("public/372d01b3a966246c4ccd4346e08b0740.txt", { force: true });
execFileSync("node", ["scripts/indexnow.ts", "--init"], { stdio: "inherit" });

if (createResources) {
  const wrangler = (...args: string[]) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  const d1 = wrangler("d1", "create", "inbox");
  const id = d1.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1] ?? d1.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1];
  if (id) writeFileSync("wrangler.jsonc", set(readFileSync("wrangler.jsonc", "utf8"), "database_id", id));
  else console.warn("Couldn't read the D1 database id; put it in wrangler.jsonc yourself.");
  wrangler("r2", "bucket", "create", "inbox-files");
  for (const queue of ["inbox-jobs", "inbox-jobs-dlq", "inbox-mail-events", "inbox-mail-events-dlq"]) wrangler("queues", "create", queue);
  console.log("Created D1, R2 and the queues.");
}

console.log(`
Done. Next:
  wrangler secret put BETTER_AUTH_SECRET   # openssl rand -hex 32
  onboard your mail domain in Cloudflare Email Service, then: pnpm run deploy
  docs: src/content/docs/self-host.md`);
