/** Shared, pure scheduling and recipient policy. */
export const UNDO_SEND_MS = 10_000;
export const MAILBOX_DAILY_RECIPIENTS = 500;
export const ORG_DAILY_RECIPIENTS = 5000;
export const quotaDay = (at: number) => new Date(at).toISOString().slice(0, 10);
export const uniqueRecipients = (to: string, cc: string[] = []) => [...new Set([to, ...cc].map(x => x.trim().toLowerCase()))];
export function scheduledTime(requested: number | undefined, now = Date.now()) {
  if (requested !== undefined && (!Number.isSafeInteger(requested) || requested <= now || requested > now + 366 * 86_400_000)) throw new Error("Choose a future date within one year");
  return Math.max(requested ?? 0, now + UNDO_SEND_MS);
}
export function validateIdempotencyKey(key: string | undefined) {
  if (key !== undefined && (!key.trim() || key.length > 200)) throw new Error("Invalid idempotency key");
  return key ?? crypto.randomUUID();
}

// These predicates execute inside the write, so concurrent reservations cannot overspend a quota.
// Each limit is the org's own setting (or the default), never above the platform cap (`sendingCaps`).
export const quotaPredicates = `
 COALESCE((SELECT SUM(recipient_count) FROM mail_outbox WHERE org_id=? AND mailbox_id=? AND quota_day=? AND status NOT IN ('cancelled','failed') AND id!=?),0)+? <= MIN(COALESCE((SELECT daily_recipients FROM mail_send_limits WHERE org_id=? AND scope_id=?),${MAILBOX_DAILY_RECIPIENTS}),?)
 AND COALESCE((SELECT SUM(recipient_count) FROM mail_outbox WHERE org_id=? AND quota_day=? AND status NOT IN ('cancelled','failed') AND id!=?),0)+? <= MIN(COALESCE((SELECT daily_recipients FROM mail_send_limits WHERE org_id=? AND scope_id=?),${ORG_DAILY_RECIPIENTS}),?)`;
export const quotaArgs = (orgId: string, mailboxId: string, day: string, id: string, n: number, caps: SendingCaps = NO_CAPS) =>
  [orgId, mailboxId, day, id, n, orgId, mailboxId, caps.mailbox, orgId, day, id, n, orgId, orgId, caps.organization];

/** Platform caps over the org's own limits. Hosted only: self-hosters send from their own account. */
export interface SendingCaps { mailbox: number; organization: number; newUntil: number | null }
export const NO_CAPS: SendingCaps = { mailbox: 1_000_000, organization: 1_000_000, newUntil: null };
/** A new hosted org without a paid plan sends little until it has a history (or pays). */
export const NEW_ORG_DAYS = 14;
export const NEW_ORG_CAPS = { mailbox: 50, organization: 200 };
/** No hosted org goes above these, whatever it sets (SES account quota and reputation). */
export const HOSTED_CAPS = { mailbox: 2_000, organization: 20_000 };
export function sendingCaps(o: { hosted: boolean; orgCreatedAt: number; paid: boolean }, now = Date.now()): SendingCaps {
  if (!o.hosted) return NO_CAPS;
  const newUntil = o.orgCreatedAt + NEW_ORG_DAYS * 86_400_000;
  if (!o.paid && now < newUntil) return { ...NEW_ORG_CAPS, newUntil };
  return { ...HOSTED_CAPS, newUntil: null };
}

/** Sending stops on its own while the last 7 days look like spam (SES reviews accounts at 5% bounces and 0.1%
 *  complaints); it resumes once the bounces and complaints age out of the window. */
export const REPUTATION_DAYS = 7;
export function reputationPause(r: { sent: number; bounced: number; complained: number }): "bounces" | "complaints" | null {
  if (r.complained >= 3 && r.complained >= r.sent * 0.003) return "complaints";
  if (r.bounced >= 10 && r.bounced >= r.sent * 0.05) return "bounces";
  return null;
}


export function deliverySummary(events: { recipient: string; type: string; occurredAt: Date }[]) {
  const priority = ["complained", "bounced", "failed", "rejected", "deferred", "delivered"];
  const latest = new Map<string, typeof events[number]>();
  for (const event of events) {
    const previous = latest.get(event.recipient);
    if (!previous || previous.occurredAt < event.occurredAt || (previous.occurredAt.getTime() === event.occurredAt.getTime() && priority.indexOf(event.type) < priority.indexOf(previous.type))) latest.set(event.recipient, event);
  }
  if (events.some(event => event.type === "complained")) return "complained";
  if (events.some(event => event.type === "bounced")) return "bounced";
  return priority.find(type => [...latest.values()].some(event => event.type === type)) ?? null;
}
