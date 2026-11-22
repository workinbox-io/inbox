import { env } from "cloudflare:workers";
import { z } from "zod";
import PostalMime from "postal-mime";
import { and, db, eq, mailLabels, mailMessages, mailNativeGc, mailNativeImports, mailNativeWatchers, member } from "@/db";
import { HttpError } from "@/lib/server/api";
import { sha256Hex } from "@/lib/server/crypto";
import { toRole } from "@/lib/server/roles";
import { ATTACHMENT_URL_PREFIX } from "@/lib/uploads";
import { viewerMailboxes, type Mailbox } from "./access";
import { mustChangePassword } from "./account-security";
import { bridgeAuthorized } from "./bridge";
import { backfillSentRaw } from "./raw";
import { getRawMessage, handleOrgMail } from "./store";

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const nativeVersion = z.object({
  modseq: z.number().int(), unread: z.boolean(), starred: z.boolean(), spam: z.boolean(),
  archivedAt: z.number().int().nullable(), trashedAt: z.number().int().nullable(), snoozedUntil: z.number().int().nullable(),
  labels: z.array(identifier).max(1000),
}).strict();
export const nativeFlags = z.object({ seen: z.boolean(), starred: z.boolean(), role: z.enum(["inbox", "sent", "archive", "trash", "junk"]), labels: z.array(identifier).max(1000) }).strict();
type Version = z.infer<typeof nativeVersion>;
export type NativeFlags = z.infer<typeof nativeFlags>;

export async function nativeMailboxContext(request: Request, mailboxId: string) {
  if (!bridgeAuthorized(request)) throw new HttpError(401, "Unauthorized");
  const orgId = request.headers.get("x-workinbox-org") ?? "", userId = request.headers.get("x-workinbox-user") ?? "";
  const scope = request.headers.get("x-workinbox-scope");
  if (!orgId || !userId || orgId.length > 255 || userId.length > 255 || scope !== await sha256Hex(JSON.stringify([orgId, userId])) || await mustChangePassword(userId)) throw new HttpError(403, "Access denied");
  const [membership] = await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  if (!membership) throw new HttpError(403, "Access denied");
  const mailbox = (await viewerMailboxes({ orgId, userId, role: toRole(membership.role) })).find(box => box.id === mailboxId);
  if (!mailbox) throw new HttpError(404, "Mailbox not found");
  await db.insert(mailNativeWatchers).values({ mailboxId, userId }).onConflictDoNothing();
  return { mailbox, userId, scope: scope! };
}

const columns = `m.id,m.native_import_id AS importId,m.thread_id AS threadId,m.uid,m.direction,m.created_at AS receivedAt,m.message_id AS mimeId,
 t.modseq,t.unread,t.starred,t.spam,t.archived_at AS archivedAt,t.trashed_at AS trashedAt,t.snoozed_until AS snoozedUntil,
 (SELECT json_group_array(label_id) FROM (SELECT label_id FROM mail_thread_labels WHERE thread_id=t.id ORDER BY label_id)) AS labels`;
