/**
 * A Plate document (the mail composer, note snapshots) to e-mail-safe HTML and plain text. Only known nodes and marks
 * pass, every string is escaped and links must be http(s) or mailto, so the browser never sends us HTML.
 * Mentions are `{ type: "mention", key, value, url? }`: `key` is a person's id or `<kind>:<id>` (lib/mentions.ts).
 * Pure, tested in test/mentions.test.ts.
 */
import { cleanTitle, ownLink, refHref, REF_KINDS, type Ref, type RefKind } from "@/lib/mentions";

type Node = { type?: string; text?: string; children?: Node[] } & Record<string, unknown>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (u: unknown) => (typeof u === "string" && /^(https?:|mailto:)/i.test(u.trim()) ? u.trim() : null);

/** Shown before a mention's title: e-mail clients block remote SVG and many block images, emoji always show. */
export const KIND_EMOJI: Record<RefKind, string> = { file: "📄", note: "📝", event: "📅", contact: "👤", thread: "✉️", channel: "#", record: "🗂️" };

/** The mention node's reference, or null for a person. */
/** `origin` set: only our own public links survive (lib/mentions.ts `ownLink`). */
export function mentionRef(n: { key?: unknown; value?: unknown; url?: unknown }, origin?: string): Ref | null {
  const m = /^([a-z]+):([\w~-]{1,80})$/.exec(typeof n.key === "string" ? n.key : "");
  if (!m || !REF_KINDS.includes(m[1] as RefKind)) return null;
  const url = typeof n.url === "string" && /^https?:\/\/[^\s|<>]{1,500}$/.test(n.url) && (origin === undefined || ownLink(n.url, origin)) ? n.url : undefined;
  return { kind: m[1] as RefKind, id: m[2]!, title: cleanTitle(String(n.value ?? "")), ...(url ? { url } : {}) };
}

const MARKS: [string, string, string][] = [
  ["bold", "<strong>", "</strong>"],
  ["italic", "<em>", "</em>"],
  ["underline", "<u>", "</u>"],
  ["strikethrough", "<s>", "</s>"],
  ["code", '<code style="font-family:monospace;background:#f3f4f6;padding:0 3px;border-radius:3px">', "</code>"],
];

const CHIP = "display:inline-block;padding:0 6px;border-radius:6px;background:#eef2ff;color:#3730a3;text-decoration:none;font-weight:500";

function inlineHtml(n: Node, origin: string): string {
  if (typeof n.text === "string") {
    let out = esc(n.text).replace(/\n/g, "<br>");
    for (const [mark, open, close] of MARKS) if (n[mark]) out = open + out + close;
    return out;
  }
  const kids = (n.children ?? []).map((c) => inlineHtml(c, origin)).join("");
  if (n.type === "a") {
    const href = safeUrl(n.url);
    return href ? `<a href="${esc(href)}" style="color:#2563eb">${kids}</a>` : kids;
  }
  if (n.type === "mention") {
    const ref = mentionRef(n as { key?: unknown }, origin);
    if (!ref) return `<strong>@${esc(String(n.value ?? ""))}</strong>`;
    return `<a href="${esc(refHref(ref, origin))}" style="${CHIP}">${KIND_EMOJI[ref.kind]} ${esc(ref.title)}</a>`;
  }
  return kids;
}

function inlineText(n: Node, origin: string): string {
  if (typeof n.text === "string") return n.text;
  if (n.type === "mention") {
    const ref = mentionRef(n as { key?: unknown }, origin);
    return ref ? `${ref.title} <${refHref(ref, origin)}>` : `@${String(n.value ?? "")}`;
  }
  const kids = (n.children ?? []).map((c) => inlineText(c, origin)).join("");
  const href = n.type === "a" ? safeUrl(n.url) : null;
  return href && href !== kids ? `${kids} (${href})` : kids;
}

const TAGS: Record<string, [string, string]> = {
  p: ["p", "margin:0 0 10px"],
  h1: ["h1", "margin:16px 0 8px;font-size:22px"],
  h2: ["h2", "margin:14px 0 8px;font-size:19px"],
  h3: ["h3", "margin:12px 0 6px;font-size:16px"],
  blockquote: ["blockquote", "margin:0 0 10px;padding-left:12px;border-left:3px solid #ddd;color:#555"],
};

