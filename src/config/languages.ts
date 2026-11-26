/**
 * The languages of the dashboard (and the website, if the product translates it): lib/i18n/locales.ts reads
 * this. The template ships English only, so nothing changes until a product adds codes here and dictionaries in
 * src/i18n/app/<area>/<code>.ts (default export: English text → translation). The first code is the default.
 */
export const LOCALES = ["en", "pl"] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language's own name, for the picker in Settings → Account: e.g. { en: "English", pl: "Polski" }. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", pl: "Polski" };

/** Each language's flag for the website's language picker (Windows shows the letters, which still reads fine). */
export const LOCALE_FLAGS: Record<Locale, string> = { en: "🇬🇧", pl: "🇵🇱" };

/**
 * Website pages (English path) that have a translation, per language: "/pricing" → /pl/pricing exists. The header's
 * language picker and hreflang only offer what's listed; every other page stays English.
 */
export const TRANSLATED_PAGES: Partial<Record<Locale, readonly string[]>> = {
  pl: [
    "/",
    "/pricing",
    "/custom-domain-email",
    "/team-chat",
    "/shared-notes",
    "/team-calendar",
    "/shared-drive",
    "/shared-contacts",
    "/google-workspace-alternative",
    "/shared-mailbox",
    "/self-hosted",
    "/custom-apps",
    "/security",
    "/status",
    "/vs",
    "/vs/google-workspace",
    "/vs/microsoft-365",
    "/vs/zoho-mail",
    "/vs/proton-mail",
    "/vs/fastmail",
    "/vs/nextcloud",
    "/vs/cloudflare-agentic-inbox",
    "/docs",
    "/docs/api",
    "/docs/billing",
    "/docs/calendar",
    "/docs/mail-clients",
    "/docs/mcp",
    "/docs/modules",
    "/docs/quickstart",
    "/docs/self-host",
    "/docs/team",
    "/docs/two-factor-authentication",
  ],
};

/** Right-to-left languages among LOCALES. */
export const RTL_LOCALES: readonly string[] = [];

/** Cookie with a language picked before signing in (a website switcher, ?lang=); the dashboard follows it until the user picks one. */
export const LOCALE_COOKIE = "lang";
