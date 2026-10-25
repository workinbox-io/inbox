import type { APIContext, MiddlewareNext } from "astro";
import { env } from "cloudflare:workers";
import { defineMiddleware } from "astro:middleware";
import { and, asc, db, eq, member, session as sessionTable } from "@/db";
import { authenticateApiKey, withinRateLimit } from "@/lib/server/api-keys";
import { clientIp } from "@/lib/server/api";
import { getAuth } from "@/lib/server/auth";
import { reportError } from "@/lib/server/errors";
import { subscriptionUsable } from "@/lib/server/billing";
import { createPersonalOrg, getSubscription } from "@/lib/server/org";
import { featureUpsell, hasFeature, planById } from "@/config/plans";
import { toRole } from "@/lib/server/roles";

const PROTECTED = ["/app", "/api/app"];
/** /api/v1 paths that don't need a key. */
const PUBLIC_V1 = ["/api/v1/openapi.json"];
/** Better Auth endpoints that send mail or check passwords; limited per IP (AUTH_RATE_LIMIT). */
const AUTH_LIMITED = /^\/api\/auth\/(sign-in|sign-up|request-password-reset|forget-password|send-verification-email|two-factor)/;

const apiError = (status: number, error: string, headers: Record<string, string> = {}) => Response.json({ error }, { status, headers });

/** The public API only takes API keys, never session cookies, so it can't be driven cross-site. */
async function apiKeyAuth(ctx: APIContext, next: MiddlewareNext) {
  const key = await authenticateApiKey(ctx.request.headers.get("authorization"));
  if (!key) {
    return apiError(401, "Missing or invalid API key. Send it as: Authorization: Bearer <key>", { "WWW-Authenticate": "Bearer" });
  }
  if (!(await withinRateLimit(key.id))) return apiError(429, "Too many requests", { "Retry-After": "60" });
  const sub = await getSubscription(key.orgId);
  if (!sub || !subscriptionUsable(sub) || !hasFeature(planById(sub.plan), "apiAccess")) {
    return apiError(402, `${featureUpsell("apiAccess")} Check Billing in the dashboard.`);
  }
  ctx.locals.orgId = key.orgId;
  ctx.locals.role = key.role;
  ctx.locals.apiKeyId = key.id;
  return next();
}

/** Errors that escape a page or a route not wrapped in handler() (which reports its own). */
export const onRequest = defineMiddleware(async (ctx, next) => {
  try {
    return await route(ctx, next);
  } catch (e) {
    await reportError("web", e, { route: `${ctx.request.method} ${ctx.url.pathname}`, orgId: ctx.locals.orgId });
    throw e;
  }
});

async function route(ctx: APIContext, next: MiddlewareNext) {
  ctx.locals.user = null;
  ctx.locals.session = null;
  ctx.locals.orgId = null;
  ctx.locals.role = null;
  ctx.locals.apiKeyId = null;

  const path = ctx.url.pathname;
  if (ctx.isPrerendered) return next();
  if (path.startsWith("/api/v1/") && !PUBLIC_V1.includes(path)) return apiKeyAuth(ctx, next);
  if (ctx.request.method === "POST" && AUTH_LIMITED.test(path)) {
    const { success } = await env.AUTH_RATE_LIMIT.limit({ key: clientIp(ctx.request) || "unknown" });
    if (!success) return apiError(429, "Too many attempts. Wait a minute and try again.", { "Retry-After": "60" });
  }
  if (!PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) return next();

  const result = await getAuth().api.getSession({ headers: ctx.request.headers });
  // The active org (and the role in it) is re-checked against membership on every request,
  // so removed or demoted members lose access right away.
  const active = result?.session.activeOrganizationId;
  const membership =
    result &&
    ((active && (await findMembership(result.user.id, active))) || (await resolveOrg(result.session.id, result.user.id, result.user.name)));
  const orgId = membership?.orgId;
  if (!result || !orgId) {
    if (path.startsWith("/api/")) return apiError(401, "Unauthorized");
    return ctx.redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  ctx.locals.user = result.user;
  ctx.locals.session = result.session;
  ctx.locals.orgId = orgId;
  ctx.locals.role = toRole(membership.role);
  return next();
}

async function findMembership(userId: string, orgId: string) {
  const [m] = await db
    .select({ orgId: member.organizationId, role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)));
  return m ?? null;
}

/**
 * Sessions created at sign-up predate the personal org, so pick it up lazily. Users who signed up
 * through an invitation they never accepted have no org at all and get a personal one now.
 */
async function resolveOrg(sessionId: string, userId: string, userName: string) {
  const [m] = await db
    .select({ orgId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  // A personal org is always owned by the user.
  const found = m ?? { orgId: await createPersonalOrg(userId, userName), role: "owner" };
  await db.update(sessionTable).set({ activeOrganizationId: found.orgId }).where(eq(sessionTable.id, sessionId));
  return found;
}
