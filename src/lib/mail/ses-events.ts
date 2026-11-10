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

/** The header block of a raw message, unfolded. Values the Headers class refuses (raw UTF-8) are skipped. */
export function rawHeaders(raw: ArrayBuffer) {
  const text = new TextDecoder("latin1").decode(raw.slice(0, 256 * 1024));
  const end = text.search(/\r?\n\r?\n/);
  const headers = new Headers();
  for (const line of (end === -1 ? text : text.slice(0, end)).replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    try {
      headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
    } catch {
      // Not a valid header name or value: ignore it, PostalMime still parses the body.
    }
  }
  return headers;
}
