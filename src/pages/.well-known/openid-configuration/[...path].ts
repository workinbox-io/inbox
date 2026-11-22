// OpenID discovery for the issuer at /api/auth (path-insertion form; the issuer-relative
// /api/auth/.well-known/openid-configuration is served by Better Auth itself).
import type { APIRoute } from "astro";
import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "@/lib/server/auth";

export const GET: APIRoute = ({ request }) => oauthProviderOpenIdConfigMetadata(getAuth())(request);
