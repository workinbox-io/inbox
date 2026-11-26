/**
 * The OAuth server that AI apps (Claude, ChatGPT, Cursor…) use to connect to /mcp. Better Auth's
 * `mcp` plugin does the protocol (auth.ts); this file holds our rules: a connection belongs to one
 * user in one organization, and the user can see and disconnect it in Settings.
 */
import { env } from "cloudflare:workers";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { msg } from "@/lib/i18n/panel";
import { and, db, desc, eq, member, oauthClient, oauthConsent, oauthRefreshToken, organization } from "@/db";

/** Scopes an app can ask for on top of the identity ones. Tools that change data need `write`. */
export const MCP_SCOPES = {
  read: msg("See your organization's data"),
  write: msg("Create, change and delete data on your behalf"),
} as const;

export type McpScope = keyof typeof MCP_SCOPES;

/** What the consent screen says for each scope an app may request. */
export const SCOPE_LABELS: Record<string, string> = {
  openid: msg("Confirm who you are"),
  profile: msg("See your name and profile picture"),
  email: msg("See your email address"),
  offline_access: msg("Stay connected until you disconnect it"),
  ...MCP_SCOPES,
};

/** Access-token claim with the organization the user picked when connecting. */
export const ORG_CLAIM = "org_id";

/** The MCP endpoint as a canonical URL; access tokens are issued for exactly this audience. */
export const mcpResource = () => `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/mcp`;

/** Better Auth's base URL, which is also the issuer of access tokens. */
export const oauthIssuer = () => `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/api/auth`;

/**
 * The organization a connection would use: the session's active one if the user is still a member,
 * or their only one. Null when they have to pick (several orgs) or have none yet.
 */
export async function oauthOrgFor(userId: string, activeOrgId: unknown) {
  const orgs = await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, userId));
  const ids = orgs.map((o) => o.id);
  if (typeof activeOrgId === "string" && ids.includes(activeOrgId)) return { orgId: activeOrgId, count: ids.length };
  return { orgId: ids.length === 1 ? ids[0]! : null, count: ids.length };
}

/**
 * `postLogin` for the OAuth provider: users in several organizations pick one on /oauth/organization
 * before the consent screen, and the consent is stored per organization.
 */
export const oauthOrgSelection = {
  page: "/oauth/organization",
  async shouldRedirect({ user, session, isContinuation }: { user: { id: string }; session: Record<string, unknown>; isContinuation: boolean }) {
    const { orgId, count } = await oauthOrgFor(user.id, session.activeOrganizationId);
    // Coming back from the picker proves nothing by itself; the active org must be a membership.
    return isContinuation || count === 1 ? !orgId : true;
  },
  async consentReferenceId({ user, session }: { user: { id: string }; session: Record<string, unknown> }) {
    const { orgId } = await oauthOrgFor(user.id, session.activeOrganizationId);
    if (!orgId) throw new Error("No organization selected for this connection");
    return orgId;
  },
};

/**
 * Fetches Client ID Metadata Documents (an app's `client_id` is a URL describing it). Workers can't
 * reach private networks, and the `global_fetch_strictly_public` flag keeps fetch off our own zone,
 * which is what the Node transport's DNS pinning guards against elsewhere. Redirects aren't followed.
 */
export const fetchClientMetadataResource: ClientMetadataResourceFetch = (input, init) => fetch(input, { ...init, redirect: "manual" });

export interface ConnectedApp {
  id: string;
  clientId: string;
  name: string;
  uri: string | null;
  icon: string | null;
  orgName: string;
  scopes: string[];
  connectedAt: string;
}

const parseList = (v: string | null) => {
  try {
    const list = JSON.parse(v ?? "[]");
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
};

/** The apps a user has connected, newest first, with the organization each one acts in. */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const rows = await db
    .select({ consent: oauthConsent, client: oauthClient, orgName: organization.name })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthConsent.clientId, oauthClient.clientId))
    .leftJoin(organization, eq(oauthConsent.referenceId, organization.id))
    .where(eq(oauthConsent.userId, userId))
    .orderBy(desc(oauthConsent.updatedAt));
  return rows.map(({ consent, client, orgName }) => ({
    id: consent.id,
    clientId: client.clientId,
    name: client.name || "Unnamed app",
    uri: client.uri,
    icon: client.icon,
    orgName: orgName ?? "Removed organization",
    scopes: parseList(consent.scopes),
    connectedAt: consent.createdAt.toISOString(),
  }));
}

/**
 * Disconnects an app: drops the consent and its refresh tokens. Access tokens it still holds stop
 * working at once too, because /mcp checks the consent on every request (lib/server/mcp.ts).
 */
export async function disconnectApp(userId: string, consentId: string) {
  const [consent] = await db
    .select()
    .from(oauthConsent)
    .where(and(eq(oauthConsent.id, consentId), eq(oauthConsent.userId, userId)));
  if (!consent) return false;
  const tokens = consent.referenceId
    ? and(eq(oauthRefreshToken.clientId, consent.clientId), eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.referenceId, consent.referenceId))
    : and(eq(oauthRefreshToken.clientId, consent.clientId), eq(oauthRefreshToken.userId, userId));
  await db.batch([db.delete(oauthRefreshToken).where(tokens), db.delete(oauthConsent).where(eq(oauthConsent.id, consent.id))]);
  return true;
}

/** True while the user's consent for this app and organization stands. */
export async function hasConsent(userId: string, clientId: string, orgId: string) {
  const [row] = await db
    .select({ id: oauthConsent.id })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId), eq(oauthConsent.referenceId, orgId)))
    .limit(1);
  return Boolean(row);
}

export async function getOAuthClient(clientId: string | null) {
  if (!clientId) return null;
  const [row] = await db
    .select({ clientId: oauthClient.clientId, name: oauthClient.name, uri: oauthClient.uri, icon: oauthClient.icon })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId));
  return row ?? null;
}

export async function getOAuthClientName(clientId: string) {
  return (await getOAuthClient(clientId))?.name || "AI app";
}
