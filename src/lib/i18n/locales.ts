/**
 * Languages of the website and the dashboard, from config/languages.ts. English (the first) has no URL prefix,
 * the rest live under /<code>/. Template code: the product only edits config/languages.ts.
 */
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, RTL_LOCALES } from "@/config/languages";

export const SITE_LOCALES = LOCALES;
export type SiteLocale = (typeof SITE_LOCALES)[number];
export const DEFAULT_LOCALE: SiteLocale = SITE_LOCALES[0];
export { LOCALE_COOKIE };

export const isSiteLocale = (v: unknown): v is SiteLocale => SITE_LOCALES.includes(v as SiteLocale);

/** The language's own name, e.g. "Polski". */
export const localeName = (l: SiteLocale) => LOCALE_NAMES[l];
export const localeDir = (l: string | null | undefined): "rtl" | "ltr" => (l && RTL_LOCALES.includes(l) ? "rtl" : "ltr");

/** "/pricing" in `locale`: "/pl/pricing", "/" → "/pl". English stays unprefixed. */
export function localizedPath(locale: SiteLocale, path: string): string {
  const clean = stripLocale(path).path;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Splits "/pl/pricing" into { locale: "pl", path: "/pricing" }; unprefixed paths are English. */
export function stripLocale(path: string): { locale: SiteLocale; path: string } {
  const m = /^\/([a-z]{2})(\/.*|$)/.exec(path);
  if (m && isSiteLocale(m[1]) && m[1] !== DEFAULT_LOCALE) return { locale: m[1], path: m[2] || "/" };
  return { locale: DEFAULT_LOCALE, path: path || "/" };
}

/** Best site language from an Accept-Language header, or null (no redirects: only for a hint banner). */
export function pickLocale(acceptLanguage: string | null | undefined): SiteLocale | null {
  if (!acceptLanguage) return null;
  const tags = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((t) => t.tag && t.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const base = tag.split("-")[0];
    const code = base === "no" || base === "nn" ? "nb" : base;
    if (isSiteLocale(code)) return code;
  }
  return null;
}
