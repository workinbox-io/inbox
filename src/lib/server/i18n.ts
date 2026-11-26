/**
 * The request's language for the dashboard and the auth pages (lib/i18n/panel.ts reads it). The middleware
 * runs each request inside `withLocale()`, so everything rendered for it (Astro components, React islands'
 * server render, API handlers) sees the same language, even with other requests in flight in this isolate.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_LOCALE, LOCALE_COOKIE, SITE_LOCALES, isSiteLocale, pickLocale, type SiteLocale } from "@/lib/i18n/locales";

/** Every dictionary of the dashboard: src/i18n/app/<area>/<code>.ts, merged per language. */
const FILES = import.meta.glob<{ default: Record<string, string> }>("/src/i18n/app/*/*.ts", { eager: true });
export const PANEL_AREAS: Record<string, Partial<Record<SiteLocale, Record<string, string>>>> = {};
const DICTS = Object.fromEntries(SITE_LOCALES.map((l) => [l, {} as Record<string, string>])) as Record<SiteLocale, Record<string, string>>;
for (const [file, mod] of Object.entries(FILES)) {
  const [, area, code] = /\/app\/([^/]+)\/([a-z]{2})\.ts$/.exec(file) ?? [];
  // Compared as strings: with English only (the template), a narrowed code would be `never`.
  if (!area || !code || code === DEFAULT_LOCALE || !(SITE_LOCALES as readonly string[]).includes(code)) continue;
  const lang = code as SiteLocale;
  (PANEL_AREAS[area] ??= {})[lang] = mod.default;
  Object.assign(DICTS[lang], mod.default);
}

/** One language's merged dictionary (also what /i18n/<code>.js ships to the browser). */
export const panelDictionary = (locale: SiteLocale) => DICTS[locale];

/** Short content hash of a language's dictionary, so the browser file can be cached forever. */
export function dictionaryVersion(locale: SiteLocale): string {
  const s = JSON.stringify(DICTS[locale]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const store = new AsyncLocalStorage<SiteLocale>();

export const withLocale = <T>(locale: SiteLocale, fn: () => T): T => store.run(locale, fn);
export const requestLocale = (): SiteLocale => store.getStore() ?? DEFAULT_LOCALE;

globalThis.__panelI18n = () => {
  const locale = store.getStore();
  return locale && locale !== DEFAULT_LOCALE ? { locale, dict: DICTS[locale] } : undefined;
};

/**
 * The language for a request: the signed-in user's choice, else the language they picked on the website
 * (LOCALE_COOKIE, set by the switcher or `?lang=`), else the browser's, else English.
 */
export function resolveLocale(request: Request, userLocale?: string | null): SiteLocale {
  if (isSiteLocale(userLocale)) return userLocale;
  const cookie = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([a-z]{2})`).exec(request.headers.get("cookie") ?? "")?.[1];
  if (isSiteLocale(cookie)) return cookie;
  return pickLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE;
}

export { LOCALE_COOKIE };

/** A person's own language (`user.locale`), else the current request's (English outside one). For mail sent to someone else. */
export async function userLocale(who: { id: string } | { email: string }): Promise<SiteLocale> {
  const { db, eq, user } = await import("@/db");
  const [row] = await db.select({ locale: user.locale }).from(user).where("id" in who ? eq(user.id, who.id) : eq(user.email, who.email.toLowerCase())).limit(1);
  return isSiteLocale(row?.locale) ? row.locale : requestLocale();
}
