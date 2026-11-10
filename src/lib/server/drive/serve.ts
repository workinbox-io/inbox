/**
 * Sending a drive file to the browser (signed-in viewers and public links): Range for video and PDF seeking, the
 * original name, and never as HTML or SVG a browser would run (safeServeType).
 */
import { env } from "cloudflare:workers";
import { previewKind, safeServeType } from "@/lib/drive/access";
import { HttpError } from "@/lib/server/api";
import type { DriveItem } from "./access";

/** `filename*` carries any name; the plain `filename` is an ASCII fallback for old clients. */
export function disposition(type: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function serveFile(item: DriveItem, request: Request, opts: { download?: boolean; cache?: "private" | "no-store" } = {}) {
  if (item.kind !== "file" || !item.r2Key) throw new HttpError(422, "Not a file");
  const object = await env.FILES.get(item.r2Key, { range: request.headers, onlyIf: request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  const kind = previewKind(item.mediaType);
  const headers = new Headers({
    "Content-Type": safeServeType(item.mediaType),
    "Content-Disposition": disposition(opts.download || !kind ? "attachment" : "inline", item.name),
    "Cache-Control": opts.cache === "no-store" ? "no-store" : "private, max-age=300",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    // PDFs need the browser's viewer, which a sandboxed page can't load; everything else can't run anything.
    "Content-Security-Policy": kind === "pdf" ? "default-src 'none'; object-src 'self'; plugin-types application/pdf" : "default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; sandbox",
    ETag: object.httpEtag,
  });
  // onlyIf matched (If-None-Match): R2 returns the object without a body.
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && request.headers.has("range")) {
    const offset = range.suffix !== undefined ? Math.max(0, object.size - range.suffix) : (range.offset ?? 0);
    const length = Math.min(range.length ?? object.size - offset, object.size - offset);
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