type Row = { id: string; importId: string | null; threadId: string; uid: number; direction: string; receivedAt: number; mimeId: string | null; modseq: number; unread: number; starred: number; spam: number; archivedAt: number | null; trashedAt: number | null; snoozedUntil: number | null; labels: string };
function metadata(row: Row) {
  const labels = JSON.parse(row.labels) as string[];
  return { id: row.id, importId: row.importId, threadId: row.threadId, uid: row.uid, receivedAt: new Date(row.receivedAt).toISOString(), mimeId: row.mimeId,
    seen: !row.unread, starred: !!row.starred, role: row.trashedAt !== null ? "trash" : row.spam ? "junk" : row.archivedAt !== null || row.snoozedUntil !== null ? "archive" : row.direction === "out" ? "sent" : "inbox", labels,
    version: { modseq: row.modseq, unread: !!row.unread, starred: !!row.starred, spam: !!row.spam, archivedAt: row.archivedAt, trashedAt: row.trashedAt, snoozedUntil: row.snoozedUntil, labels } };
}
async function message(box: Mailbox, id: string) {
  const row = await env.DB.prepare(`SELECT ${columns} FROM mail_messages m JOIN mail_threads t ON t.id=m.thread_id WHERE m.mailbox_id=? AND m.id=?`).bind(box.id, id).first<Row>();
  if (!row) throw new HttpError(404, "Message not found");
  return metadata(row);
}
export async function nativeSnapshot(box: Mailbox, after: number, upper?: number) {
  const head = (await env.DB.prepare("SELECT coalesce((SELECT seq FROM sqlite_sequence WHERE name='mail_native_changes'),0) AS seq").first<{ seq: number }>())!.seq;
  const upperUid = upper ?? box.uidNext - 1;
  const rows = await env.DB.prepare(`SELECT ${columns} FROM mail_messages m JOIN mail_threads t ON t.id=m.thread_id WHERE m.mailbox_id=? AND m.uid>? AND m.uid<=? ORDER BY m.uid LIMIT 100`).bind(box.id, after, upperUid).all<Row>();
  return { head, upperUid, uidValidity: box.uidValidity, messages: rows.results.map(metadata), hasMore: rows.results.length === 100 };
}
export async function nativeChanges(box: Mailbox, after: number) {
  const head = (await env.DB.prepare("SELECT coalesce((SELECT seq FROM sqlite_sequence WHERE name='mail_native_changes'),0) AS seq").first<{ seq: number }>())!.seq;
  if (after > head) throw new HttpError(409, "Source state regressed; retain the existing copy and recover explicitly");
  const rows = await env.DB.prepare(`SELECT c.seq,c.message_id AS sourceId,${columns} FROM mail_native_changes c LEFT JOIN mail_messages m ON m.id=c.message_id AND m.mailbox_id=c.mailbox_id LEFT JOIN mail_threads t ON t.id=m.thread_id WHERE c.mailbox_id=? AND c.seq>? AND c.seq<=? ORDER BY c.seq LIMIT 100`).bind(box.id, after, head).all<Row & { seq: number; sourceId: string }>();
  return { uidValidity: box.uidValidity, next: rows.results.length === 100 ? rows.results.at(-1)!.seq : head,
    changes: rows.results.map(row => ({ seq: row.seq, id: row.sourceId, message: row.id ? metadata(row) : null })), hasMore: rows.results.length === 100 };
}
export async function nativeRaw(box: Mailbox, id: string) {
  await message(box, id);
  await backfillSentRaw(1, id);
  return getRawMessage(id, [box]);
}
const guard = `t.id=? AND t.mailbox_id=? AND t.modseq=? AND t.unread=? AND t.starred=? AND t.spam=? AND t.archived_at IS ? AND t.trashed_at IS ? AND t.snoozed_until IS ?
 AND (SELECT json_group_array(label_id) FROM (SELECT label_id FROM mail_thread_labels WHERE thread_id=t.id ORDER BY label_id))=?`;
const args = (box: Mailbox, thread: string, v: Version) => [thread, box.id, v.modseq, +v.unread, +v.starred, +v.spam, v.archivedAt, v.trashedAt, v.snoozedUntil, JSON.stringify([...v.labels].sort())];

