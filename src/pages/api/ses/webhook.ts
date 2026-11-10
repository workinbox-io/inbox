import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fromSesEvent, type SesEvent } from "@/lib/mail/ses-events";
import { reportError } from "@/lib/server/errors";
import { handleDeliveryEvent } from "@/lib/server/mail/outbox";
import { enqueue } from "@/lib/server/queue";
import { sesConfigured } from "@/lib/server/ses";

/** An SNS message (subscription confirmation or notification); `Message` is the SES JSON. */
interface SnsMessage {
  Type?: string;
  SubscribeURL?: string;
  Message?: string;
}

/** What SES receiving publishes after storing a mail in S3. */
interface Received {
  notificationType: "Received";
  mail?: { source?: string };
  receipt?: { recipients?: string[]; action?: { type?: string; bucketName?: string; objectKey?: string } };
}

/**
 * Both SNS topics of docs/ses.md post here, subscribed with `?secret=SES_EVENTS_SECRET`:
 * `workinbox-inbound` (a mail SES received and stored in S3, queued as `mail.inbound`) and `workinbox-events`
 * (the configuration set's delivery events, handled like Cloudflare Email Service's).
 */
export const POST: APIRoute = async ({ request, url }) => {
  const secret = env.SES_EVENTS_SECRET;
  if (!secret || !sesConfigured()) return new Response("Not configured", { status: 404 });
  if (!safeEqual(url.searchParams.get("secret") ?? "", secret)) return new Response("Unauthorized", { status: 401 });
  const sns = JSON.parse(await request.text()) as SnsMessage;
  if (sns.Type === "SubscriptionConfirmation" && sns.SubscribeURL) {
    const confirm = new URL(sns.SubscribeURL);
    if (confirm.protocol !== "https:" || !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(confirm.hostname)) return new Response("Bad SubscribeURL", { status: 400 });
    await fetch(confirm);
    return new Response("confirmed");
  }
  if (sns.Type !== "Notification" || !sns.Message) return new Response("ignored");
  const message = JSON.parse(sns.Message) as Received | SesEvent;
  try {
    if ("notificationType" in message && message.notificationType === "Received") {
      const action = message.receipt?.action;
      if (action?.type === "S3" && action.bucketName && action.objectKey)
        await enqueue("mail.inbound", { bucket: action.bucketName, key: action.objectKey, from: message.mail?.source ?? "", recipients: message.receipt?.recipients ?? [] });
    } else {
      for (const event of fromSesEvent(message as SesEvent)) await handleDeliveryEvent(event);
    }
  } catch (e) {
    await reportError("web", e, { route: "ses webhook" });
    // 500 makes SNS retry (an event can arrive before its outbox row has the provider id).
    return new Response("handler error", { status: 500 });
  }
  return new Response("ok");
};

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
