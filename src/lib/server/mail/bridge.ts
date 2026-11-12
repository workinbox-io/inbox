import { env } from "cloudflare:workers";
import { HttpError, type HandlerContext } from "@/lib/server/api";
import { sha256Hex } from "@/lib/server/crypto";

/** External credentials are private to the connecting person, including from org admins. */
export async function externalAccountsRequest(ctx: HandlerContext, method: string, suffix = "", body?: unknown) {
  if (!ctx.locals.user || ctx.locals.apiKeyId) throw new HttpError(403, "Sign in to manage external mail accounts");
  if (!env.MAIL_BRIDGE_URL || !env.MAIL_BRIDGE_TOKEN) throw new HttpError(503, "External mail is not configured");
  const url = new URL(env.MAIL_BRIDGE_URL);
  if (url.protocol !== "https:" || url.username || url.password) throw new HttpError(503, "External mail is not configured");
  const scope = await sha256Hex(JSON.stringify([ctx.orgId, ctx.locals.user.id]));
  url.pathname = `/orgs/${scope}/accounts${suffix}`;
  url.search = ctx.url.search;
  let response: Response;
  try {
    response = await fetch(url, {
      method, redirect: "error", signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${env.MAIL_BRIDGE_TOKEN}`, "content-type": "application/json" },
      body: body instanceof ReadableStream ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new HttpError(502, "Mail bridge unavailable"); }
  if (!response.ok) {
    const status = [403, 404, 409, 413, 422, 503].includes(response.status) ? response.status : 502;
    throw new HttpError(status, status === 403 ? "This mailbox is read-only" : status === 404 ? "Not found" : "Mail server connection failed");
  }
  return new Response(response.body, { status: response.status, headers: {
    "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store",
    ...(response.headers.get("content-disposition") ? { "content-disposition": response.headers.get("content-disposition")! } : {}),
  } });
}
