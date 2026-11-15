/**
 * Getting files into the drive: small ones in one streamed PUT, larger ones as an R2 multipart upload in parts
 * (start → PUT parts → complete), like the mail import. Space is checked before any bytes are written.
 */
import { env } from "cloudflare:workers";
import { and, db, driveItems, driveUploads, eq, lt } from "@/db";
import { cleanName, uniqueName } from "@/lib/drive/access";
import { HttpError } from "@/lib/server/api";
import type { DriveUpload } from "@/lib/validation-drive";
import { requireFolder, type DriveViewer } from "./access";
import { getItem, placement, takenNames } from "./items";
import { requireDriveSpace } from "./quota";

/** Up to this size a file goes up in one request; above it in parts of this size (R2 wants ≥ 5 MB but the last). */
export const DRIVE_PART_BYTES = 10 * 1024 * 1024;

export const driveKey = (orgId: string, id: string) => `drive/${orgId}/${id}`;

const cleanType = (t: string) => (/^[\w.+-]+\/[\w.+-]+$/.test(t.trim()) ? t.trim().toLowerCase() : "application/octet-stream");

function fileName(raw: string) {
  const name = cleanName(raw);
  if (!name) throw new HttpError(422, "The file has no name");
  return name;
}

/** Inserts the item for stored bytes, under a free name in its folder. */
async function addFile(v: DriveViewer, input: { id: string; parentId: string | null; name: string; mediaType: string; size: number; r2Key: string }) {
  const parent = await requireFolder(v, input.parentId);
  const name = uniqueName(input.name, await takenNames(v.orgId, parent?.id ?? null, v.userId || null));
  return { ...placement(v, input.id, parent), kind: "file" as const, name, size: input.size, mediaType: input.mediaType, r2Key: input.r2Key };
}

/** One request: the body is the file (≤ DRIVE_PART_BYTES). */
export async function putFile(v: DriveViewer, input: DriveUpload, body: ReadableStream) {
  if (input.size > DRIVE_PART_BYTES) throw new HttpError(413, "Upload larger files in parts");
  const parent = await requireFolder(v, input.parentId);
  const name = fileName(input.name);
  await requireDriveSpace(v.orgId, input.size);
  const id = crypto.randomUUID();
  const key = driveKey(v.orgId, id);
  const mediaType = cleanType(input.mediaType);
  const object = await env.FILES.put(key, body, { httpMetadata: { contentType: mediaType } });
  if (!object) throw new HttpError(500, "Upload failed");
  await db.insert(driveItems).values(await addFile(v, { id, parentId: parent?.id ?? null, name, mediaType, size: object.size, r2Key: key }));
  return getItem(v, id);
}

export async function startUpload(v: DriveViewer, input: DriveUpload) {
  const parent = await requireFolder(v, input.parentId);
  const name = fileName(input.name);
  await requireDriveSpace(v.orgId, input.size);
  const id = crypto.randomUUID();
  const key = driveKey(v.orgId, id);
  const mediaType = cleanType(input.mediaType);
  const upload = await env.FILES.createMultipartUpload(key, { httpMetadata: { contentType: mediaType } });
  await db.insert(driveUploads).values({ id, orgId: v.orgId, userId: v.userId || null, parentId: parent?.id ?? null, name, mediaType, size: input.size, r2Key: key, uploadId: upload.uploadId });
  return { id, partBytes: DRIVE_PART_BYTES };
}

async function ownUpload(v: DriveViewer, id: string) {
  const [row] = await db.select().from(driveUploads).where(and(eq(driveUploads.id, id), eq(driveUploads.orgId, v.orgId)));
  if (!row || (row.userId ?? "") !== v.userId) throw new HttpError(404, "Not found");
  return row;
}

export async function uploadPart(v: DriveViewer, id: string, part: number, body: ReadableStream) {
  const row = await ownUpload(v, id);
  if (!Number.isInteger(part) || part < 1 || part > 10_000) throw new HttpError(422, "Invalid part");
  const uploaded = await env.FILES.resumeMultipartUpload(row.r2Key, row.uploadId).uploadPart(part, body);
  return { partNumber: uploaded.partNumber, etag: uploaded.etag };
}

export async function completeUpload(v: DriveViewer, id: string, parts: { partNumber: number; etag: string }[]) {
  const row = await ownUpload(v, id);
  const object = await env.FILES.resumeMultipartUpload(row.r2Key, row.uploadId).complete(parts);
  if (object.size > row.size) {
    // More than was declared (and reserved): don't let it past the quota.
    await env.FILES.delete(row.r2Key);
    await db.delete(driveUploads).where(eq(driveUploads.id, id));
    throw new HttpError(422, "The file is larger than announced. Upload it again.");
  }
  const values = await addFile(v, { id, parentId: row.parentId, name: row.name, mediaType: row.mediaType, size: object.size, r2Key: row.r2Key });
  await db.batch([db.insert(driveItems).values(values), db.delete(driveUploads).where(eq(driveUploads.id, id))]);
  return getItem(v, id);
}

export async function abortUpload(v: DriveViewer, id: string) {
  const row = await ownUpload(v, id);
  await env.FILES.resumeMultipartUpload(row.r2Key, row.uploadId)
    .abort()
    .catch(() => {});
  await db.delete(driveUploads).where(eq(driveUploads.id, id));
}

/** Daily: uploads started over a day ago and never completed. */
export async function abortStaleUploads() {
  const rows = await db.select().from(driveUploads).where(lt(driveUploads.createdAt, new Date(Date.now() - 86_400_000))).limit(500);
  for (const row of rows) {
    await env.FILES.resumeMultipartUpload(row.r2Key, row.uploadId)
      .abort()
      .catch(() => {});
    await db.delete(driveUploads).where(eq(driveUploads.id, row.id));
  }
  return rows.length;
}
