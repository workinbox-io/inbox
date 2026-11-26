/**
 * Threading e-mail: subjects without reply prefixes, Message-ID lists, which earlier thread a mail
 * belongs to, sender names and automated mail. Pure module (no cloudflare:workers).
 */

const SUBJECT_PREFIX = /^\s*(re|fwd?|aw|wg|sv|vs|odp|tr|rv|enc)\s*(\[\d+\])?\s*:\s*/i;

/** Subject without reply/forward prefixes and case, for matching mails of one thread. */
export function normalizeSubject(subject: string | null | undefined) {
  let s = (subject ?? "").trim();
  for (let i = 0; i < 10 && SUBJECT_PREFIX.test(s); i++) s = s.replace(SUBJECT_PREFIX, "");
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** "Re: <subject>" for our reply, without stacking prefixes. */
export function replySubject(subject: string | null | undefined) {
  const s = (subject ?? "").trim();
  if (!s) return "Re: your message";
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/** Message-IDs in a References / In-Reply-To header value ("<a@x> <b@x>"). */
export function parseMessageIds(...headers: (string | null | undefined)[]) {
  const ids: string[] = [];
  for (const h of headers) for (const m of (h ?? "").matchAll(/<[^<>\s]+>/g)) ids.push(m[0]);
  return ids;
}

export interface ThreadCandidate {
  id: string;
  subject: string | null;
  /** Message-IDs of the inbound mails already stored in the conversation. */
  messageIds: string[];
}

/**
 * Which open conversation a new mail belongs to: a conversation holding a message the mail
 * references or replies to wins; otherwise the same (normalized) subject. Candidates come newest first.
 */
export function matchThread(mail: { subject: string; inReplyTo?: string | null; references?: string | null }, candidates: ThreadCandidate[]) {
  const ids = new Set(parseMessageIds(mail.inReplyTo, mail.references));
  if (ids.size) {
    const hit = candidates.find((c) => c.messageIds.some((id) => ids.has(id)));
    if (hit) return hit.id;
  }
  const subject = normalizeSubject(mail.subject);
  if (!subject) return null;
  return candidates.find((c) => c.subject && normalizeSubject(c.subject) === subject)?.id ?? null;
}

/** Display name from a parsed From header; null when it is missing or just the address. */
export function senderName(name: string | null | undefined, email: string) {
  const n = (name ?? "").trim().replace(/^"|"$/g, "");
  return n && n.toLowerCase() !== email.toLowerCase() ? n.slice(0, 100) : null;
}

/** Mail that must never open a conversation: bounces, auto-replies, bulk and list mail. */
export function isAutomatedMail(headers: { get(name: string): string | null }) {
  const auto = headers.get("auto-submitted");
  if (auto && auto.toLowerCase() !== "no") return true;
  const precedence = headers.get("precedence")?.toLowerCase();
  return precedence === "bulk" || precedence === "junk" || precedence === "list";
}
