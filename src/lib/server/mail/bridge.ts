import { timingSafeEqual } from "node:crypto";
import { env } from "cloudflare:workers";
import { HttpError, type HandlerContext } from "@/lib/server/api";
import { sha256Hex } from "@/lib/server/crypto";

/** External credentials are private to the connecting person, including from org admins. */
async function bridgeRequest(ctx: HandlerContext, collection: "accounts" | "hosted" | "imap-imports", method: string, suffix = "", body?: unknown) {
  if (!ctx.locals.user || ctx.locals.apiKeyId) throw new HttpError(403, "Sign in to manage external mail accounts");
  if (!env.MAIL_BRIDGE_URL || !env.MAIL_BRIDGE_TOKEN) throw new HttpError(503, "External mail is not configured");
  const url = new URL(env.MAIL_BRIDGE_URL);
  if (url.protocol !== "https:" || url.username || url.password) throw new HttpError(503, "External mail is not configured");
  const scope = await sha256Hex(JSON.stringify([ctx.orgId, ctx.locals.user.id]));
  url.pathname = `/orgs/${scope}/${collection}${suffix}`;
  url.search = ctx.url.search;
  let response: Response;
  try {
    response = await fetch(url, {
      method, redirect: "manual", signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${env.MAIL_BRIDGE_TOKEN}`, "content-type": "application/json", "x-workinbox-org": ctx.orgId, "x-workinbox-user": ctx.locals.user.id },
      body: body instanceof ReadableStream ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    console.error("[mail-bridge] request failed", error instanceof Error ? error.message : "Unknown network error");
    throw new HttpError(502, "Mail bridge unavailable");
  }
  if (!response.ok) {
    const status = [403, 404, 409, 413, 422, 503].includes(response.status) ? response.status : 502;
    throw new HttpError(status, status === 403 ? "This mailbox is read-only" : status === 404 ? "Not found" : "Mail server connection failed");
  }
  return new Response(response.body, { status: response.status, headers: {
    "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store",
    ...(response.headers.get("content-disposition") ? { "content-disposition": response.headers.get("content-disposition")! } : {}),
  } });
}

export function bridgeAuthorized(request: Request) {
  const expected = Buffer.from(`Bearer ${env.MAIL_BRIDGE_TOKEN ?? ""}`), actual = Buffer.from(request.headers.get("authorization") ?? "");
  return !!env.MAIL_BRIDGE_TOKEN && expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const externalAccountsRequest = (ctx: HandlerContext, method: string, suffix = "", body?: unknown) => bridgeRequest(ctx,"accounts",method,suffix,body);
export const hostedAccountsRequest = (ctx: HandlerContext, method: string, suffix = "", body?: unknown) => bridgeRequest(ctx,"hosted",method,suffix,body);
export const imapImportsRequest = (ctx: HandlerContext, method: string, suffix = "", body?: unknown) => bridgeRequest(ctx,"imap-imports",method,suffix,body);

/** Signs an Apple profile with the mail host's certificate (bridge, /profiles/sign); null when the bridge can't. */
export async function signedProfile(ctx: HandlerContext, xml: string): Promise<ArrayBuffer | null> {
  if (!env.MAIL_BRIDGE_URL || !env.MAIL_BRIDGE_TOKEN || !ctx.locals.user) return null;
  try {
    const scope = await sha256Hex(JSON.stringify([ctx.orgId, ctx.locals.user.id]));
    const url = new URL(`/orgs/${scope}/profiles/sign`, env.MAIL_BRIDGE_URL);
    if (url.protocol !== "https:") return null;
    const response = await fetch(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${env.MAIL_BRIDGE_TOKEN}`, "content-type": "application/xml" }, body: xml });
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}
