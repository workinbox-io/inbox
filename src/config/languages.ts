/**
 * The languages of the dashboard (and the website, if the product translates it): lib/i18n/locales.ts reads
 * this. The template ships English only, so nothing changes until a product adds codes here and dictionaries in
 * src/i18n/app/<area>/<code>.ts (default export: English text → translation). The first code is the default.
 */
export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language's own name, for the picker in Settings → Account: e.g. { en: "English", pl: "Polski" }. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English" };

/** Right-to-left languages among LOCALES. */
export const RTL_LOCALES: readonly string[] = [];

/** Cookie with a language picked before signing in (a website switcher, ?lang=); the dashboard follows it until the user picks one. */
export const LOCALE_COOKIE = "lang";
