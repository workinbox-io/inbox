import { env } from "cloudflare:workers";
import PostalMime, { addressParser } from "postal-mime";
import { z } from "zod";
import type { OutboxPayload } from "@/db/schema/outbox";
import { withoutBlindHeaders } from "@/lib/mail/submission";
import { mailBodyText } from "@/lib/mail/text";
import { and, db, desc, eq, inArray, mailOutbox, mailboxes, mailSendLimits, mailSuppressions, mailDeliveryEvents, member, organization } from "@/db";
import { ATTACHMENT_URL_PREFIX, attachmentUrl, safeFilename } from "@/lib/uploads";
import { HttpError } from "@/lib/server/api";
import { getSubscription, requireMailPlan } from "@/lib/server/org";
import { enqueue } from "@/lib/server/queue";
import { sendOrgMail, requireRawProvider } from "./deliver";
import { scheduledTime, quotaDay, uniqueRecipients, validateIdempotencyKey, quotaArgs, quotaPredicates, deliverySummary, sendingCaps, reputationPause, REPUTATION_DAYS, NO_CAPS } from "@/lib/mail/outbox-policy";
import { viewerMailboxes, resolveApiKeyMailboxes, type Mailbox } from "./access";
import { prepareMailSend, persistOutboxMail, type SendInput } from "./store";
import { reserveStorage, releaseStorageReservation, storeHtml } from "./storage";

export interface SendOptions { idempotencyKey?: string; actorUserId?: string; apiKeyId?: string }
type Outbox = typeof mailOutbox.$inferSelect;
const visible = (job: Outbox) => ({ id: job.id, outboxId: job.id, mailboxId: job.mailboxId, mailbox: job.payload.email.fromEmail, sendAt: job.sendAt.getTime(), status: job.status, threadId: job.threadId ?? job.payload.threadId, subject: job.payload.email.subject, to: job.payload.email.to, cc: job.payload.email.cc ?? [], error: job.error, deliveryStatus: job.deliveryStatus, createdAt: job.createdAt.toISOString() });
const fingerprint = async (input: unknown) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input))))].map(x => x.toString(16).padStart(2, "0")).join("");
async function find(id: string, boxes: Mailbox[]) {
  if (!boxes.length) throw new HttpError(404, "Not found");
  const [job] = await db.select().from(mailOutbox).where(and(eq(mailOutbox.id, id), inArray(mailOutbox.mailboxId, boxes.map(x => x.id))));
  if (!job) throw new HttpError(404, "Not found");
  return job;
}
export async function getOutboxJob(id: string, boxes: Mailbox[]) { return visible(await find(id, boxes)); }
export async function listOutboxJobs(boxes: Mailbox[]) {
  if (!boxes.length) return [];
  return (await db.select().from(mailOutbox).where(inArray(mailOutbox.mailboxId, boxes.map(x => x.id))).orderBy(desc(mailOutbox.createdAt)).limit(200)).map(visible);
}
async function suppressed(orgId: string, recipients: string[]) {
  const rows = await db.select().from(mailSuppressions).where(and(eq(mailSuppressions.orgId, orgId), inArray(mailSuppressions.recipient, recipients)));
  if (rows.length) throw new HttpError(422, "A recipient is blocked after a permanent bounce or spam complaint");
}

async function discardQueuedObjects(job: { payload: typeof mailOutbox.$inferSelect.payload }) {
  const keys = [...job.payload.files.map(f => f.url.slice(ATTACHMENT_URL_PREFIX.length)), ...(job.payload.htmlKey ? [job.payload.htmlKey] : []), ...(job.payload.rawKey ? [job.payload.rawKey] : [])];
  // Only keys owned by this queued copy: never delete caller uploads or an original message's files.
  const owned = keys.filter(key => key.includes("/mail-outbox-") || key.startsWith("mail-html/"));
  if (owned.length) await env.FILES.delete(owned);
}
async function copyQueuedFiles(payload: typeof mailOutbox.$inferSelect.payload, orgId: string, messageId: string) {
  const originalFiles = [...payload.files];
  payload.files = [];
  for (let index = 0; index < originalFiles.length; index++) {
    const file = originalFiles[index];
    const object = await env.FILES.get(file.url.slice(ATTACHMENT_URL_PREFIX.length));
    if (!object) throw new HttpError(422, "An attachment is no longer available");
    const key = `attachments/${orgId}/mail-outbox-${messageId}/${index}-${safeFilename(file.filename)}`;
    // Record intent before the put so cleanup also covers a successful write whose response was lost.
    const copied = { ...file, url: attachmentUrl(key), size: object.size };
    payload.files.push(copied);
    await env.FILES.put(key, object.body, { httpMetadata: object.httpMetadata });
    payload.email.html = payload.email.html.replaceAll(file.url, copied.url);
  }
  payload.email.files = payload.files.map(({ url, filename, mediaType }) => ({ url, filename, mediaType }));
}

