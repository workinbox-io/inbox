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
  }
}

type ThemeMode = "system" | "light" | "dark";

/** Defined by the inline theme script in BaseLayout. */
interface Window {
  setThemeMode(mode: ThemeMode): void;
  nextThemeMode(): ThemeMode;
}
