// Tells IndexNow search engines (Bing, and through it ChatGPT search and Copilot; Yandex, Seznam,
// Naver) that the site's pages changed, so they recrawl them sooner. Google doesn't use IndexNow.
//
// The key is the file public/<key>.txt whose content is the key itself; IndexNow fetches it from
// https://<domain>/<key>.txt to check the ping comes from the site's owner. It isn't a secret.
//
//   node scripts/indexnow.ts --init   create the key file (pnpm setup does this)
//   node scripts/indexnow.ts          after a deploy: send every URL in dist/client/sitemap-*.xml
//
// A failed ping only prints a warning, so it never fails a deploy.
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const KEY_FILE = /^([0-9a-f]{32})\.txt$/;

function findKey() {
  for (const name of readdirSync("public")) {
    const key = name.match(KEY_FILE)?.[1];
    if (key && readFileSync(`public/${name}`, "utf8").trim() === key) return key;
  }
  return null;
}

if (process.argv.includes("--init")) {
  const existing = findKey();
  if (existing) {
    console.log(`IndexNow key already exists: public/${existing}.txt`);
  } else {
    const key = randomBytes(16).toString("hex");
    writeFileSync(`public/${key}.txt`, key);
    console.log(`Created the IndexNow key public/${key}.txt; commit it.`);
  }
  process.exit(0);
}

const key = findKey();
if (!key) {
  console.log("IndexNow: no key in public/, skipped (node scripts/indexnow.ts --init creates one).");
  process.exit(0);
}

const dir = "dist/client";
const sitemaps = existsSync(dir) ? readdirSync(dir).filter((f) => /^sitemap-\d+\.xml$/.test(f)) : [];
const urls = sitemaps.flatMap((f) => [...readFileSync(`${dir}/${f}`, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
if (urls.length === 0) {
  console.log("IndexNow: no URLs in dist/client/sitemap-*.xml, skipped (run after pnpm build).");
  process.exit(0);
}

const { host, origin } = new URL(urls[0]);
if (host === "example.com") {
  console.log("IndexNow: site is still example.com in astro.config.mjs, skipped.");
  process.exit(0);
}

try {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `${origin}/${key}.txt`, urlList: urls }),
  });
  // 200 and 202 both mean accepted; 202 while the key file is still being verified.
  if (res.ok) console.log(`IndexNow: sent ${urls.length} URLs for ${host} (${res.status}).`);
  else console.warn(`IndexNow: ${res.status} ${await res.text()}`);
} catch (err) {
  console.warn(`IndexNow: ${err instanceof Error ? err.message : err}`);
}
