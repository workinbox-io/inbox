/**
 * Uploaded files in R2 (env.FILES): storing an upload, checking the files a request links to, and
 * serving them. Keys are attachments/<orgId>/<random>/<safe-name>; the random part makes URLs
 * unguessable, so serving needs no session.
 */
import { env } from "cloudflare:workers";
import {
  ATTACHMENT_KEY,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  ATTACHMENT_URL_PREFIX,
  attachmentUrl,
  isImageType,
  isOrgAttachmentUrl,
  resolveAttachmentType,
  safeFilename,
  sniffImage,
  type AttachmentInput,
} from "@/lib/uploads";
import { HttpError } from "./api";
import { randomBase64Url } from "./crypto";

/** The display name of an upload: sent URI-encoded in X-Filename (headers must be ASCII). */
export function displayName(raw: string | null) {
  let name = "";
  try {
    name = decodeURIComponent(raw ?? "");
  } catch {
    name = raw ?? "";
  }
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f<>"]/g, "").split(/[\\/]/).pop()!.trim().slice(0, 100);
}

/** Stores the request body as an attachment of `orgId`. */
export async function storeAttachment(orgId: string, request: Request): Promise<AttachmentInput & { size: number }> {
  const name = displayName(request.headers.get("x-filename"));
  if (!name) throw new HttpError(422, "The file has no name");
  const mediaType = resolveAttachmentType(request.headers.get("content-type"), name);
  if (!mediaType) throw new HttpError(415, "This file type isn't supported. Send an image, PDF, text, CSV, ZIP, Word or Excel file.");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > ATTACHMENT_MAX_BYTES) throw new HttpError(413, "Files can be up to 10 MB");
  const body = await request.arrayBuffer();
  if (!body.byteLength) throw new HttpError(422, "The file is empty");
  if (body.byteLength > ATTACHMENT_MAX_BYTES) throw new HttpError(413, "Files can be up to 10 MB");
  if (isImageType(mediaType) && !sniffImage(mediaType, new Uint8Array(body, 0, Math.min(16, body.byteLength)))) {
    throw new HttpError(415, "This image looks damaged or isn't really an image");
  }
  const key = `attachments/${orgId}/${randomBase64Url(12)}/${safeFilename(name, ATTACHMENT_TYPES[mediaType])}`;
  await env.FILES.put(key, body, { httpMetadata: { contentType: mediaType } });
  return { url: attachmentUrl(key), mediaType, filename: name, size: body.byteLength };
}

/**
 * Files a client wants to attach to a message: each must be one of this org's uploads. The media
 * type comes from the stored object, not from the client.
 */
export async function checkAttachments(orgId: string, files: AttachmentInput[] | undefined): Promise<AttachmentInput[]> {
  const out: AttachmentInput[] = [];
  for (const f of files ?? []) {
    if (!isOrgAttachmentUrl(f.url, orgId)) throw new HttpError(422, "Unknown attachment");
    const head = await env.FILES.head(f.url.slice(ATTACHMENT_URL_PREFIX.length));
    if (!head) throw new HttpError(422, "An attachment is no longer available. Upload it again.");
    out.push({ url: f.url, mediaType: head.httpMetadata?.contentType ?? "application/octet-stream", filename: displayName(f.filename) || "file" });
  }
  return out;
}

/** GET /api/files/attachments/…: images inline, everything else as a download; never HTML or SVG. */
export async function serveAttachment(key: string, request: Request) {
  if (!ATTACHMENT_KEY.test(key)) return null;
  const object = await env.FILES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const type = object.httpMetadata?.contentType ?? "";
  const image = isImageType(type);
  const headers = new Headers({
    "Content-Type": ATTACHMENT_TYPES[type] ? type : "application/octet-stream",
    "Content-Disposition": `${image ? "inline" : "attachment"}; filename="${key.split("/").pop()}"`,
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    // Even if a file were rendered, it can't run scripts or load anything.
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    ETag: object.httpEtag,
  });
  if (request.headers.get("if-none-match") === object.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
