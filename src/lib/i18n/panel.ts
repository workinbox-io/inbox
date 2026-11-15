/**
 * Copy of the dashboard (and the auth pages) in the user's language, for Astro components and React islands
 * alike: `t("Save changes")`, keyed by the English text like the marketing site (lib/i18n/site.ts), so a
 * string without a translation simply stays English. Dictionaries: `src/i18n/app/<area>/<code>.ts`.
 *
 * Where the words come from:
 * - on the server, the request's language (middleware → lib/server/i18n.ts, AsyncLocalStorage), registered on
 *   globalThis so this module never imports server code into a browser bundle;
 * - in the browser, `window.__PANEL_I18N__`, set by `/i18n/<code>.js` (src/pages/i18n/[locale].js.ts), which
 *   BaseLayout loads before the panel and auth components.
 * docs/i18n-plan.md, phase 2.
 */
import { DEFAULT_LOCALE, isSiteLocale, type SiteLocale } from "./locales";
import { fill, plural as pluralForm, type Plural, type Vars } from "./t";

type Panel = { locale: SiteLocale; dict: Record<string, string> };

declare global {
  // eslint-disable-next-line no-var
  var __panelI18n: (() => Panel | undefined) | undefined;
  interface Window {
    __PANEL_I18N__?: Panel;
  }
}

function current(): Panel | undefined {
  if (typeof window === "undefined") return globalThis.__panelI18n?.();
  return window.__PANEL_I18N__;
}

/** The user's language for the page being rendered ("en" when there's none). */
export function appLocale(): SiteLocale {
  const l = current()?.locale;
  return l && isSiteLocale(l) ? l : DEFAULT_LOCALE;
}

/**
 * The text in the user's language. A key may carry a context ("mail|Inbox") when one English word needs two
 * translations; English shows the part after "|".
 */
export function t(en: string, vars?: Vars): string {
  return fill(current()?.dict[en] ?? en.replace(/^[a-z-]+\|/, ""), vars);
}

/**
 * Count-dependent text: `tp(n, { one: "{n} conversation", other: "{n} conversations" })`. English picks one/other.
 * Translations key every form by the English `other` plus the language's plural category:
 * "{n} conversations|one", "{n} conversations|few", "{n} conversations|many", "{n} conversations|other".
 */
export function tp(n: number, forms: Plural, vars?: Vars): string {
  const p = current();
  if (!p) return pluralForm("en", forms, n, vars);
  const cat = new Intl.PluralRules(p.locale).select(n);
  const own = p.dict[`${forms.other}|${cat}`] ?? p.dict[`${forms.other}|other`];
  return own ? fill(own, { n: n.toLocaleString(p.locale), ...vars }) : pluralForm("en", forms, n, vars);
}
