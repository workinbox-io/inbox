/**
 * Chat message text: a small markdown subset (`code`, **bold**, _italic_, links) and mentions stored as <@userId>,
 * so renaming someone never breaks old messages. Pure, rendered by components/chat/rich-text.tsx without HTML.
 */
export type ChatToken =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "link"; text: string }
  | { type: "mention"; userId: string };

const TOKEN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|(?<![\w])_[^_\n]+_(?![\w])|<@[0-9A-Za-z-]{1,64}>|https?:\/\/[^\s<>]+[^\s<>.,;:!?)\]'"])/g;

export function tokenize(text: string): ChatToken[] {
  const out: ChatToken[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const part = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", text: text.slice(last, at) });
    if (part.startsWith("`")) out.push({ type: "code", text: part.slice(1, -1) });
    else if (part.startsWith("**")) out.push({ type: "bold", text: part.slice(2, -2) });
    else if (part.startsWith("_")) out.push({ type: "italic", text: part.slice(1, -1) });
    else if (part.startsWith("<@")) out.push({ type: "mention", userId: part.slice(2, -1) });
    else out.push({ type: "link", text: part });
    last = at + part.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** The people a message mentions, once each. */
export const mentionedIds = (text: string) => [...new Set([...text.matchAll(/<@([0-9A-Za-z-]{1,64})>/g)].map((m) => m[1]!))];

/** Plain text for previews, push and MCP: mentions become @Name. */
export function plainChat(text: string, nameOf: (id: string) => string | undefined) {
  return tokenize(text)
    .map((t) => (t.type === "mention" ? `@${nameOf(t.userId) ?? "someone"}` : t.text))
    .join("");
}

/**
 * The composer writes "@Anna Nowak"; the server keeps ids. Longest names first, so "@Anna Nowak" wins over "@Anna".
 */
export function encodeMentions(text: string, people: { id: string; name: string }[]) {
  const sorted = [...people].filter((p) => p.name).sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const p of sorted) {
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[^\\w<])@${escaped}(?![\\w])`, "g"), `$1<@${p.id}>`);
  }
  return out;
}

/** The other way, for editing a message. */
export const decodeMentions = (text: string, nameOf: (id: string) => string | undefined) =>
  text.replace(/<@([0-9A-Za-z-]{1,64})>/g, (_, id: string) => `@${nameOf(id) ?? "someone"}`);
