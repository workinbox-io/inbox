/**
 * Mail SES received for an org's domain (hosted mode): SES stored it in S3, /api/ses/webhook queued `mail.inbound`.
 * Each envelope recipient goes through handleOrgMail like Email Routing's mail; the S3 object is deleted after.
 * Idempotent: handleOrgMail skips a Message-ID the mailbox already has, and a deleted object is a no-op.
 */
import { rawHeaders } from "@/lib/mail/ses-events";
import { handleOrgMail } from "./store";
import { deleteInboundMail, getInboundMail } from "@/lib/server/ses";

export async function receiveSesMail({ bucket, key, from, recipients }: { bucket: string; key: string; from: string; recipients: string[] }) {
  const raw = await getInboundMail(bucket, key);
  if (!raw) return;
  const headers = rawHeaders(raw);
  // SES scanned it (receipt rule with scanning on): infected mail is dropped, spam is flagged for our own filter.
  if (headers.get("x-ses-virus-verdict") === "FAIL") {
    console.warn(`[ses-inbound] dropped ${key}: virus verdict FAIL`);
  } else {
    if (headers.get("x-ses-spam-verdict") === "FAIL") headers.set("x-spam-flag", "YES");
    for (const to of recipients) {
      const stored = await handleOrgMail({
        to,
        from,
        raw: new Blob([raw]).stream(),
        rawSize: raw.byteLength,
        headers,
        // SES already accepted the mail, so there is no one to reject it to.
        setReject: (reason: string) => console.warn(`[ses-inbound] ${to}: ${reason}`),
      });
      if (!stored) console.warn(`[ses-inbound] ${to}: no mailbox, alias or catch-all`);
    }
  }
  await deleteInboundMail(bucket, key);
}
