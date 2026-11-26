/**
 * The /mcp endpoint (Streamable HTTP, stateless). Callers authenticate with an OAuth access token from
 * our own OAuth server (Claude, ChatGPT: see oauth.ts) or with an organization API key (Claude Code,
 * Cursor, scripts). Tools live in src/mcp.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { and, apiKeys, db, eq, member, user } from "@/db";
import { buildMcpServer, type McpPrincipal } from "@/mcp";
import { disabledModules } from "@/lib/server/modules";
import { clientIp } from "./api";
import { API_KEY_PREFIX, authenticateApiKey, withinRateLimit } from "./api-keys";
import { getAuth } from "./auth";
import { reportError } from "./errors";
import { MCP_SCOPES, ORG_CLAIM, getOAuthClientName, hasConsent, mcpResource, oauthIssuer } from "./oauth";
import { toRole } from "./roles";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

/** Where MCP clients find out how to get a token (RFC 9728). */
export const protectedResourceMetadataUrl = () => {
  const resource = new URL(mcpResource());
  return `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
};

function withCors(res: Response) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

/** JSON-RPC shaped error with an RFC 6750 challenge, so clients start (or repeat) the OAuth flow. */
function unauthorized(error: string, description: string, status = 401) {
  const params = [
    `resource_metadata="${protectedResourceMetadataUrl()}"`,
    `scope="${Object.keys(MCP_SCOPES).join(" ")}"`,
    ...(error ? [`error="${error}"`, `error_description="${description.replace(/"/g, "'")}"`] : []),
  ];
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: description }, id: null },
    { status, headers: { "WWW-Authenticate": `Bearer ${params.join(", ")}` } },
  );
}

// One cache key for the signing keys, so they're read from D1 once per isolate (and on unknown kid).
const JWKS_CACHE_KEY = {};

async function verifyAccessToken(token: string) {
  try {
    return await verifyJwsAccessToken(token, {
      jwksFetch: async () => (await getAuth().api.getJwks()) as never,
      jwksCacheKey: JWKS_CACHE_KEY,
      verifyOptions: { issuer: oauthIssuer(), audience: mcpResource(), requiredClaims: ["sub", "azp"] },
    });
  } catch {
    return null;
  }
}

type AuthResult = { principal: McpPrincipal; rateKey: string } | { error: Response };

async function authenticate(request: Request): Promise<AuthResult> {
  const header = request.headers.get("authorization");
  const ip = clientIp(request) || null;
  const token = header?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
  if (!token) return { error: unauthorized("", "Sign in to connect this app.") };

  // Organization API keys: full access within the key's role.
  if (token.startsWith(API_KEY_PREFIX)) {
    const key = await authenticateApiKey(header);
    if (!key) return { error: unauthorized("invalid_token", "Invalid API key.") };
    const [row] = await db.select({ name: apiKeys.name }).from(apiKeys).where(eq(apiKeys.id, key.id));
    const name = row?.name ?? "API key";
    return {
      rateKey: key.id,
      principal: {
        orgId: key.orgId,
        role: key.role,
        userId: null,
        apiKeyId: key.id,
        scopes: Object.keys(MCP_SCOPES),
        actor: { type: "api_key", id: key.id, name },
        via: `MCP (${name})`,
        ip,
      },
    };
  }

  const claims = await verifyAccessToken(token);
  // DPoP-bound tokens would need the proof checked; our clients use plain bearer tokens.
  if (!claims || claims.cnf) return { error: unauthorized("invalid_token", "The access token is invalid or expired.") };
  const userId = String(claims.sub);
  const { mustChangePassword } = await import("./mail/account-security");
  if (await mustChangePassword(userId)) return { error: unauthorized("invalid_token", "Change your temporary password before connecting this app.") };
  const clientId = String(claims.azp);
  const orgId = typeof claims[ORG_CLAIM] === "string" ? (claims[ORG_CLAIM] as string) : null;
  if (!orgId) return { error: unauthorized("invalid_token", "The access token has no organization.") };

  // Re-checked on every request: disconnecting the app in Settings or leaving the org cuts access at once.
  const [[m], consented] = await Promise.all([
    db
      .select({ role: member.role, name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(and(eq(member.userId, userId), eq(member.organizationId, orgId))),
    hasConsent(userId, clientId, orgId),
  ]);
  if (!m || !consented) return { error: unauthorized("invalid_token", "This connection was removed. Connect the app again.") };

  const scopes = String(claims.scope ?? "").split(" ").filter(Boolean);
  return {
    rateKey: `oauth:${userId}:${clientId}`,
    principal: {
      orgId,
      role: toRole(m.role),
      userId,
      scopes,
      actor: { type: "user", id: userId, name: m.name, email: m.email },
      via: await getOAuthClientName(clientId),
      ip,
    },
  };
}

const mcpHandler = createMcpHandler((ctx) => buildMcpServer(ctx.authInfo!.extra!.principal as McpPrincipal), {
  onerror: (e) => console.warn(`[mcp] ${e.message}`),
});

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const auth = await authenticate(request);
    if ("error" in auth) return withCors(auth.error);
    if (!(await withinRateLimit(auth.rateKey))) {
      return withCors(Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests" }, id: null }, { status: 429, headers: { "Retry-After": "60" } }));
    }
    const principal = { ...auth.principal, disabled: await disabledModules(auth.principal.orgId) };
    const res = await mcpHandler.fetch(request, {
      authInfo: { token: "", clientId: principal.via, scopes: principal.scopes, resource: new URL(mcpResource()), extra: { principal } },
    });
    return withCors(res);
  } catch (e) {
    await reportError("web", e, { route: `${request.method} /mcp` });
    return withCors(Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }, { status: 500 }));
  }
}