/** Native clients and the web app both change a conversation; a stale client never overwrites a newer web edit. */
export async function nativePatch(box: Mailbox, id: string, expected: Version, flags: NativeFlags) {
  const current = await message(box, id);
  const labels = [...new Set(flags.labels)].sort();
  const owned = await env.DB.prepare("SELECT count(*) AS n FROM mail_labels WHERE mailbox_id=? AND id IN (SELECT value FROM json_each(?))").bind(box.id, JSON.stringify(labels)).first<{ n: number }>();
  if (owned?.n !== labels.length) throw new HttpError(409, "Folder changed");
  const now = Date.now();
  const changed = `(SELECT modseq FROM mail_threads WHERE id=?)=(SELECT modseq+1 FROM mailboxes WHERE id=?)`;
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE mail_threads AS t SET unread=?,starred=?,spam=?,archived_at=?,trashed_at=?,snoozed_until=NULL,modseq=(SELECT modseq+1 FROM mailboxes WHERE id=?) WHERE ${guard} AND EXISTS(SELECT 1 FROM mail_messages WHERE id=? AND thread_id=t.id AND mailbox_id=?) RETURNING id`)
      .bind(+!flags.seen, +flags.starred, +(flags.role === "junk"), flags.role === "archive" ? now : null, flags.role === "trash" ? now : null, box.id, ...args(box, current.threadId, expected), id, box.id),
    env.DB.prepare(`DELETE FROM mail_thread_labels WHERE thread_id=? AND ${changed}`).bind(current.threadId, current.threadId, box.id),
    env.DB.prepare(`INSERT INTO mail_thread_labels(thread_id,label_id) SELECT ?,id FROM mail_labels WHERE mailbox_id=? AND id IN (SELECT value FROM json_each(?)) AND ${changed}`).bind(current.threadId, box.id, JSON.stringify(labels), current.threadId, box.id),
    env.DB.prepare(`UPDATE mailboxes SET modseq=modseq+1 WHERE id=? AND ${changed}`).bind(box.id, current.threadId, box.id),
  ]);
  if (!result[0].results.length) throw new HttpError(409, "Conversation changed; refresh and retry");
  return message(box, id);
}
export async function nativeRemove(box: Mailbox, id: string, expected: Version) {
  const current = await message(box, id);
  if (current.role !== "trash") return { deleted: false, message: await nativePatch(box, id, expected, { ...current, role: "trash" }) };
  const [row] = await db.select().from(mailMessages).where(and(eq(mailMessages.id, id), eq(mailMessages.mailboxId, box.id)));
  const keys = [...new Set([...row!.storageKeys, ...row!.files.map(file => file.url.slice(ATTACHMENT_URL_PREFIX.length)), ...(row!.rawKey ? [row!.rawKey] : []), ...(row!.htmlKey ? [row!.htmlKey] : [])])];
  const result = await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO mail_native_gc(id,mailbox_id,keys) SELECT ?,?,? FROM mail_threads t WHERE ${guard} RETURNING id`).bind(id, box.id, JSON.stringify(keys), ...args(box, current.threadId, expected)),
    env.DB.prepare("DELETE FROM mail_messages WHERE id=? AND mailbox_id=? AND EXISTS(SELECT 1 FROM mail_native_gc WHERE id=?)").bind(id, box.id, id),
    env.DB.prepare("DELETE FROM mail_threads WHERE id=? AND mailbox_id=? AND NOT EXISTS(SELECT 1 FROM mail_messages WHERE thread_id=?)").bind(current.threadId, box.id, current.threadId),
    env.DB.prepare("UPDATE mailboxes SET modseq=modseq+1 WHERE id=? AND EXISTS(SELECT 1 FROM mail_native_gc WHERE id=?)").bind(box.id, id),
  ]);
  if (!result[0].results.length) throw new HttpError(409, "Conversation changed; refresh and retry");
  await cleanupNativeGarbage().catch(() => {});
  return { deleted: true };
}
export async function cleanupNativeGarbage() {
  for (const row of await db.select().from(mailNativeGc).limit(50)) {
    if (row.keys.length) await env.FILES.delete(row.keys);
    await db.delete(mailNativeGc).where(eq(mailNativeGc.id, row.id));
  }
}
export async function nativeLabel(box: Mailbox, id: string, name: string, remove = false) {
  if (remove) { await db.delete(mailLabels).where(and(eq(mailLabels.id, id), eq(mailLabels.mailboxId, box.id))); return; }
  const [existing] = await db.select().from(mailLabels).where(eq(mailLabels.id, id));
  if (existing && existing.mailboxId !== box.id) throw new HttpError(404, "Folder not found");
  await db.insert(mailLabels).values({ id, mailboxId: box.id, name }).onConflictDoUpdate({ target: mailLabels.id, set: { name } });
}
export async function nativeFolders(box: Mailbox) { return db.select({ id: mailLabels.id, name: mailLabels.name }).from(mailLabels).where(eq(mailLabels.mailboxId, box.id)); }
export async function nativeImport(box: Mailbox, raw: Uint8Array<ArrayBuffer>, receivedAt: string, importId: string, scope: string, flags: NativeFlags) {
  const rawDigest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",raw))].map(byte=>byte.toString(16).padStart(2,"0")).join("");
  const fingerprint = await sha256Hex(JSON.stringify([rawDigest, receivedAt, flags]));
  await db.insert(mailNativeImports).values({id:importId,mailboxId:box.id,scope,fingerprint}).onConflictDoNothing();
  const [receipt] = await db.select().from(mailNativeImports).where(eq(mailNativeImports.id,importId));
  if (!receipt || receipt.mailboxId!==box.id || receipt.scope!==scope || receipt.fingerprint!==fingerprint) throw new HttpError(409,"Import id already used");
  if(receipt.complete && receipt.rootId) {
    try { return await message(box,receipt.rootId); }
    catch(error) { if(error instanceof HttpError && error.status===404)throw new HttpError(410,"Previously imported message was deleted");throw error; }
  }
  const parsed = await PostalMime.parse(raw);
  const stableId = parsed.messageId ?? `<native-${rawDigest}@workinbox.invalid>`;
  const headers = new Headers();
  for (const header of parsed.headers) headers.append(header.key, header.value);
  headers.set("message-id", stableId);
  let rejection: string | undefined;
  if (!receipt.rootId) await handleOrgMail({ to: box.address, from: parsed.from?.address ?? box.address, raw: new ReadableStream({start(controller){controller.enqueue(raw);controller.close();}}), rawSize: raw.byteLength, headers, setReject: reason => { rejection = reason; } }, { nativeImportId: importId, date: new Date(receivedAt), archived: flags.role === "archive", flags: { unread: !flags.seen, starred: flags.starred, spam: flags.role === "junk", archived: flags.role === "archive", trashed: flags.role === "trash" } }, {raw,parsed});
  if (rejection) throw new HttpError(507, rejection);
  const id = stableId.startsWith("<") ? stableId : `<${stableId}>`;
  const [row] = await db.select({ id: mailMessages.id }).from(mailMessages).where(and(eq(mailMessages.mailboxId, box.id), eq(mailMessages.messageId, id)));
  if (!row) throw new HttpError(503, "Imported message is unavailable");
  let result=await message(box,row.id);
  const [updatedReceipt]=await db.select().from(mailNativeImports).where(eq(mailNativeImports.id,importId));
  if(!updatedReceipt.complete && updatedReceipt.rootId===row.id && result.version.modseq===updatedReceipt.revision) result=await nativePatch(box,row.id,result.version,flags);
  await db.update(mailNativeImports).set({complete:true,rootId:row.id}).where(eq(mailNativeImports.id,importId));
  return result;
}
