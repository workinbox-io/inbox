/**
 * Pure helpers for Amazon SES (lib/server/ses.ts): its delivery events as the Cloudflare Email Service events
 * handleDeliveryEvent (lib/server/mail/outbox.ts) already understands, and the sender header SES wants.
 */

/** An SES event as the configuration set publishes it to SNS (the notification's Message, parsed). */
export interface SesEvent {
  eventType?: string;
  mail?: { messageId?: string; source?: string; timestamp?: string; destination?: string[] };
  delivery?: { timestamp?: string; recipients?: string[] };
  bounce?: { bounceType?: string; timestamp?: string; bouncedRecipients?: { emailAddress: string }[] };
  complaint?: { timestamp?: string; complainedRecipients?: { emailAddress: string }[] };
  deliveryDelay?: { timestamp?: string; delayedRecipients?: { emailAddress: string }[] };
  reject?: unknown;
}

const TYPES: Record<string, string> = { Delivery: "delivered", DeliveryDelay: "deferred", Bounce: "bounced", Complaint: "complained", Reject: "rejected", RenderingFailure: "failed" };

/** "Anna <anna@acme.com>" or "anna@acme.com" → "anna@acme.com". */
export const bareAddress = (value: string) => (value.match(/<([^>]+)>\s*$/)?.[1] ?? value).trim().toLowerCase();

/** One Cloudflare-shaped event per recipient; [] for event types we don't track (Send, Open, Click…). */
export function fromSesEvent(e: SesEvent) {
  const type = TYPES[e.eventType ?? ""];
  if (!type || !e.mail?.messageId || !e.mail.source) return [];
  const sender = bareAddress(e.mail.source);
  const detail =
    e.eventType === "Delivery"
      ? { at: e.delivery?.timestamp, to: e.delivery?.recipients ?? [] }
      : e.eventType === "Bounce"
        ? { at: e.bounce?.timestamp, to: (e.bounce?.bouncedRecipients ?? []).map((r) => r.emailAddress) }
        : e.eventType === "Complaint"
          ? { at: e.complaint?.timestamp, to: (e.complaint?.complainedRecipients ?? []).map((r) => r.emailAddress) }
          : e.eventType === "DeliveryDelay"
            ? { at: e.deliveryDelay?.timestamp, to: (e.deliveryDelay?.delayedRecipients ?? []).map((r) => r.emailAddress) }
            : { at: e.mail.timestamp, to: e.mail.destination ?? [] };
  const at = detail.at ?? e.mail.timestamp ?? new Date().toISOString();
  return detail.to.map((to) => {
    const recipient = bareAddress(to);
    return {
      type: `cf.email.sending.message.${type}`,
      source: { domain: sender.split("@")[1] ?? "" },
      payload: {
        eventId: `ses:${e.mail!.messageId}:${type}:${recipient}`,
        messageId: e.mail!.messageId!,
        sender,
        recipient,
        ...(type === "bounced" ? { bounce: { type: e.bounce?.bounceType === "Permanent" ? "hard" : "soft" } } : {}),
      },
      metadata: { eventTimestamp: at },
    };
  });
}

/** `"Anna Nowak" <anna@acme.com>`, the name MIME-encoded when it isn't plain ASCII (SES rejects raw UTF-8 there). */
export function fromHeader(name: string | undefined, email: string) {
  const n = name?.replace(/[\r\n"]/g, "").trim();
  if (!n) return email;
  const encoded = /^[\x20-\x7e]*$/.test(n) ? `"${n.replace(/\\/g, "")}"` : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(n)))}?=`;
  return `${encoded} <${email}>`;
}

const TRUSTED_FIRST = /^(x-ses-[\w-]+|authentication-results|received-spf)$/i;

/** The header block of a raw message, unfolded. Values the Headers class refuses (raw UTF-8) are skipped. */
export function rawHeaders(raw: ArrayBuffer) {
  const text = new TextDecoder("latin1").decode(raw.slice(0, 256 * 1024));
  const end = text.search(/\r?\n\r?\n/);
  const headers = new Headers();
  for (const line of (end === -1 ? text : text.slice(0, end)).replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const name = line.slice(0, i).trim();
    // SES prepends its verdicts: a later copy came from the sender (a forged "PASS" would join as "FAIL, PASS").
    if (TRUSTED_FIRST.test(name) && headers.has(name)) continue;
    try {
      headers.append(name, line.slice(i + 1).trim());
    } catch {
      // Not a valid header name or value: ignore it, PostalMime still parses the body.
    }
  }
  return headers;
}

/**
 * Envelope of a mail found in S3 without its SNS notification (the S3 sweep, lib/server/mail/ses-inbound.ts).
 * shortcut: Bcc recipients are only known when SES's Received header names one ("for x@y"); with several Bcc'd
 * recipients the notification is the only source, so keep SNS working and treat this as the fallback it is.
 */
export function recoveredEnvelope(headers: { get(name: string): string | null }) {
  const from = bareAddress(headers.get("return-path") ?? "").replace(/^<|>$/g, "");
  const received = [...(headers.get("received") ?? "").matchAll(/\bfor\s+<?([^\s<>;]+@[^\s<>;]+)>?/gi)].map((m) => m[1]!);
  const listed = ["to", "cc", "delivered-to"].flatMap((h) => (headers.get(h) ?? "").match(/[^\s<>,;"']+@[^\s<>,;"']+/g) ?? []);
  return { from, recipients: [...new Set([...received, ...listed].map((a) => a.toLowerCase()))] };
}

/**
 * A bounce goes back only to a real sender: never to an empty return path, a mailer daemon, an automated mail, or a
 * sender SPF/DKIM didn't vouch for (a forged return path would turn our bounces into backscatter and hurt SES reputation).
 */
export function bounceable(from: string, headers: { get(name: string): string | null }) {
  if (!/\b(spf|dkim|dmarc)=pass\b/i.test(headers.get("authentication-results") ?? "")) return false;
  if (!from.includes("@") || /^(mailer-daemon|postmaster|no-?reply)@/i.test(from)) return false;
  if (headers.get("x-ses-spam-verdict") === "FAIL" || headers.get("x-ses-virus-verdict") === "FAIL") return false;
  const auto = headers.get("auto-submitted");
  return !(auto && auto.toLowerCase() !== "no") && !headers.get("list-id") && !/^(bulk|junk|list)$/i.test(headers.get("precedence") ?? "");
}

/** Keys and ages from an S3 ListObjectsV2 response. */
export function parseS3List(xml: string) {
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, c]) => ({
    key: decodeXml(c!.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? ""),
    lastModified: Date.parse(c!.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1] ?? ""),
  }));
  const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
  return { objects: objects.filter((o) => o.key), next: next ? decodeXml(next) : undefined };
}

const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
