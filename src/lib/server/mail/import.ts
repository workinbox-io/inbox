/**
 * Importing old mail into a mailbox (Settings → Mail → Import): an .mbox (Google Takeout) or .eml files, which the
 * browser joins into one mbox. The file goes to R2 in parts (multipart upload), then the job `mail.import` reads it in
 * batches from `offset`, and each message goes through handleOrgMail as imported mail (read, dated from its header,
 * no rules, notifications or push). Re-runs are safe: handleOrgMail skips a Message-ID the mailbox already has.
 */
import { env } from "cloudflare:workers";
import { and, db, desc, eq, mailboxes, mailImports } from "@/db";
import { importPlacement, isMbox, splitMbox } from "@/lib/mail/mbox";
import { bareAddress, rawHeaders } from "@/lib/mail/ses-events";
import { HttpError } from "@/lib/server/api";
import { enqueue } from "@/lib/server/queue";
import { handleOrgMail } from "./store";

/** The browser uploads the file in parts of this size (R2 wants at least 5 MB per part but the last). */
export const IMPORT_PART_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_BYTES = 20 * 1024 ** 3;
/** What one job reads of the file, grown up to MAX_READ_BYTES when a message doesn't fit. */
const READ_BYTES = 8 * 1024 * 1024;
const MAX_READ_BYTES = 64 * 1024 * 1024;
/** Messages per job: each one is a dozen D1 and R2 calls, well within one invocation's limits. */
const BATCH = 40;

const fileKey = (orgId: string, id: string) => `imports/${orgId}/${id}`;

