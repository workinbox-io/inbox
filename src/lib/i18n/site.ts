/**
 * Words of the marketing site (components/site, pages/*.astro). English text = key, `src/i18n/site/<code>.ts` holds the
 * translation; a missing key shows the English. The page's language comes from its URL (/pl/pricing → "pl"), so the same
 * .astro page renders both versions (pages/pl/*.astro re-render the English page).
 */
import { pagePath } from "@/lib/page-path";
import { fill, type Vars } from "./t";
import { TRANSLATED_PAGES } from "@/config/languages";
import { DEFAULT_LOCALE, localizedPath, pageLocales, stripLocale, type SiteLocale } from "./locales";

// src/i18n/site/<code>.ts plus <part>.<code>.ts (e.g. vs.pl.ts, docs.pl.ts), merged per language.
const files = import.meta.glob<{ default: Record<string, string> }>("/src/i18n/site/*.ts", { eager: true });
const words: Record<string, Record<string, string>> = {};
for (const [file, mod] of Object.entries(files)) {
  const code = /([a-z]{2})\.ts$/.exec(file)?.[1];
  if (code) Object.assign((words[code] ??= {}), mod.default);
}

export const siteLocale = (url: URL | string): SiteLocale => stripLocale(pagePath(typeof url === "string" ? url : url.pathname)).locale;

export function siteT(locale: SiteLocale, text: string, vars?: Vars): string {
  const own = locale === DEFAULT_LOCALE ? undefined : words[locale];
  // "ai|Plan": a key with a context prefix, which English shows without it (same idea as the dashboard's t("mail|Archive")).
  return fill(own?.[text] ?? text.replace(/^[a-z]+\|/, ""), vars);
}

/** `const t = tFor(siteLocale(Astro.url))`, then `t("English text")`. */
export const tFor = (locale: SiteLocale) => (text: string, vars?: Vars) => siteT(locale, text, vars);

/** The languages a page (English path) is available in, English first (config/languages.ts TRANSLATED_PAGES). */
export { pageLocales };

/** An internal link in the page's language: "/pricing" → "/pl/pricing" when that page has a Polish version, else unchanged. */
export function lp(locale: SiteLocale, href: string): string {
  if (locale === DEFAULT_LOCALE || !href.startsWith("/")) return href;
  const [, path = "/", rest = ""] = /^([^?#]*)(.*)$/.exec(href) ?? [];
  return TRANSLATED_PAGES[locale]?.includes(path) ? localizedPath(locale, path) + rest : href;
}

/** Every plural form of a count phrase for client scripts: { one, few, many, other } with the placeholders left in.
 * The dictionary keys the extra forms as "<other>|few" (like the dashboard's tp()); English has one and other. */
export function pluralForms(locale: SiteLocale, one: string, other: string): Record<string, string> {
  const own = locale === DEFAULT_LOCALE ? undefined : words[locale];
  const cats = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  return Object.fromEntries(cats.map((c) => [c, own?.[`${other}|${c}`] ?? siteT(locale, c === "one" ? one : other)]));
}

/** True for an internal link that has no version in this language, so it opens in English (lp() leaves it as is). */
export const isUntranslated = (locale: SiteLocale, href: string): boolean => locale !== DEFAULT_LOCALE && lp(locale, href) === href && href.startsWith("/");