/** Platform caps on the org's daily recipients (lib/mail/outbox-policy.ts `sendingCaps`). */
export async function orgSendingCaps(orgId: string) {
  if (env.DEPLOY_MODE === "self") return NO_CAPS;
  const [[org], sub] = await Promise.all([db.select({ createdAt: organization.createdAt }).from(organization).where(eq(organization.id, orgId)), getSubscription(orgId)]);
  const paid = sub?.status === "active" || sub?.status === "past_due";
  return sendingCaps({ hosted: true, orgCreatedAt: org?.createdAt.getTime() ?? 0, paid });
}

/** Bounces, complaints and sent recipients of the last REPUTATION_DAYS, and whether sending is paused for them. */
export async function orgReputation(orgId: string) {
  const since = Date.now() - REPUTATION_DAYS * 86_400_000;
  const row = await env.DB.prepare(`SELECT
      (SELECT COALESCE(SUM(recipient_count),0) FROM mail_outbox WHERE org_id=?1 AND status='sent' AND send_at>=?2) AS sent,
      (SELECT COUNT(DISTINCT outbox_id||recipient) FROM mail_delivery_events WHERE org_id=?1 AND type='bounced' AND occurred_at>=?2) AS bounced,
      (SELECT COUNT(DISTINCT outbox_id||recipient) FROM mail_delivery_events WHERE org_id=?1 AND type='complained' AND occurred_at>=?2) AS complained`).bind(orgId, since).first<{ sent: number; bounced: number; complained: number }>();
  const stats = row ?? { sent: 0, bounced: 0, complained: 0 };
  return { ...stats, paused: env.DEPLOY_MODE === "self" ? null : reputationPause(stats) };
}

export async function queueMailSend(input: SendInput, boxes: Mailbox[], fallbackName: string, options: SendOptions = {}) {
  const { mailbox, payload } = await prepareMailSend(input, boxes, fallbackName);
  return queuePrepared(input, boxes, mailbox, payload, options);
}

/** SMTP enters the same durable queue and policy as web/API sends; the original MIME stays intact. */
export async function queueRawSend(mailbox: Mailbox, raw: Uint8Array<ArrayBuffer>, envelope: string[], actorUserId: string) {
  if (!raw.length || raw.length > 10 * 1024 * 1024) throw new HttpError(413, "SMTP messages must be at most 10 MB");
  const recipients = [...new Set(z.array(z.email().max(320)).min(1).max(40).parse(envelope).map(address => address.toLowerCase()))].sort();
  try { withoutBlindHeaders(raw); } catch { throw new HttpError(422, "Invalid MIME headers"); }
  const parsed = await PostalMime.parse(raw);
  if(parsed.attachments.length>100)throw new HttpError(422,"At most 100 MIME attachments per message");
  const from = parsed.headers.filter(header => header.key === "from");
  const senders = from.length===1?addressParser(from[0].value):[];
  if (senders.length!==1 || !("address" in senders[0]) || senders[0].address?.toLowerCase()!==mailbox.address.toLowerCase() || parsed.from?.address?.toLowerCase() !== mailbox.address.toLowerCase()) throw new HttpError(403, "Use this mailbox as the sender");
  if (!parsed.messageId || !/^<[^<>\s]+@[^<>\s]+>$/.test(parsed.messageId) || parsed.messageId.length > 998) throw new HttpError(422, "A valid Message-ID is required");
  await requireRawProvider(mailbox.address);
  const rawDigest = Buffer.from(await crypto.subtle.digest("SHA-256", raw)).toString("hex");
  const key = `smtp:${await fingerprint([mailbox.id, actorUserId, parsed.messageId, recipients])}`;
  const addresses = (values: typeof parsed.to) => (values ?? []).flatMap(value => "address" in value ? [value.address ?? ""] : value.group.map(address => address.address ?? "")).filter(Boolean);
  const payload: OutboxPayload = {rfcMessageId:parsed.messageId,envelopeRecipients:recipients,email:{fromEmail:mailbox.address,fromName:parsed.from.name,to:addresses(parsed.to).join(", "),cc:addresses(parsed.cc),subject:parsed.subject?.slice(0,300)||"(no subject)",text:mailBodyText(parsed).slice(0,100_000),html:parsed.html??"",headers:{...(parsed.inReplyTo?{"In-Reply-To":parsed.inReplyTo}:{}),...(parsed.references?{References:parsed.references}:{})}},files:[]};
  const input: SendInput = {mailbox:mailbox.address,to:recipients[0],subject:payload.email.subject,text:rawDigest,signature:false};
  return queuePrepared(input,[mailbox],mailbox,payload,{actorUserId,idempotencyKey:key},{raw,attachments:parsed.attachments});
}

