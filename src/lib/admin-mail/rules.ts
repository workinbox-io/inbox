/**
 * Staff mailboxes (/staff/mail): folders, who a reply or reply-all goes to, forwarding, snooze
 * times, and showing incoming HTML safely. Pure module (no cloudflare:workers), used by the server,
 * the dashboard and the tests.
 */
import { t } from "@/lib/i18n/panel";

export const MAIL_FOLDERS = ["inbox", "snoozed", "sent", "archived", "trash"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

/** The mailbox filter value for every staff mailbox at once. */
export const ALL_MAILBOXES = "all";

export const splitAddresses = (s: string | null | undefined) =>
  (s ?? "")
    .split(/[,;\s]+/)
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

const unique = (list: string[]) => [...new Set(list)];

export interface RecipientSource {
  direction: "in" | "out";
  fromEmail: string;
  to: string;
  cc: string;
}

/**
 * Who a reply goes to. Reply: the other side (the contact, i.e. their Reply-To) for an incoming
 * mail, or the first recipient of one we sent. Reply all: the rest of To and Cc go to Cc, never our
 * own mailboxes and never the sender's own noreply address when they set a Reply-To.
 */
export function replyRecipients(m: RecipientSource, contact: string, ours: string[], all: boolean) {
  const own = new Set(ours.map((a) => a.toLowerCase()));
  const to = m.direction === "in" ? contact.toLowerCase() : (splitAddresses(m.to)[0] ?? contact.toLowerCase());
  if (!all) return { to: [to], cc: [] as string[] };
  const cc = unique([...splitAddresses(m.to), ...splitAddresses(m.cc)]).filter((a) => a !== to && !own.has(a) && a !== m.fromEmail.toLowerCase());
  return { to: [to], cc };
}

/** Whether "Reply all" would reach anyone beyond a plain reply. */
export const hasOtherRecipients = (m: RecipientSource, contact: string, ours: string[]) => replyRecipients(m, contact, ours, true).cc.length > 0;

export function forwardSubject(subject: string | null | undefined) {
  const s = (subject ?? "").trim();
  if (!s) return "Fwd: (no subject)";
  return /^fwd?\s*:/i.test(s) ? s : `Fwd: ${s}`;
}

export interface ForwardSource {
  fromEmail: string;
  fromName: string | null;
  to: string;
  cc: string;
  subject: string;
  text: string;
  createdAt: Date;
}

const sender = (m: { fromEmail: string; fromName: string | null }) => (m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail);

/** The header lines of a forwarded mail, as Gmail writes them. */
export function forwardHeaders(m: ForwardSource, formatDate: (d: Date) => string) {
  return [
    ["From", sender(m)],
    ["Date", formatDate(m.createdAt)],
    ["Subject", m.subject || "(no subject)"],
    ["To", m.to],
    ...(m.cc ? [["Cc", m.cc]] : []),
  ] as [string, string][];
}

export function forwardText(m: ForwardSource, formatDate: (d: Date) => string) {
  const head = forwardHeaders(m, formatDate)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---------- Forwarded message ----------\n${head}\n\n${m.text.trim()}`;
}

/** The signature block under a new message, separated the standard way ("-- "). */
export function withSignature(text: string, signature: string) {
  const sig = signature.trim();
  return sig ? `${text}\n\n-- \n${sig}` : text;
}

export interface SnoozePreset {
  id: string;
  label: string;
  at: Date;
}

const at = (base: Date, days: number, hour: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Snooze choices in the viewer's local time: later today (until 6 pm), tomorrow, the weekend, next week. */
export function snoozePresets(now: Date): SnoozePreset[] {
  const day = now.getDay();
  const presets: SnoozePreset[] = [];
  if (now.getHours() < 18) {
    const later = new Date(now);
    later.setHours(now.getHours() + 3, 0, 0, 0);
    presets.push({ id: "later", label: t("Later today"), at: later });
  }
  presets.push({ id: "tomorrow", label: t("Tomorrow"), at: at(now, 1, 8) });
  // Saturday morning; on a weekend, the next one.
  if (day !== 5) presets.push({ id: "weekend", label: t("This weekend"), at: at(now, (6 - day + 7) % 7 || 7, 8) });
  presets.push({ id: "week", label: t("Next week"), at: at(now, ((8 - day) % 7) || 7, 8) });
  return presets;
}

/** Links in plain text, for rendering them clickable: alternating text and URL pieces. */
export function linkSegments(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], href: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Remote images and backgrounds: what tracking pixels use, so they wait for "Show images". */
export const hasRemoteImages = (html: string) => /<img[^>]+src\s*=\s*["']?\s*(https?:)?\/\/|url\(\s*["']?\s*(https?:)?\/\/|background\s*=\s*["']?\s*(https?:)?\/\//i.test(html);

const QUOTE_SELECTORS = [
  ".gmail_quote",
  ".gmail_extra",
  'blockquote[type="cite"]',
  ".yahoo_quoted",
  ".moz-cite-prefix",
  "#divRplyFwdMsg",
  "#divRplyFwdMsg ~ *",
  "#appendonsend",
  "#appendonsend ~ *",
  'div[name="quote"]',
];

/** Whether the HTML carries a quoted history that mail apps mark (Gmail, Apple Mail, Outlook, Yahoo, Thunderbird). */
export const hasQuotedHtml = (html: string) => /gmail_quote|type=["']?cite|yahoo_quoted|moz-cite-prefix|divRplyFwdMsg|appendonsend|name=["']?quote/i.test(html);

const BASE_CSS =
  "html,body{margin:0;background:#fff;color:#1f1f1f}body{padding:16px;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#0b57d0}";

/**
 * The document for an incoming mail's iframe. The iframe is sandboxed without scripts; the CSP also
 * blocks scripts, forms, frames and, until the viewer allows them, remote images (tracking pixels).
 * Our own files (inline images rewritten to /api/files) always load. Links open in a new tab.
 */
export function mailSrcDoc(html: string, opts: { origin: string; remoteImages: boolean; showQuoted: boolean }) {
  const remote = opts.remoteImages ? " https: http:" : "";
  const csp = [
    "default-src 'none'",
    `img-src data: cid: ${opts.origin}${remote}`,
    `style-src 'unsafe-inline'${remote}`,
    `font-src data:${remote}`,
    "form-action 'none'",
  ].join("; ");
  // <meta http-equiv="refresh"> navigates the sandboxed frame (CSP doesn't cover it), <base>/<link> retarget or load.
  let body = html;
  for (let prev = ""; prev !== body; ) body = (prev = body).replace(/<\/?(meta|base|link)\b[^>]*>?/gi, "");
  const hide = opts.showQuoted ? "" : `${QUOTE_SELECTORS.join(",")}{display:none!important}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${BASE_CSS}${hide}</style></head><body>${body}</body></html>`;
}
