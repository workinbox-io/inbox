import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { recordPageView } from "@/lib/server/analytics";
import { clientIp } from "@/lib/server/api";

/**
 * Page view beacon from BaseLayout: `{ u: location.href, r: document.referrer }`, sent as text so
 * it needs no CORS preflight. Always answers 204; analytics must never break a page.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.text();
    if (body.length <= 4096) {
      const { u, r } = JSON.parse(body) as { u?: unknown; r?: unknown };
      const ownHost = new URL(env.PUBLIC_APP_URL ?? request.url).hostname;
      if (typeof u === "string" && new URL(u).hostname === ownHost) {
        await recordPageView({
          url: u,
          referrer: typeof r === "string" ? r : null,
          ip: clientIp(request),
          userAgent: request.headers.get("user-agent"),
          country: (request.cf?.country as string | undefined) ?? null,
        });
      }
    }
  } catch (e) {
    // Malformed beacons are dropped; anything else is worth a line in the log.
    if (!(e instanceof SyntaxError || e instanceof TypeError)) console.warn("[collect]", (e as Error).message);
  }
  return new Response(null, { status: 204 });
};