async function queuePrepared(input: SendInput, boxes: Mailbox[], mailbox: Mailbox, payload: OutboxPayload, options: SendOptions, native?: {raw: Uint8Array<ArrayBuffer>; attachments: Awaited<ReturnType<typeof PostalMime.parse>>["attachments"]}) {
  // Hosted: sending is free for up to FREE_PEOPLE people, a team needs a trial or a plan; forwarding rules keep running so incoming
  // mail still reaches people.
  if (!input.automatedForward) await requireMailPlan(mailbox.orgId);
  const { paused } = await orgReputation(mailbox.orgId);
  if (paused) throw new HttpError(403, `Sending is paused: too many ${paused === "bounces" ? "bounced messages" : "spam complaints"} in the last ${REPUTATION_DAYS} days. It resumes on its own as they age out; check the addresses you write to or contact support.`);
  const caps = await orgSendingCaps(mailbox.orgId);
  if (!options.actorUserId && !options.apiKeyId && !input.automatedForward) options.actorUserId = mailbox.userId ?? undefined;
  if (!options.actorUserId && !options.apiKeyId && !input.automatedForward && !input.autoReply) throw new HttpError(403, "A sending identity is required");
  let sendAt: number, key: string;
  try { sendAt = scheduledTime(input.sendAt); key = validateIdempotencyKey(options.idempotencyKey ?? input.idempotencyKey); } catch (e) { throw new HttpError(422, (e as Error).message); }
  const digest = await fingerprint({ input, mailbox: mailbox.id, actor: options.actorUserId, key: options.apiKeyId });
  const [previous] = await db.select().from(mailOutbox).where(and(eq(mailOutbox.orgId, mailbox.orgId), eq(mailOutbox.idempotencyKey, key)));
  if (previous) {
    if (previous.fingerprint !== digest || !boxes.some(b => b.id === previous.mailboxId)) throw new HttpError(409, "Idempotency key already used for another request");
    return visible(previous);
  }
  const recipients = payload.envelopeRecipients ?? uniqueRecipients(payload.email.to, payload.email.cc);
  await suppressed(mailbox.orgId, recipients);
  const id = crypto.randomUUID(), messageId = crypto.randomUUID(), threadId = payload.threadId ?? crypto.randomUUID();
  const storageBytes = new TextEncoder().encode(payload.email.text).byteLength + new TextEncoder().encode(payload.email.html).byteLength + (native ? native.raw.byteLength + native.attachments.reduce((size,file)=>size+(typeof file.content==='string'?new TextEncoder().encode(file.content).length:file.content.byteLength),0) : payload.files.reduce((n, f) => n + f.size, 0));
  await reserveStorage(mailbox.id, storageBytes, messageId);
  try {
    if (native) {
      payload.rawKey = `mail-raw/${mailbox.orgId}/${mailbox.id}/mail-outbox-${messageId}.eml`;
      await env.FILES.put(payload.rawKey,native.raw,{httpMetadata:{contentType:"message/rfc822"}});
      for (const [index,file] of native.attachments.entries()) {
        const key = `attachments/${mailbox.orgId}/mail-outbox-${messageId}/${index}-${safeFilename(file.filename??"attachment")}`;
        const content = typeof file.content==='string'?new TextEncoder().encode(file.content):file.content;
        const stored = {url:attachmentUrl(key),filename:(file.filename??"attachment").slice(0,200),mediaType:file.mimeType.slice(0,200),size:content.byteLength};
        payload.files.push(stored);
        await env.FILES.put(key,content,{httpMetadata:{contentType:file.mimeType}});
        if(file.contentId)payload.email.html=payload.email.html.replaceAll(`cid:${file.contentId.replace(/^<|>$/g,"")}`,stored.url);
      }
      payload.email.files=payload.files;
    } else await copyQueuedFiles(payload, mailbox.orgId, messageId);
    const stored = await storeHtml(mailbox.orgId, mailbox.id, messageId, payload.email.html);
    if (stored.htmlKey) { payload.htmlKey = stored.htmlKey; payload.email.html = ""; }
  } catch (e) { await releaseStorageReservation(messageId); await discardQueuedObjects({ payload }); throw e; }
  const now = Date.now(), day = quotaDay(sendAt);
  try {
    const inserted = await env.DB.prepare(`INSERT INTO mail_outbox (id,org_id,mailbox_id,actor_user_id,api_key_id,idempotency_key,fingerprint,payload,status,send_at,quota_day,recipient_count,thread_id,message_id,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,? WHERE ${quotaPredicates} ON CONFLICT(org_id,idempotency_key) DO NOTHING RETURNING id`).bind(id, mailbox.orgId, mailbox.id, options.actorUserId ?? null, options.apiKeyId ?? null, key, digest, JSON.stringify(payload), sendAt, day, recipients.length, threadId, messageId, now, now, ...quotaArgs(mailbox.orgId, mailbox.id, day, id, recipients.length, caps)).first<{ id: string }>();
    if (!inserted) {
      await releaseStorageReservation(messageId);
      await discardQueuedObjects({ payload });
      const [duplicate] = await db.select().from(mailOutbox).where(and(eq(mailOutbox.orgId, mailbox.orgId), eq(mailOutbox.idempotencyKey, key)));
      if (duplicate && duplicate.fingerprint === digest) return visible(duplicate);
      if (duplicate) throw new HttpError(409, "Idempotency key already used for another request");
      throw new HttpError(429, caps.newUntil ? `Daily sending limit reached. New organizations send to up to ${caps.organization} recipients a day for their first two weeks, or more on a paid plan.` : "Daily sending limit reached");
    }
  } catch (e) { await releaseStorageReservation(messageId); await discardQueuedObjects({ payload }); throw e; }
  // A failed enqueue does not lose accepted mail: the minute cron scans this durable table.
  if (sendAt - now <= 86_400_000) await enqueue("mail.send", { id }, { delaySeconds: Math.ceil((sendAt - now) / 1000) }).catch(e => console.error("[outbox] enqueue deferred to cron", id, e));
  return getOutboxJob(id, boxes);
}

