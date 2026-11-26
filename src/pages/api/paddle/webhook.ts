import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { reportError } from "@/lib/server/errors";
import { handlePaddleEvent, verifyWebhook } from "@/lib/server/paddle";

/** Paddle → Notifications → destination `<app>/api/paddle/webhook`, subscription.* events. */
export const POST: APIRoute = async ({ request }) => {
  const secret = env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 400 });
  const event = await verifyWebhook(await request.text(), request.headers.get("paddle-signature"), secret);
  if (!event) return new Response("Invalid signature", { status: 400 });
  try {
    await handlePaddleEvent(event);
  } catch (e) {
    await reportError("web", e, { route: "paddle webhook", event: event.event_type, eventId: event.event_id });
    // 500 makes Paddle retry with backoff.
    return new Response("handler error", { status: 500 });
  }
  return new Response("ok");
};
