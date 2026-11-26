/**
 * Mail SES received for an org's domain (hosted mode): SES stored it in S3, /api/ses/webhook queued `mail.inbound`.
 * Each envelope recipient goes through handleOrgMail like Email Routing's mail; the S3 object is deleted after.
 * Idempotent: handleOrgMail skips a Message-ID the mailbox already has, and a deleted object is a no-op.
 *
 * SES already said 250 to the sender, so a mail we can't take (unknown address, full mailbox, too large) gets a bounce
 * from mailer-daemon@<domain> instead of vanishing. A mail whose notification never arrived or whose job died in the
 * DLQ stays in S3: `sweepInboundMail` (hourly cron) queues it again before the bucket's 14-day expiry.
 */
import { db, inArray, mailDomains } from "@/db";
import { bounceable, rawHeaders, recoveredEnvelope } from "@/lib/mail/ses-events";
import { reportError } from "@/lib/server/errors";
import { enqueue } from "@/lib/server/queue";
import { deleteInboundMail, getInboundMail, inboundBucket, listInboundMail, sesConfigured } from "@/lib/server/ses";
import { sendOrgMail } from "./deliver";
import { handleOrgMail } from "./store";

const log = (event: string, data: Record<string, unknown>) => console.log(`[ses-inbound] ${event}`, JSON.stringify(data));

export async function receiveSesMail(job: { bucket: string; key: string; from: string; recipients: string[]; recover?: boolean }) {
  const { bucket, key, recover } = job;
  // The bucket comes from the SNS payload: never read or delete outside our own.
  if (bucket !== inboundBucket()) return log("ignored: foreign bucket", { bucket, key });
  const raw = await getInboundMail(bucket, key);
  if (!raw) return log("already handled", { key });
  const headers = rawHeaders(raw);
  const { from, recipients } = recover ? recoveredEnvelope(headers) : job;
  log("received", { key, from, recipients, size: raw.byteLength, recover: !!recover });
  const failed: { to: string; reason: string }[] = [];
  // SES scanned it (receipt rule with scanning on): infected mail is dropped, spam is flagged for our own filter.
  if (headers.get("x-ses-virus-verdict") === "FAIL") {
    log("dropped: virus", { key, from, recipients });
  } else {
    if (headers.get("x-ses-spam-verdict") === "FAIL") headers.set("x-spam-flag", "YES");
    for (const to of recipients) {
      const rejected: string[] = [];
      const stored = await handleOrgMail({
        to,
        from,
        raw: new Blob([raw]).stream(),
        rawSize: raw.byteLength,
        headers,
        // SES already accepted the mail: the reason goes into a bounce instead.
        setReject: (reason: string) => void rejected.push(reason),
      });
      if (rejected.length) failed.push({ to, reason: rejected[0]! });
      // A recovered envelope also lists To/Cc addresses outside our domains: those aren't ours to bounce.
      else if (!stored && !recover) failed.push({ to, reason: "Address not found" });
      else if (!stored) log("not ours", { key, to });
    }
  }
  await deleteInboundMail(bucket, key);
  if (failed.length) await bounce(key, from, headers, failed);
}

async function bounce(key: string, from: string, headers: Headers, failed: { to: string; reason: string }[]) {
  if (!bounceable(from, headers)) return log("not delivered, no bounce (sender unverified or automated)", { key, from, failed });
  const domains = [...new Set(failed.map((f) => f.to.split("@")[1]!.toLowerCase()))];
  const own = await db.select({ domain: mailDomains.domain, provider: mailDomains.provider }).from(mailDomains).where(inArray(mailDomains.domain, domains));
  const domain = own.find((d) => d.provider === "ses")?.domain;
  if (!domain) return log("not delivered, no bounce (no SES domain to send from)", { key, from, failed });
  const subject = headers.get("subject") ?? "";
  const messageId = headers.get("message-id");
  const text = [
    `This is the mail system at ${domain}.`,
    "",
    `Your message${subject ? ` "${subject}"` : ""} could not be delivered to:`,
    "",
    ...failed.map((f) => `  ${f.to}: ${f.reason}`),
    "",
    "It was not stored. Please check the address, or try again later if the mailbox was full.",
  ].join("\n");
  try {
    await sendOrgMail({
      to: from,
      fromEmail: `mailer-daemon@${domain}`,
      fromName: "Mail Delivery System",
      subject: "Undelivered Mail Returned to Sender",
      text,
      html: `<pre style="font-family:monospace;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
      headers: { "Auto-Submitted": "auto-replied", ...(messageId ? { "In-Reply-To": messageId, References: messageId } : {}) },
    });
    log("bounced", { key, from, failed });
  } catch (e) {
    // The mail itself is already handled; a lost bounce must not re-run it.
    await reportError("queue", e, { where: "ses bounce", key, from, failed });
  }
}

/** Older than mail.inbound's whole retry schedule (30 s … 1 h, max_retries 5: about 1 h 40 min). */
const STALE_MS = 3 * 3600_000;
const ALERT_MS = 24 * 3600_000;
const MAX_PER_RUN = 500;

/** Hourly: queues mail SES stored but nobody handled (lost SNS notification, webhook down, job in the DLQ). */
export async function sweepInboundMail() {
  if (!sesConfigured()) return;
  const bucket = inboundBucket();
  const now = Date.now();
  let next: string | undefined;
  const stale: { key: string; age: number }[] = [];
  do {
    const page = await listInboundMail(bucket, next);
    for (const o of page.objects) if (now - o.lastModified > STALE_MS) stale.push({ key: o.key, age: now - o.lastModified });
    next = page.next;
  } while (next && stale.length < MAX_PER_RUN);
  if (!stale.length) return;
  for (const { key } of stale.slice(0, MAX_PER_RUN)) await enqueue("mail.inbound", { bucket, key, from: "", recipients: [], recover: true });
  const old = stale.filter((s) => s.age > ALERT_MS);
  console.warn(`[ses-inbound] sweep re-queued ${Math.min(stale.length, MAX_PER_RUN)} stuck mails`, JSON.stringify(stale.slice(0, 20).map((s) => s.key)));
  // Still there a day later: re-queueing doesn't help, someone has to look before the bucket expires them (14 days).
  if (old.length) await reportError("cron", new Error(`${old.length} inbound mails stuck in S3 for over a day`), { keys: old.slice(0, 20).map((s) => s.key) });
}
