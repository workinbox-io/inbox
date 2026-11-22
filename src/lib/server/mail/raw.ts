/**
 * Sent mail has no original .eml (providers take structured mail), so the every-minute cron rebuilds one from the stored
 * message: new sends within a minute, older ones as a bounded backfill. Same R2 layout as incoming mail.
 */
import { env } from "cloudflare:workers";
import { and, asc, db, eq, isNull, mailMessages as m, sql } from "@/db";
import { HttpError } from "@/lib/server/api";
import { buildEml } from "@/lib/mail/mime";
import { ATTACHMENT_URL_PREFIX } from "@/lib/uploads";

export async function backfillSentRaw(limit = 20, messageId?: string) {
  const rows = await db.select().from(m).where(and(isNull(m.rawKey), eq(m.direction, "out"), messageId ? eq(m.id, messageId) : undefined)).orderBy(asc(m.createdAt)).limit(limit);
  for (const row of rows) {
    // A body or file deleted from R2 is left out rather than blocking the queue on a row that can never complete.
    const htmlObject=row.htmlKey?await env.FILES.get(row.htmlKey):null;
    if(messageId && row.htmlKey && !htmlObject)throw new HttpError(503,"Message body unavailable during native sync");
    const html = row.htmlKey ? (await htmlObject?.text()) ?? null : row.html;
    const attachments = (
      await Promise.all(
        row.files.map(async (f) => {
          const object = f.url.startsWith(ATTACHMENT_URL_PREFIX) ? await env.FILES.get(f.url.slice(ATTACHMENT_URL_PREFIX.length)) : null;
          if(messageId && !object)throw new HttpError(503,"Attachment unavailable during native sync");
          return object ? { filename: f.filename, mediaType: f.mediaType, content: new Uint8Array(await object.arrayBuffer()) } : null;
        }),
      )
    ).filter((a) => a !== null);
    const eml = buildEml({
      from: { email: row.fromEmail, name: row.fromName },
      to: row.to,
      cc: row.cc,
      subject: row.subject,
      date: row.createdAt,
      messageId: row.messageId,
      inReplyTo: row.inReplyTo,
      references: row.references,
      text: row.text,
      html,
      attachments,
    });
    // Keyed by the row, so a retry overwrites the same object; storageKeys lets mailbox deletion remove it.
    const rawKey = `mail-raw/${row.orgId}/${row.mailboxId}/${row.id}.eml`;
    await env.FILES.put(rawKey, eml, { httpMetadata: { contentType: "message/rfc822" } });
    // shortcut: the .eml is not counted against the mailbox quota (it repeats the body and files already counted).
    await db.update(m).set({ rawKey, storageKeys: sql`json_insert(${m.storageKeys}, '$[#]', ${rawKey})` }).where(and(eq(m.id, row.id), isNull(m.rawKey)));
  }
  return rows.length;
}
