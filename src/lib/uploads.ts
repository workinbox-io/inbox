/**
 * Uploaded files (attachments): what may be uploaded, how files are named and how stored URLs look.
 * Pure module (no cloudflare:workers), shared by the upload endpoints, the composers and the tests.
 */

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Files per message. */
export const ATTACHMENT_MAX_FILES = 5;

/** Allowed media types and the extension we store them under. Never HTML or SVG. */
export const ATTACHMENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** For the file input's `accept` attribute. */
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).join(",");

/** Some browsers report zip/csv/office files with other types; fall back to the extension. */
const BY_EXTENSION: Record<string, string> = Object.fromEntries(Object.entries(ATTACHMENT_TYPES).map(([type, ext]) => [ext, type]));
BY_EXTENSION["jpeg"] = "image/jpeg";

/** The allowed media type for an upload: the declared one, else guessed from the file name; null if not allowed. */
export function resolveAttachmentType(declared: string | null | undefined, filename: string) {
  const type = (declared ?? "").split(";")[0]!.trim().toLowerCase();
  if (ATTACHMENT_TYPES[type]) return type;
  // Generic or browser-specific types (e.g. application/x-zip-compressed, application/octet-stream).
  if (!type || type === "application/octet-stream" || type.includes("zip") || type.includes("csv")) {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return BY_EXTENSION[ext] ?? null;
  }
  return null;
}

export const isImageType = (mediaType: string | undefined) => !!mediaType && /^image\/(png|jpe?g|gif|webp)$/.test(mediaType);

/** A file name that is safe in a URL path and a Content-Disposition header: letters, digits, dot, dash, underscore. */
export function safeFilename(name: string, fallbackExt = "bin") {
  const base = name.split(/[\\/]/).pop() ?? "";
  // Strip accents so "zażółć.pdf" stays readable as "zazolc.pdf".
  const plain = base
    .replace(/[łŁøØđĐß]/g, (c) => ({ ł: "l", Ł: "L", ø: "o", Ø: "O", đ: "d", Đ: "D", ß: "ss" })[c]!)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const dot = plain.lastIndexOf(".");
  const stem = (dot > 0 ? plain.slice(0, dot) : plain).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const ext = (dot > 0 ? plain.slice(dot + 1) : "").replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 8);
  return `${stem || "file"}.${ext || fallbackExt}`;
}

/** Whether the bytes start like the declared image type (a "png" that is really HTML is refused). */
export function sniffImage(mediaType: string, bytes: Uint8Array) {
  const at = (i: number, ...v: number[]) => v.every((b, k) => bytes[i + k] === b);
  if (mediaType === "image/png") return at(0, 0x89, 0x50, 0x4e, 0x47);
  if (mediaType === "image/jpeg") return at(0, 0xff, 0xd8, 0xff);
  if (mediaType === "image/gif") return at(0, 0x47, 0x49, 0x46, 0x38);
  if (mediaType === "image/webp") return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
  return true;
}

export const ATTACHMENT_URL_PREFIX = "/api/files/";

/** Object keys we serve: attachments/<orgId>/<random>/<file>. */
export const ATTACHMENT_KEY = /^attachments\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]{16,}\/[A-Za-z0-9._-]{1,80}$/;

export const attachmentUrl = (key: string) => `${ATTACHMENT_URL_PREFIX}${key}`;

/** Whether `url` points at one of this org's stored attachments (clients may not link anything else). */
export function isOrgAttachmentUrl(url: string, orgId: string) {
  if (!url.startsWith(ATTACHMENT_URL_PREFIX)) return false;
  const key = url.slice(ATTACHMENT_URL_PREFIX.length);
  return ATTACHMENT_KEY.test(key) && key.split("/")[1] === orgId;
}

/** What the upload endpoints return and the send APIs accept back. */
export type AttachmentInput = { url: string; mediaType: string; filename: string };

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(n < 10 * 1024 ** 3 ? 2 : 1)} GB`;
}
