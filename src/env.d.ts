/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import("@/lib/server/auth").Session["user"] | null;
    session: import("@/lib/server/auth").Session["session"] | null;
    orgId: string | null;
    /** The user's role in `orgId`. */
    role: import("@/lib/server/roles").OrgRole | null;
    /** Set when the request was authenticated with an API key (/api/v1) instead of a session. */
    apiKeyId: string | null;
    /** The language the page renders in (lib/server/i18n.ts): the user's setting, the website's or the browser's. */
    locale: import("@/lib/i18n/locales").SiteLocale;
  }
}

/** Secrets aren't in wrangler.jsonc, so `wrangler types` only sees them when .dev.vars exists. */
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string;
    PADDLE_API_KEY?: string;
    PADDLE_WEBHOOK_SECRET?: string;
    PUBLIC_PADDLE_CLIENT_TOKEN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    /** Gets an e-mail about each new kind of error (lib/server/errors.ts). */
    ALERT_EMAIL?: string;
    /** Gets an e-mail about each sign-up (lib/server/notify.ts). */
    NOTIFY_EMAIL?: string;
    /** "self" (one company on its own Cloudflare account, no billing) or "cloud" (hosted, plans and domain automation). */
    DEPLOY_MODE?: "self" | "cloud";
    /** cloud: the domain whose subdomains orgs get at once (acme.<MAIL_BASE_DOMAIN>). */
    MAIL_BASE_DOMAIN?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
    /** Amazon SES for the orgs' own domains in hosted mode (lib/server/ses.ts, docs/ses.md). All four, or SES is off. */
    AWS_SES_ACCESS_KEY_ID?: string;
    AWS_SES_SECRET_ACCESS_KEY?: string;
    AWS_SES_REGION?: string;
    AWS_ACCOUNT_ID?: string;
    /** In the SNS subscription URLs of /api/hooks/ses (?secret=…). */
    SES_EVENTS_SECRET?: string;
  }
}

/** MCP Apps widgets bundled into one HTML document (scripts/mcp-widgets.ts). */
declare module "*?widget" {
  const html: string;
  export default html;
}

type ThemeMode = "system" | "light" | "dark";

/** Defined by the inline theme script in BaseLayout. */
interface Window {
  tapll?: ((command: string, ...args: unknown[]) => unknown) & { q?: unknown[][] };
  setThemeMode(mode: ThemeMode): void;
  nextThemeMode(): ThemeMode;
}
