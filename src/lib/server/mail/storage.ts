import { env } from "cloudflare:workers";
import PostalMime from "postal-mime";
import { and, db, eq, inArray, mailMessages, mailboxes, sql } from "@/db";
import { mailStorageReservations, mailStorageUsage } from "@/db/schema/mail-storage";
import { attachmentUrl, safeFilename } from "@/lib/uploads";
import { HttpError } from "@/lib/server/api";

export const HTML_R2_BYTES = 256 * 1024;
export const byteLength = (text: string | null | undefined) => new TextEncoder().encode(text ?? "").byteLength;

/** The trigger checks and updates the mailbox total in the same SQLite write transaction. */
export async function reserveStorage(mailboxId: string, bytes: number, reservationId: string) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new HttpError(422, "Invalid storage size");
  try {
    await db.insert(mailStorageReservations).values({ id: reservationId, mailboxId, bytes }).onConflictDoNothing();
    const [row] = await db.select().from(mailStorageReservations).where(eq(mailStorageReservations.id, reservationId));
    if (!row || row.mailboxId !== mailboxId || row.bytes !== bytes) throw new HttpError(409, "Storage reservation already exists with different contents");
  } catch (e) {
    if (String(e).includes("Mailbox storage quota exceeded") || String((e as Error).cause).includes("Mailbox storage quota exceeded")) throw new HttpError(507, "Mailbox storage quota exceeded");
    throw e;
  }
}
export async function releaseStorageReservation(reservationId: string) {
  await db.delete(mailStorageReservations).where(eq(mailStorageReservations.id, reservationId));
}
export async function resizeStorageReservation(reservationId: string, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new HttpError(422, "Invalid storage size");
  try { await db.update(mailStorageReservations).set({ bytes }).where(eq(mailStorageReservations.id, reservationId)); }
  catch (e) { if (String(e).includes("quota exceeded") || String((e as Error).cause).includes("quota exceeded")) throw new HttpError(507, "Mailbox storage quota exceeded"); throw e; }
}
export async function storeHtml(orgId: string, mailboxId: string, messageId: string, html: string | null) {
  if (!html || byteLength(html) <= HTML_R2_BYTES) return { html, htmlKey: null };
  const htmlKey = `mail-html/${orgId}/${mailboxId}/${messageId}.html`;
  try { await env.FILES.put(htmlKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } }); }
  catch(e) { await env.FILES.delete(htmlKey); throw e; }
  return { html: null, htmlKey };
}
export async function hydrateHtml<T extends { html: string | null; htmlKey: string | null }>(message: T) {
  if (!message.htmlKey) return message;
  const object = await env.FILES.get(message.htmlKey);
  if (!object) throw new HttpError(503, "Message body is temporarily unavailable");
  return { ...message, html: await object.text() };
}
export async function listStorage(mailboxIds: string[]) {
  if (!mailboxIds.length) return [];
  const usage = await db.select().from(mailStorageUsage).where(inArray(mailStorageUsage.mailboxId, mailboxIds));
  return mailboxIds.map(mailboxId => usage.find(u => u.mailboxId === mailboxId) ?? { mailboxId, usedBytes: 0, quotaBytes: 10 * 1024 ** 3 });
}
export async function setStorageQuota(orgId: string, mailboxId: string, quotaBytes: number) {
  if (!Number.isSafeInteger(quotaBytes) || quotaBytes <= 0) throw new HttpError(422, "Enter a positive storage limit");
  const [box] = await db.select({ id: mailboxes.id }).from(mailboxes).where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.orgId, orgId)));
  if (!box) throw new HttpError(404, "Not found");
  await db.insert(mailStorageUsage).values({ mailboxId, quotaBytes }).onConflictDoUpdate({ target: mailStorageUsage.mailboxId, set: { quotaBytes } });
}
/** A bounded, repeatable backfill. Keep legacy rows until their R2 write has succeeded. */
export async function backfillMailBodies(limit = 20) {
  const rows = await db.select().from(mailMessages).where(eq(mailMessages.storageVersion, 0)).limit(limit);
  for (const row of rows) {
    let html = row.html;
    const inlineKeys: string[] = [];
    let inlineBytes = 0;
    if (!html && row.rawKey) {
      const raw = await env.FILES.get(row.rawKey);
      if (!raw) throw new HttpError(503, "Original message temporarily unavailable during backfill");
      const parsed = await PostalMime.parse(await raw.arrayBuffer());
      html = parsed.html || null;
      for (const [index, attachment] of parsed.attachments.entries()) {
        const cid = attachment.contentId?.replace(/^<|>$/g, "");
        if (!html || !cid || !html.includes(`cid:${cid}`)) continue;
        const key = `attachments/${row.orgId}/mail-inline-${row.id}-${index}/${safeFilename(attachment.filename || "inline.bin")}`;
        const content = typeof attachment.content === "string" ? new TextEncoder().encode(attachment.content) : attachment.content;
        await env.FILES.put(key, content, { httpMetadata: { contentType: attachment.mimeType || "application/octet-stream" } });
        inlineKeys.push(key);
        inlineBytes += content.byteLength;
        html = html.replaceAll(`cid:${cid}`, attachmentUrl(key));
      }
    }
    const body = await storeHtml(row.orgId, row.mailboxId, row.id, html);
    const delta = byteLength(html) - byteLength(row.html) + inlineBytes;
    // Existing mail is retained even if already over quota; backfill is not a new delivery.
    await db.batch([
      db.update(mailStorageReservations).set({ bytes: sql`${mailStorageReservations.bytes} + ${Math.max(0, delta)}` }).where(and(eq(mailStorageReservations.id,row.id), sql`exists(select 1 from mail_messages where id = ${row.id} and storage_version = 0)`)),
      db.update(mailMessages).set({ ...body, storageKeys: [...row.storageKeys, ...inlineKeys, ...(body.htmlKey ? [body.htmlKey] : [])], storageVersion: 1 }).where(and(eq(mailMessages.id, row.id), eq(mailMessages.storageVersion, 0))),
    ]);
  }
  return rows.length;
}
