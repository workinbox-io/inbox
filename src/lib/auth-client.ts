import { createAuthClient } from "better-auth/react";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

// oauthProviderClient sends the signed OAuth query of /login and /oauth/* pages along with sign-in,
// so an AI app's authorization continues after the user signs in.
export const authClient = createAuthClient({ plugins: [organizationClient(), twoFactorClient(), oauthProviderClient()] });

/**
 * Where Better Auth sends the browser next during an OAuth authorization, if anywhere. Only on pages
 * opened by one (they carry a signed `sig`): a plain sign-in also answers with `redirect` and `url`.
 */
export function oauthRedirect(data: unknown): string | null {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("sig")) return null;
  const d = data as { redirect?: unknown; url?: unknown } | null;
  return d?.redirect === true && typeof d.url === "string" ? d.url : null;
}