export async function cancelOutboxJob(id: string, boxes: Mailbox[]) {
  const job = await find(id, boxes);
  const [cancelled] = await db.update(mailOutbox).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(mailOutbox.id, job.id), eq(mailOutbox.status, "pending"))).returning();
  if (!cancelled) throw new HttpError(409, "Sending has already started; this message cannot be cancelled");
  if (job.messageId) await releaseStorageReservation(job.messageId);
  await discardQueuedObjects(job);
  return { ...visible(cancelled), draft: { to: job.payload.email.to, cc: job.payload.email.cc ?? [], subject: job.payload.email.subject, text: job.payload.email.text, mailbox: job.payload.email.fromEmail, files: job.payload.files } };
}
export async function rescheduleOutboxJob(id: string, requested: number, boxes: Mailbox[]) {
  const job = await find(id, boxes);
  let sendAt: number;
  try { sendAt = scheduledTime(requested); } catch (e) { throw new HttpError(422, (e as Error).message); }
  const day = quotaDay(sendAt);
  const updated = await env.DB.prepare(`UPDATE mail_outbox SET send_at=?,quota_day=?,updated_at=? WHERE id=? AND status='pending' AND ${quotaPredicates} RETURNING id`).bind(sendAt, day, Date.now(), job.id, ...quotaArgs(job.orgId, job.mailboxId, day, job.id, job.recipientCount, await orgSendingCaps(job.orgId))).first();
  if (!updated) throw new HttpError(409, "Message is no longer pending or the target day's sending limit is reached");
  await enqueue("mail.send", { id }, { delaySeconds: Math.min(86400, Math.ceil((sendAt - Date.now()) / 1000)) }).catch(() => {});
  return getOutboxJob(id, boxes);
}
async function authorized(job: Outbox) {
  if (job.apiKeyId) return (await resolveApiKeyMailboxes(job.orgId, job.apiKeyId)).some(b => b.id === job.mailboxId);
  if (!job.actorUserId) return job.payload.email.headers?.["X-WorkInbox-Forwarded"] === "1";
  const { mustChangePassword } = await import("./account-security");
  if (await mustChangePassword(job.actorUserId)) return false;
  const [m] = await db.select().from(member).where(and(eq(member.organizationId, job.orgId), eq(member.userId, job.actorUserId)));
  if (!m) return false;
  return (await viewerMailboxes({ orgId: job.orgId, userId: job.actorUserId, role: m.role as "owner" | "admin" | "member" })).some(b => b.id === job.mailboxId);
}
export async function deliverOutboxJob(id: string) {
  const [job] = await db.select().from(mailOutbox).where(eq(mailOutbox.id, id));
  if (!job || job.status === "cancelled" || job.status === "failed" || job.status === "sent" || job.status === "uncertain") return;
  if (job.status === "sending" || job.sendAt.getTime() > Date.now()) return;
  const [box] = await db.select().from(mailboxes).where(and(eq(mailboxes.id, job.mailboxId), eq(mailboxes.orgId, job.orgId)));
  let raw: Uint8Array<ArrayBuffer> | undefined;
  try {
    if (job.payload.rawKey) {
      const object = await env.FILES.get(job.payload.rawKey);
      if (!object) throw new HttpError(503,"Queued original message is unavailable");
      raw = new Uint8Array(await object.arrayBuffer());
      await requireRawProvider(job.payload.email.fromEmail!);
    }
    if (job.payload.htmlKey) {
      const body = await env.FILES.get(job.payload.htmlKey);
      if (!body) throw new HttpError(503, "Queued message body is unavailable");
      job.payload.email.html = await body.text();
    }
    if (!box || !(await authorized(job))) throw new HttpError(403, "Sender no longer has access to this mailbox");
    await suppressed(job.orgId, job.payload.envelopeRecipients ?? uniqueRecipients(job.payload.email.to, job.payload.email.cc));
    const { checkAttachments } = await import("@/lib/server/uploads");
    await checkAttachments(job.orgId, job.payload.email.files);
    let attachedBytes = 0;
    for (const file of job.payload.files) {
      const object = await env.FILES.head(file.url.slice(ATTACHMENT_URL_PREFIX.length));
      if (!object) throw new HttpError(422, "A queued attachment is no longer available");
      attachedBytes += object.size;
    }
    if (attachedBytes > 18 * 1024 * 1024) throw new HttpError(413, "Attachments exceed the sending limit");
    if (job.payload.threadId) {
      const thread = await env.DB.prepare("SELECT id FROM mail_threads WHERE id=? AND mailbox_id=?").bind(job.payload.threadId, job.mailboxId).first();
      if (!thread) throw new HttpError(409, "The reply's thread no longer exists");
    }
  } catch (e) {
    const [failed] = await db.update(mailOutbox).set({ status: "failed", error: (e as Error).message, updatedAt: new Date() }).where(and(eq(mailOutbox.id, id), eq(mailOutbox.status, "pending"))).returning();
    if (failed?.messageId) await releaseStorageReservation(failed.messageId);
    if (failed) await discardQueuedObjects(failed);
    return;
  }
  const day = quotaDay(Date.now());
  const claimed = await env.DB.prepare(`UPDATE mail_outbox SET status='sending',quota_day=?,updated_at=? WHERE id=? AND status='pending' AND send_at<=? AND ${quotaPredicates} RETURNING id`).bind(day, Date.now(), id, Date.now(), ...quotaArgs(job.orgId, job.mailboxId, day, id, job.recipientCount, await orgSendingCaps(job.orgId))).first();
  if (!claimed) return; // A cancellation, another consumer or today's quota won the race.
  // Crossing the provider call is a one-way boundary: an exception may mean it accepted the mail.
  try {
    const providerId = await sendOrgMail(job.payload.email, raw, job.payload.envelopeRecipients);
    await db.update(mailOutbox).set({ providerId, updatedAt: new Date() }).where(eq(mailOutbox.id, id));
    const persisted = await persistOutboxMail(box!, job.payload, providerId, job.messageId!, job.threadId!);
    await db.update(mailOutbox).set({ threadId:persisted.threadId,status: "sent", error: null, updatedAt: new Date() }).where(eq(mailOutbox.id, id));
    // Publish the Sent receipt before discarding a redundant queued copy; cron retries interrupted cleanup.
    if (persisted.message.id !== job.messageId) await discardQueuedObjects(job).then(()=>releaseStorageReservation(job.messageId!)).catch(error=>console.error('[outbox] duplicate cleanup deferred',id,error));
  } catch (e) {
    await db.update(mailOutbox).set({ status: "uncertain", error: "Delivery outcome uncertain; not automatically retried to avoid duplicates", updatedAt: new Date() }).where(eq(mailOutbox.id, id));
    console.error("[outbox] ambiguous provider/persistence outcome", id, e);
  }
}
export async function recoverOutbox() {
  // Clean up interrupted cancellations and pre-insert reservations. One hour exceeds request lifetimes.
  const abandoned = await env.DB.prepare(`SELECT r.id, r.mailbox_id, b.org_id FROM mail_storage_reservations r
    JOIN mailboxes b ON b.id=r.mailbox_id LEFT JOIN mail_messages m ON m.id=r.id LEFT JOIN mail_outbox o ON o.message_id=r.id
    WHERE m.id IS NULL AND r.created_at<? AND (o.id IS NULL OR o.status IN ('cancelled','failed','sent')) LIMIT 100`).bind(Date.now() - 60 * 60_000).all<{ id: string; mailbox_id: string; org_id: string }>();
  for (const reservation of abandoned.results) {
    let cursor: string | undefined;
    do {
      const listed = await env.FILES.list({ prefix: `attachments/${reservation.org_id}/mail-outbox-${reservation.id}/`, cursor });
      if (listed.objects.length) await env.FILES.delete(listed.objects.map(object => object.key));
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    await env.FILES.delete(`mail-html/${reservation.org_id}/${reservation.mailbox_id}/${reservation.id}.html`);
    await env.FILES.delete(`mail-raw/${reservation.org_id}/${reservation.mailbox_id}/mail-outbox-${reservation.id}.eml`);
    await releaseStorageReservation(reservation.id);
  }
  // A worker that died across the provider call must never blindly resend.
  await env.DB.prepare("UPDATE mail_outbox SET status='uncertain',error='Worker interrupted during send; verify delivery before retrying',updated_at=? WHERE status='sending' AND updated_at<?").bind(Date.now(), Date.now() - 10 * 60_000).run();
  const jobs = await env.DB.prepare("SELECT id FROM mail_outbox WHERE status='pending' AND send_at<=? ORDER BY send_at LIMIT 100").bind(Date.now()).all<{ id: string }>();
  for (const job of jobs.results) await enqueue("mail.send", { id: job.id });
  // Reconcile provider acceptance persisted before a crash without invoking the provider again.
  const accepted = await db.select().from(mailOutbox).where(eq(mailOutbox.status, "uncertain")).limit(100);
  for (const job of accepted) if (job.providerId) {
    const [box] = await db.select().from(mailboxes).where(eq(mailboxes.id, job.mailboxId));
    if (box) {
      if (job.payload.htmlKey) {
        const body = await env.FILES.get(job.payload.htmlKey);
        if (!body) continue;
        job.payload.email.html = await body.text();
      }
      const persisted = await persistOutboxMail(box, job.payload, job.providerId, job.messageId!, job.threadId!);
      await db.update(mailOutbox).set({ threadId:persisted.threadId,status: "sent", error: null, updatedAt: new Date() }).where(eq(mailOutbox.id, job.id));
      if (persisted.message.id !== job.messageId) await discardQueuedObjects(job).then(()=>releaseStorageReservation(job.messageId!)).catch(error=>console.error('[outbox] duplicate cleanup deferred',job.id,error));
    }
  }
}

export async function getSendingLimits(orgId: string) { return db.select().from(mailSendLimits).where(eq(mailSendLimits.orgId, orgId)); }
export async function setSendingLimit(orgId: string, mailboxId: string | null, dailyRecipients: number) {
  if (!Number.isSafeInteger(dailyRecipients) || dailyRecipients < 0 || dailyRecipients > 1_000_000) throw new HttpError(422, "Invalid daily recipient limit");
  if (mailboxId) {
    const [box] = await db.select().from(mailboxes).where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.orgId, orgId)));
    if (!box) throw new HttpError(404, "Not found");
  }
  await db.insert(mailSendLimits).values({ orgId, scopeId: mailboxId ?? orgId, dailyRecipients }).onConflictDoUpdate({ target: mailSendLimits.scopeId, set: { dailyRecipients } });
}

