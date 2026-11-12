/**
 * The provider an org's outgoing mail goes through: Amazon SES for a domain set up on SES (hosted mode, the org's
 * own domain), Cloudflare Email Service (sendNow) for everything else and in `astro dev`.
 */
import { db, eq, mailDomains } from "@/db";
import { fromHeader } from "@/lib/mail/ses-events";
import { attachFiles, rawEmail, sendNow, type EmailMessage } from "@/lib/server/email";
import { sendSes, sendSesRaw, sesTenant } from "@/lib/server/ses";

/** Sends right away and returns the provider's message id (delivery events refer to it). */
export async function sendOrgMail(email: EmailMessage): Promise<string> {
  const domain = email.fromEmail?.split("@")[1]?.toLowerCase();
  if (import.meta.env.DEV || !domain) return sendNow(email);
  const [d] = await db.select({ orgId: mailDomains.orgId, provider: mailDomains.provider }).from(mailDomains).where(eq(mailDomains.domain, domain));
  if (d?.provider !== "ses") return sendNow(email);
  if (email.calendar) return sendSesRaw(email.fromEmail!, email.to, await rawEmail(email), sesTenant(d.orgId));
  return sendSes(
    {
      from: fromHeader(email.fromName, email.fromEmail!),
      to: email.to,
      cc: email.cc?.length ? email.cc : undefined,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
      attachments: await attachFiles(email.files),
    },
    sesTenant(d.orgId),
  );
}