/** List items are plain blocks with `listStyleType` and `indent` (@platejs/list): numbered per run and level. */
function listMarker(n: Node, counters: Map<number, number>) {
  const type = n.listStyleType as string | undefined;
  const level = Number(n.indent ?? 1);
  if (!type) {
    counters.clear();
    return { marker: "", level: 0 };
  }
  for (const k of [...counters.keys()]) if (k > level) counters.delete(k);
  if (type === "todo") return { marker: n.checked ? "☑ " : "☐ ", level };
  if (type === "decimal") {
    const next = (counters.get(level) ?? Number(n.listStart ?? 1) - 1) + 1;
    counters.set(level, next);
    return { marker: `${next}. `, level };
  }
  return { marker: "• ", level };
}

export function docToHtml(value: unknown, origin = ""): string {
  if (!Array.isArray(value)) return "";
  const counters = new Map<number, number>();
  return (value as Node[])
    .map((n) => {
      const { marker, level } = listMarker(n, counters);
      if (n.type === "hr") return '<hr style="border:0;border-top:1px solid #ddd;margin:12px 0">';
      if (n.type === "code_block") {
        const code = (n.children ?? []).map((l) => inlineText(l, origin)).join("\n");
        return `<pre style="margin:0 0 10px;padding:8px;background:#f3f4f6;border-radius:4px;white-space:pre-wrap">${esc(code)}</pre>`;
      }
      if (n.type === "img") {
        // Note images are our own uploads (/api/files/…): make them absolute for mail and public pages.
        const src = typeof n.url === "string" && n.url.startsWith("/api/files/") ? `${origin.replace(/\/$/, "")}${n.url}` : safeUrl(n.url);
        return src ? `<p style="margin:0 0 10px"><img src="${esc(src)}" alt="" style="max-width:100%"></p>` : "";
      }
      if (n.type === "table") {
        const rows = (n.children ?? []).map((r) => `<tr>${(r.children ?? []).map((c) => `<td style="border:1px solid #ddd;padding:4px 8px">${(c.children ?? []).map((b) => (b.children ?? []).map((x) => inlineHtml(x, origin)).join("")).join("<br>")}</td>`).join("")}</tr>`);
        return `<table style="border-collapse:collapse;margin:0 0 10px">${rows.join("")}</table>`;
      }
      const [tag, style] = TAGS[n.type ?? "p"] ?? TAGS.p!;
      const indent = level ? `;margin-left:${(level - 1) * 24 + 8}px` : "";
      const inner = (n.children ?? []).map((c) => inlineHtml(c, origin)).join("") || "<br>";
      return `<${tag} style="${style}${indent}">${esc(marker)}${inner}</${tag}>`;
    })
    .join("");
}

export function docToText(value: unknown, origin = ""): string {
  if (!Array.isArray(value)) return "";
  const counters = new Map<number, number>();
  return (value as Node[])
    .map((n) => {
      const { marker, level } = listMarker(n, counters);
      if (n.type === "hr") return "---";
      if (n.type === "table") return (n.children ?? []).map((r) => (r.children ?? []).map((c) => inlineText(c, origin)).join(" | ")).join("\n");
      if (n.type === "code_block") return (n.children ?? []).map((l) => inlineText(l, origin)).join("\n");
      const text = (n.children ?? []).map((c) => inlineText(c, origin)).join("");
      const pad = level ? "  ".repeat(level - 1) : "";
      return n.type === "blockquote" ? text.split("\n").map((l) => `> ${l}`).join("\n") : `${pad}${marker}${text}`;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text (a template, an old draft) as paragraphs. */
export const textToDoc = (text: string) => (text ? text.split("\n") : [""]).map((line) => ({ type: "p", children: [{ text: line }] }));

const walk = (nodes: unknown, fn: (n: Node) => Node): Node[] =>
  Array.isArray(nodes) ? (nodes as Node[]).map((n) => fn(n.children ? { ...n, children: walk(n.children, fn) } : n)) : [];

/** The things a document mentions (not people), for the access check on send. */
export function docRefs(doc: unknown): Ref[] {
  const out: Ref[] = [];
  walk(doc, (n) => {
    const ref = n.type === "mention" ? mentionRef(n as { key?: unknown }) : null;
    if (ref) out.push(ref);
    return n;
  });
  return out;
}

/** Puts the links made on send onto their mentions. */
export function withRefUrls<T>(doc: T, refs: Ref[]): T {
  if (!refs.length) return doc;
  const url = new Map(refs.map((r) => [`${r.kind}:${r.id}`, r.url]));
  return walk(doc, (n) => (n.type === "mention" && url.get(String(n.key)) ? { ...n, url: url.get(String(n.key)) } : n)) as T;
}
