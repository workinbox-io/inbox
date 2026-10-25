import { env } from "cloudflare:workers";
import { siteConfig } from "@/config/site";
import { enqueue } from "./queue";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/**
 * Queues an e-mail; the queue consumer hands it to Cloudflare Email Service (deliverEmail) and
 * retries on failure, so a slow or failing send never fails the request that triggered it.
 */
export async function sendEmail(msg: EmailMessage) {
  await enqueue("email", msg);
}

/**
 * Sends through the `EMAIL` binding (send_email in wrangler.jsonc). The sending domain must be
 * onboarded in Cloudflare Email Service. In `astro dev` messages are printed instead.
 */
export async function deliverEmail(msg: EmailMessage) {
  if (import.meta.env.DEV) {
    console.info(`[email:dev] To: ${msg.to}\nSubject: ${msg.subject}\n---\n${msg.text}\n---`);
    return;
  }
  await env.EMAIL.send({
    to: msg.to,
    from: { email: env.EMAIL_FROM_ADDRESS, name: siteConfig.name },
    replyTo: msg.replyTo ?? siteConfig.supportEmail,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
}
