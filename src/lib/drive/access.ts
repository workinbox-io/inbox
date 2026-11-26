/**
 * Who may open, edit and manage a drive item. Pure: lib/server/drive/access.ts loads the rows and calls these.
 * Each item is judged like a note (lib/notes/access.ts) and shares are inherited: the viewer's role in an item is
 * the highest role they have in it or any folder above it. Shares only add access going down, never take it away.
 */
import { atLeast, canManageNote, noteRole, type NoteAccessFacts, type NoteRole, type NoteViewerFacts } from "@/lib/notes/access";

export type DriveRole = NoteRole;
export { atLeast };

export interface DriveChainItem extends NoteAccessFacts {
  id: string;
  trashedAt?: Date | number | null;
}

const rank = { view: 1, edit: 2, owner: 3 } as const;

/**
 * `chain` is the item's ancestors from the root down, ending with the item itself. Returns null role when the viewer
 * can't open it; `manage` = may share, rename, move, trash or delete it.
 */
export function driveRole(chain: DriveChainItem[], viewer: NoteViewerFacts, grants: Map<string, "view" | "edit">) {
  let role: DriveRole | null = null;
  let manage = false;
  for (const item of chain) {
    const r = noteRole(item, viewer, grants.get(item.id) ?? null);
    if (r && (!role || rank[r] > rank[role])) role = r;
    if (canManageNote(item, viewer, r)) manage = true;
  }
  return { role, manage: !!role && manage, trashed: chain.some((i) => i.trashedAt) };
}

/** Ancestor ids (root first) from a path `/a/b/c/`, excluding the item itself. */
export const ancestorIds = (path: string) => path.split("/").filter(Boolean).slice(0, -1);

/** True when `path` is `of` itself or lies inside it. */
export const isWithin = (path: string, of: string) => path.startsWith(of);

export const MAX_DEPTH = 20;
export const MAX_NAME = 200;

/** A cleaned file or folder name, or null when nothing usable is left. */
export function cleanName(name: string): string | null {
  const n = name
    .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
  return n && n !== "." && n !== ".." ? n : null;
}

/** "report.pdf" taken → "report (2).pdf", then (3)… */
export function uniqueName(name: string, taken: Set<string>) {
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let i = 2; ; i++) {
    const next = `${base} (${i})${ext}`;
    if (!lower.has(next.toLowerCase())) return next;
  }
}

export type PreviewKind = "image" | "pdf" | "text" | "video" | "audio" | null;

const TEXT_TYPES = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|x-sh|sql|toml))/;

/** How the browser can show a file; null = download only. SVG and HTML are shown as text, never rendered. */
export function previewKind(mediaType: string | null | undefined): PreviewKind {
  const t = (mediaType ?? "").toLowerCase();
  if (t === "image/svg+xml" || t === "text/html") return "text";
  if (/^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(t)) return "image";
  if (t === "application/pdf") return "pdf";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (TEXT_TYPES.test(t)) return "text";
  return null;
}

/** Types sent as their own type (others go out as octet-stream): never HTML/SVG/XML that a browser would run. */
export function safeServeType(mediaType: string | null | undefined) {
  const t = (mediaType ?? "").toLowerCase();
  const kind = previewKind(t);
  if (kind === "text") return "text/plain; charset=utf-8";
  return kind ? t : "application/octet-stream";
}

/** Storage limit in bytes for an org: GB per person × people (at least one); null = unlimited. */
export const driveQuota = (gbPerPerson: number | null, people: number) =>
  gbPerPerson === null ? null : gbPerPerson * 1024 ** 3 * Math.max(1, people);
