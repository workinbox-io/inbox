/**
 * Lists the dashboard texts with no translation yet: `pnpm i18n:missing pl [folder]`.
 * Prints JSON { "<source folder>": ["English key", …] }, the keys to add to src/i18n/app/<area>/<code>.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { extractKeys, neededKeys } from "../src/lib/i18n/keys.ts";

const [locale = "pl", only] = process.argv.slice(2);
const root = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "i18n" ? [] : walk(p); // dictionaries and lib/i18n (examples in comments)
    return /\.(ts|tsx|astro)$/.test(name) ? [p] : [];
  });
}

const dict: Record<string, string> = {};
const dictDir = join(root, "src/i18n/app");
for (const area of readdirSync(dictDir)) {
  const file = join(dictDir, area, `${locale}.ts`);
  try {
    statSync(file);
  } catch {
    continue;
  }
  Object.assign(dict, (await import(file)).default);
}

const missing: Record<string, string[]> = {};
const used = new Set<string>();
for (const file of walk(join(root, "src"))) {
  const folder = relative(join(root, "src"), dirname(file));
  const source = readFileSync(file, "utf8");
  // Marketing pages: their own dictionary (src/i18n/site/<code>.ts); a page using both checks its panel t() keys.
  if (source.includes("@/lib/i18n/site") && !source.includes("@/lib/i18n/panel")) continue;
  for (const key of neededKeys(extractKeys(source), locale)) {
    used.add(key);
    if (dict[key] === undefined && (!only || folder.startsWith(only))) (missing[folder] ??= []).includes(key) || missing[folder]!.push(key);
  }
}
const orphans = Object.keys(dict).filter((k) => !used.has(k));
console.log(JSON.stringify(missing, null, 2));
console.error(`${Object.values(missing).flat().length} missing, ${orphans.length} unused in ${locale}`);
