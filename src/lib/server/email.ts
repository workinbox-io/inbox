import { env } from "cloudflare:workers";
import { siteConfig } from "@/config/site";
import { buildEml } from "@/lib/mail/mime";
import { ATTACHMENT_KEY, ATTACHMENT_URL_PREFIX, type AttachmentInput } from "@/lib/uploads";
import { enqueue } from "./queue";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Copies (staff mailbox replies). */
  cc?: string[];
  /** Display name of the sender; defaults to the product name. */
  fromName?: string;
  /** Sender address on an onboarded domain (staff mailboxes); defaults to EMAIL_FROM_ADDRESS. */
  fromEmail?: string;
  /** Threading headers (In-Reply-To, References). */
  headers?: Record<string, string>;
  /** Uploaded files (/api/files/attachments/…), attached from R2 when sending. */
  files?: AttachmentInput[];
  /** iMIP invitation part: such mail goes out as raw MIME (structured send APIs can't add a text/calendar alternative). */
  calendar?: { method: "REQUEST" | "CANCEL" | "REPLY"; ics: string };
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
  await sendNow(msg);
}

/** Mail providers take about 25 MB per message; files beyond that are left out. */
const MAX_ATTACHED_BYTES = 18 * 1024 * 1024;

export async function attachFiles(files: AttachmentInput[] | undefined) {
  const attached: { disposition: "attachment"; filename: string; type: string; content: ArrayBuffer }[] = [];
  let total = 0;
  for (const f of files ?? []) {
    const path = f.url.startsWith("http") ? new URL(f.url).pathname : f.url;
    const key = path.startsWith(ATTACHMENT_URL_PREFIX) ? path.slice(ATTACHMENT_URL_PREFIX.length) : "";
    const object = ATTACHMENT_KEY.test(key) ? await env.FILES.get(key) : null;
    if (!object || total + object.size > MAX_ATTACHED_BYTES) continue;
    total += object.size;
    attached.push({ disposition: "attachment", filename: f.filename, type: f.mediaType, content: await object.arrayBuffer() });
  }
  return attached;
}

/** The message as RFC 5322 text, for providers that take raw MIME and for "Show original". */
export async function rawEmail(msg: EmailMessage, extra: { date?: Date; messageId?: string | null } = {}) {
  const files = await attachFiles(msg.files);
  return buildEml({
    from: { email: msg.fromEmail ?? env.EMAIL_FROM_ADDRESS, name: msg.fromName ?? siteConfig.name },
    to: msg.to,
    cc: msg.cc?.join(", "),
    replyTo: msg.replyTo ?? null,
    subject: msg.subject,
    date: extra.date ?? new Date(),
    messageId: extra.messageId ?? `<${crypto.randomUUID()}@${(msg.fromEmail ?? env.EMAIL_FROM_ADDRESS).split("@")[1]}>`,
    inReplyTo: msg.headers?.["In-Reply-To"],
    references: msg.headers?.References,
    text: msg.text,
    html: msg.html,
    attachments: files.map((f) => ({ filename: f.filename, mediaType: f.type, content: new Uint8Array(f.content) })),
    calendar: msg.calendar,
  });
}

/** Sends right away (no queue) and returns the provider's Message-ID, for callers that store it. */
export async function sendNow(msg: EmailMessage): Promise<string> {
  if (import.meta.env.DEV) {
    const from = msg.fromEmail ? `${msg.fromName ?? siteConfig.name} <${msg.fromEmail}>` : (msg.fromName ?? siteConfig.name);
    const cc = msg.cc?.length ? `\nCc: ${msg.cc.join(", ")}` : "";
    const headers = msg.headers ? `\nHeaders: ${JSON.stringify(msg.headers)}` : "";
    const files = msg.files?.length ? `\nFiles: ${msg.files.map((f) => f.filename).join(", ")}` : "";
    const calendar = msg.calendar ? `\nCalendar: text/calendar; method=${msg.calendar.method}\n${msg.calendar.ics}` : "";
    console.info(`[email:dev] To: ${msg.to}${cc}\nFrom: ${from}\nSubject: ${msg.subject}${headers}${files}\n---\n${msg.text}\n---${calendar}`);
    return `dev-${crypto.randomUUID()}`;
  }
  if (msg.calendar) {
    // shortcut: raw MIME has a single envelope recipient, so Cc is dropped; invitations go one per attendee.
    const { EmailMessage } = await import("cloudflare:email");
    const result = await env.EMAIL.send(new EmailMessage(msg.fromEmail ?? env.EMAIL_FROM_ADDRESS, msg.to, await rawEmail(msg)));
    return result.messageId;
  }
  const result = await env.EMAIL.send({
    to: msg.to,
    ...(msg.cc?.length ? { cc: msg.cc } : {}),
    from: { email: msg.fromEmail ?? env.EMAIL_FROM_ADDRESS, name: msg.fromName ?? siteConfig.name },
    replyTo: msg.replyTo ?? siteConfig.supportEmail,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    ...(msg.files?.length ? { attachments: await attachFiles(msg.files) } : {}),
    ...(msg.headers ? { headers: msg.headers } : {}),
  });
  return result.messageId;
}
