/**
 * "@ anything": references to files, notes, events, contacts, mail threads and channels inside chat text and mail.
 * Stored as `<@kind:id|Title>` or `<@kind:id|Title|https://…/s/token>` when the sender made a link for people
 * without access. People stay `<@userId>` (lib/chat/format.ts). Pure, tested in test/mentions.test.ts.
 */
export const REF_KINDS = ["file", "note", "event", "contact", "thread", "channel"] as const;
export type RefKind = (typeof REF_KINDS)[number];
export type MentionKind = RefKind | "person";

export interface Ref {
  kind: RefKind;
  /** Events may carry an occurrence: `<id>~<startMs>`. */
  id: string;
  title: string;
  /** A public link (live or snapshot) made for people without access. */
  url?: string;
}

/** One search result for the @ picker. */
export interface Mentionable {
  kind: MentionKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Files: the type for the icon (FileBadge). */
  mediaType?: string | null;
  folder?: boolean;
  /** People and contacts: the avatar seed (e-mail). */
  seed?: string;
}

const KIND = REF_KINDS.join("|");
export const REF_SOURCE = `<@(?:${KIND}):[\\w~-]{1,80}\\|[^|<>\\n]{1,120}(?:\\|https?:\\/\\/[^\\s|<>]{1,500})?>`;
const ONE = new RegExp(`^<@(${KIND}):([\\w~-]{1,80})\\|([^|<>\\n]{1,120})(?:\\|(https?:\\/\\/[^\\s|<>]{1,500}))?>$`);

export const cleanTitle = (s: string) => s.replace(/[|<>\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";

export const refToken = (r: Ref) => `<@${r.kind}:${r.id}|${cleanTitle(r.title)}${r.url ? `|${r.url}` : ""}>`;

export function parseRef(token: string): Ref | null {
  const m = ONE.exec(token);
  return m ? { kind: m[1] as RefKind, id: m[2]!, title: m[3]!, ...(m[4] ? { url: m[4] } : {}) } : null;
}

export const parseRefs = (text: string): Ref[] => [...text.matchAll(new RegExp(REF_SOURCE, "g"))].map((m) => parseRef(m[0])!);

/** Where a chip opens: the public link if the sender made one, else the app (pages/app/open resolves it). */
export const refHref = (r: Ref, origin = "") => r.url ?? `${origin}/app/open/${r.kind}/${encodeURIComponent(r.id)}`;

/** Only our own public links may ride on a chip, so a chip named "Q3.pdf" can't point anywhere else. */
export const ownLink = (url: string, origin: string) => [`${origin.replace(/\/$/, "")}/s/`, `${origin.replace(/\/$/, "")}/n/`].some((p) => url.startsWith(p));

export function sanitizeRefs(text: string, origin: string) {
  return text.replace(new RegExp(REF_SOURCE, "g"), (tok) => {
    const r = parseRef(tok)!;
    return r.url && !ownLink(r.url, origin) ? refToken({ ...r, url: undefined }) : tok;
  });
}

/** Swaps an existing ref (same kind and id) for a new token, e.g. once a link was made. */
export const replaceRef = (text: string, r: Ref) =>
  text.replace(new RegExp(REF_SOURCE, "g"), (tok) => {
    const old = parseRef(tok)!;
    return old.kind === r.kind && old.id === r.id ? refToken(r) : tok;
  });

/**
 * The composer shows "@Title"; what was picked is kept as label → token, longest first so "@Q3 report final" wins
 * over "@Q3 report". Ids never come from re-reading names.
 */
export function encodePicked(text: string, picked: { label: string; token: string }[]) {
  let out = text;
  for (const p of [...picked].sort((a, b) => b.label.length - a.label.length)) {
    const escaped = p.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[^\\w<])@${escaped}(?![\\w])`, "g"), (_, pre: string) => `${pre}${p.token}`);
  }
  return out;
}