/** Only consume from the dedicated Cloudflare Email Service event queue, never from HTTP input. */
export async function handleDeliveryEvent(event: unknown) {
  if (!event || typeof event !== "object") throw new Error("Invalid email delivery event");
  const e = event as { type?: string; source?: { domain?: string }; payload?: { eventId?: string; messageId?: string; sender?: string; recipient?: string; bounce?: { type?: string } }; metadata?: { eventTimestamp?: string } };
  if (!e.type?.startsWith("cf.email.sending.message.") || !e.payload?.eventId || !e.payload.messageId || !e.payload.recipient || !e.payload.sender || !e.source?.domain) throw new Error("Invalid email delivery event");
  const type = e.type.slice("cf.email.sending.message.".length);
  if (!["delivered", "deferred", "bounced", "failed", "rejected", "complained"].includes(type)) return;
  const [job] = await db.select().from(mailOutbox).where(eq(mailOutbox.providerId, e.payload.messageId));
  if (!job) {
    // The sending domain can also emit system mail outside the product outbox.
    const [senderMailbox] = await db.select({ id: mailboxes.id }).from(mailboxes).where(eq(mailboxes.address, e.payload.sender.toLowerCase()));
    if (!senderMailbox) return;
    throw new Error("Delivery event has no correlated outbox message yet");
  }
  const recipient = e.payload.recipient.toLowerCase();
  if (!uniqueRecipients(job.payload.email.to, job.payload.email.cc).includes(recipient) || e.payload.sender.toLowerCase() !== job.payload.email.fromEmail?.toLowerCase() || e.source.domain.toLowerCase() !== e.payload.sender.split("@")[1].toLowerCase()) throw new Error("Delivery event identity mismatch");
  const occurredAt = new Date(e.metadata?.eventTimestamp ?? Date.now());
  if (!Number.isFinite(occurredAt.getTime())) throw new Error("Invalid delivery event time");
  const suppress = type === "complained" || (type === "bounced" && e.payload.bounce?.type === "hard");
  await db.batch([
    db.insert(mailDeliveryEvents).values({ id: e.payload.eventId, orgId: job.orgId, outboxId: job.id, recipient, type, occurredAt }).onConflictDoNothing(),
    ...(suppress ? [db.insert(mailSuppressions).values({ orgId: job.orgId, recipient, reason: type }).onConflictDoNothing()] : []),
  ]);
  // Aggregate per-recipient receipts: a late delivered receipt cannot erase a complaint or bounce.
  const events = await db.select().from(mailDeliveryEvents).where(eq(mailDeliveryEvents.outboxId, job.id));
  const status = deliverySummary(events) ?? type;
  await db.update(mailOutbox).set({ deliveryStatus: status, updatedAt: new Date() }).where(eq(mailOutbox.id, job.id));
}
