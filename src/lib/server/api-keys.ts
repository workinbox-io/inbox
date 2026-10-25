import { env } from "cloudflare:workers";
import { apiKeys, and, asc, db, eq, isNull, lt, or, user } from "@/db";
import { randomBase64Url, sha256Hex } from "./crypto";
import { toRole } from "./roles";

/** Keys look like `sk_…`; change the prefix per product so leaked keys are easy to attribute. */
export const API_KEY_PREFIX = "sk_";

export const hashApiKey = sha256Hex;

/** A new random key; only its hash is stored. */
export async function generateApiKey() {
  const key = `${API_KEY_PREFIX}${randomBase64Url(30)}`;
  return { key, hash: await hashApiKey(key), prefix: key.slice(0, 10) };
}

const KEY_PATTERN = new RegExp(`^Bearer\\s+(${API_KEY_PREFIX}[A-Za-z0-9_-]{20,})\\s*$`);

/** Resolves `Authorization: Bearer sk_…` to the key's org and role, or null. */
export async function authenticateApiKey(header: string | null) {
  const key = header?.match(KEY_PATTERN)?.[1];
  if (!key) return null;
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.hash, await hashApiKey(key)));
  if (!row) return null;
  // At most one write a minute per key.
  const stale = new Date(Date.now() - 60_000);
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKeys.id, row.id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, stale))))
    .catch((e) => console.warn(`[api-keys] lastUsedAt: ${(e as Error).message}`));
  return { id: row.id, orgId: row.orgId, role: toRole(row.role) };
}

/** Cloudflare's rate limiter (API_RATE_LIMIT in wrangler.jsonc); true when the key may go on. */
export async function withinRateLimit(keyId: string) {
  const { success } = await env.API_RATE_LIMIT.limit({ key: keyId });
  return success;
}

export async function listApiKeys(orgId: string) {
  const rows = await db
    .select({ key: apiKeys, createdBy: user.name })
    .from(apiKeys)
    .leftJoin(user, eq(apiKeys.createdBy, user.id))
    .where(eq(apiKeys.orgId, orgId))
    .orderBy(asc(apiKeys.createdAt));
  return rows.map(({ key, createdBy }) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    role: key.role,
    createdBy,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  }));
}

export type ApiKeyRow = Awaited<ReturnType<typeof listApiKeys>>[number];
