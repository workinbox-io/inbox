import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { hasFeature, planById } from "@/config/plans";
import { parseGithub } from "@/lib/collections/git";
import { subscriptionUsable } from "@/lib/server/billing";
import { hookById, touchHook } from "@/lib/server/collection-git";
import { moduleOn } from "@/lib/server/modules";
import { getSubscription } from "@/lib/server/org";
import { enqueue } from "@/lib/server/queue";

const MAX_BODY = 1_000_000;
const text = (body: string, status: number) => new Response(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * A collection's GitHub webhook (Repo → Settings → Webhooks, JSON, events: pull requests, pushes, deployment statuses).
 * The URL's id finds the hook; GitHub's HMAC signature with the hook's secret proves the delivery. The work runs in job
 * `collections.git` (lib/server/collection-git.ts).
 */
export const POST: APIRoute = async ({ request, params }) => {
  const hook = await hookById(params.id ?? "");
  if (!hook || !(await moduleOn(hook.orgId, "collections"))) return text("Not found", 404);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return text("Too large", 413);
  const body = await request.text();
  if (body.length > MAX_BODY) return text("Too large", 413);
  if (!(await validSignature(hook.secret, body, request.headers.get("x-hub-signature-256") ?? ""))) return text("Bad signature", 401);
  const event = request.headers.get("x-github-event") ?? "";
  if (event === "ping") return text("pong", 200);
  // Integrations are part of the API, a paid feature on the hosted service.
  if (env.DEPLOY_MODE !== "self") {
    const sub = await getSubscription(hook.orgId);
    if (!sub || !subscriptionUsable(sub) || !hasFeature(planById(sub.plan), "apiAccess")) return text("The organization's plan doesn't include integrations", 402);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return text("Send the payload as application/json", 400);
  }
  const events = parseGithub(event, payload as Record<string, unknown>).slice(0, 50);
  if (events.length) await enqueue("collections.git", { orgId: hook.orgId, collectionId: hook.collectionId, events });
  await touchHook(hook.id);
  return text(`queued ${events.length}`, 202);
};

/** `sha256=<hex>` of the body with the secret, compared without leaking timing. */
async function validSignature(secret: string, body: string, header: string) {
  if (!header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const given = header.slice(7);
  const want = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