async function ownImport(orgId: string, id: string) {
  const [row] = await db.select().from(mailImports).where(and(eq(mailImports.id, id), eq(mailImports.orgId, orgId)));
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

export async function startImport(orgId: string, input: { mailboxId: string; filename: string; size: number }) {
  const [box] = await db.select({ id: mailboxes.id }).from(mailboxes).where(and(eq(mailboxes.id, input.mailboxId), eq(mailboxes.orgId, orgId)));
  if (!box) throw new HttpError(404, "Not found");
  if (input.size > MAX_IMPORT_BYTES) throw new HttpError(413, "Import files up to 20 GB, or split the export");
  const id = crypto.randomUUID();
  const upload = await env.FILES.createMultipartUpload(fileKey(orgId, id), { httpMetadata: { contentType: "application/mbox" } });
  await db.insert(mailImports).values({ id, orgId, mailboxId: box.id, filename: input.filename.slice(0, 200), size: input.size, uploadId: upload.uploadId });
  return { id, partBytes: IMPORT_PART_BYTES };
}

export async function uploadImportPart(orgId: string, id: string, part: number, body: ReadableStream) {
  const row = await ownImport(orgId, id);
  if (row.status !== "uploading" || !row.uploadId) throw new HttpError(409, "This import is no longer uploading");
  if (!Number.isInteger(part) || part < 1 || part > 10_000) throw new HttpError(422, "Invalid part");
  const uploaded = await env.FILES.resumeMultipartUpload(fileKey(orgId, id), row.uploadId).uploadPart(part, body);
  return { partNumber: uploaded.partNumber, etag: uploaded.etag };
}

export async function completeImport(orgId: string, id: string, parts: { partNumber: number; etag: string }[]) {
  const row = await ownImport(orgId, id);
  if (row.status !== "uploading" || !row.uploadId) throw new HttpError(409, "This import is no longer uploading");
  const object = await env.FILES.resumeMultipartUpload(fileKey(orgId, id), row.uploadId).complete(parts);
  await db.update(mailImports).set({ status: "queued", uploadId: null, size: object.size, updatedAt: new Date() }).where(eq(mailImports.id, id));
  await enqueue("mail.import", { id });
  return row;
}

export async function listImports(orgId: string) {
  return db
    .select({
      id: mailImports.id,
      mailbox: mailboxes.address,
      filename: mailImports.filename,
      size: mailImports.size,
      offset: mailImports.offset,
      status: mailImports.status,
      imported: mailImports.imported,
      skipped: mailImports.skipped,
      error: mailImports.error,
      createdAt: mailImports.createdAt,
    })
    .from(mailImports)
    .innerJoin(mailboxes, eq(mailboxes.id, mailImports.mailboxId))
    .where(eq(mailImports.orgId, orgId))
    .orderBy(desc(mailImports.createdAt))
    .limit(20);
}

/** The job: one batch of messages from `offset`, then the next job, until the file is read. */
export async function runImport(id: string) {
  const [row] = await db.select().from(mailImports).where(eq(mailImports.id, id));
  if (!row || (row.status !== "queued" && row.status !== "running")) return;
  const fail = async (error: string) => {
    await db.update(mailImports).set({ status: "failed", error, updatedAt: new Date() }).where(eq(mailImports.id, id));
  };
  const [box] = await db.select().from(mailboxes).where(eq(mailboxes.id, row.mailboxId));
  if (!box) return fail("The mailbox was deleted");

  const key = fileKey(row.orgId, row.id);
  let length = row.offset === 0 && row.size <= MAX_READ_BYTES ? Math.min(row.size, READ_BYTES) : READ_BYTES;
  let split: { messages: Uint8Array[]; ends: number[] };
  let final: boolean;
  for (;;) {
    const object = await env.FILES.get(key, { range: { offset: row.offset, length } });
    if (!object) return fail("The uploaded file is gone");
    const chunk = new Uint8Array(await object.arrayBuffer());
    final = row.offset + chunk.length >= row.size;
    if (row.offset === 0 && !isMbox(chunk)) {
      // One .eml: the whole file is the message.
      if (!final && row.size > MAX_READ_BYTES) return fail("This file is neither an mbox nor a single message");
      if (!final) {
        length = row.size;
        continue;
      }
      split = { messages: [chunk], ends: [chunk.length] };
    } else split = splitMbox(chunk, final);
    if (split.messages.length || final || length >= MAX_READ_BYTES) break;
    length *= 2;
  }
  if (!split.messages.length && !final) return fail("A message in the file is larger than 64 MB");

  let imported = 0;
  let skipped = 0;
  let done = 0;
  for (const message of split.messages.slice(0, BATCH)) {
    const raw = message.slice(); // its own ArrayBuffer, for Blob and the header reader
    const headers = rawHeaders(raw.buffer);
    const placement = importPlacement(headers.get("x-gmail-labels"));
    done++;
    if (placement.skip) {
      skipped++;
      continue;
    }
    const date = new Date(headers.get("date") ?? "");
    let rejected: string | null = null;
    const placed = { date: Number.isNaN(date.getTime()) ? row.createdAt : date, archived: placement.archived, duplicate: false };
    await handleOrgMail(
      {
        to: box.address,
        from: bareAddress(headers.get("from") ?? ""),
        raw: new Blob([raw]).stream(),
        rawSize: raw.byteLength,
        headers,
        setReject: (reason: string) => void (rejected = reason),
      },
      placed,
    );
    if (rejected === "Mailbox storage quota exceeded") {
      done--;
      await save(done);
      return fail("The mailbox's storage is full");
    }
    if (rejected || placed.duplicate) skipped++;
    else imported++;
  }
  const finished = final && done === split.messages.length;
  await save(done, finished);
  if (finished) await env.FILES.delete(key);
  else await enqueue("mail.import", { id });

  async function save(count: number, finished = false) {
    await db
      .update(mailImports)
      .set({
        offset: row!.offset + (count ? split.ends[count - 1]! : 0),
        imported: row!.imported + imported,
        skipped: row!.skipped + skipped,
        status: finished ? "done" : "running",
        updatedAt: new Date(),
      })
      .where(eq(mailImports.id, id));
  }
}
