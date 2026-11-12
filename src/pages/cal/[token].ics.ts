/** A person's calendar as a read-only .ics subscription (lib/server/calendar/feed.ts). No session: the token is the key. */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { clientIp } from "@/lib/server/api";
import { feedIcs } from "@/lib/server/calendar/feed";
import { reportError } from "@/lib/server/errors";

const headers = { "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const ics = await feedIcs(params.token ?? "");
    if (ics === null) {
      // Misses count against the IP so tokens can't be guessed in bulk.
      const { success } = await env.AUTH_RATE_LIMIT.limit({ key: `cal-feed:${clientIp(request) || "unknown"}` });
      return new Response(success ? "Not found" : "Too many requests", { status: success ? 404 : 429, headers });
    }
    return new Response(ics, {
      headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    await reportError("web", e, { route: "GET /cal/[token].ics" });
    return new Response("Error", { status: 500, headers });
  }
};
