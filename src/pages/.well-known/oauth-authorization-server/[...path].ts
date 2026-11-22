// RFC 8414 metadata of the OAuth server at /api/auth (the issuer), found at
// /.well-known/oauth-authorization-server/api/auth by MCP clients.
import type { APIRoute } from "astro";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "@/lib/server/auth";

export const GET: APIRoute = ({ request }) => oauthProviderAuthServerMetadata(getAuth())(request);
