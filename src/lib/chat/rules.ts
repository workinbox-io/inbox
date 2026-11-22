/** Pure chat rules shared by the server and the browser. */

export const CHAT_EMOJI = ["👍", "🔥", "🎉", "👀", "🙌", "😅", "✅", "❤️", "😂", "🙏", "💯", "🚀"] as const;
export const QUICK_EMOJI = ["✅", "👀", "🙌"] as const;

export const slugifyChannel = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** One DM per set of people, whoever starts it. */
export const dmKey = (ids: string[]) => [...new Set(ids)].sort().join(",");

/** A new block (author line and avatar) unless the same person wrote again within 5 minutes on the same day. */
export function startsGroup(
  prev: { authorId: string | null; createdAt: number; replyCount?: number } | undefined,
  m: { authorId: string | null; createdAt: number },
) {
  if (!prev || prev.authorId !== m.authorId || (prev.replyCount ?? 0) > 0) return true;
  if (m.createdAt - prev.createdAt > 5 * 60_000) return true;
  return new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
}

/** The first message after the reader's last visit that someone else wrote: where the "New" line goes. */
export function unreadMarker(messages: { id: string; authorId: string | null; createdAt: number }[], lastReadAt: number, me: string) {
  return messages.find((m) => m.createdAt > lastReadAt && m.authorId !== me)?.id ?? null;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

/** Adds or removes `me` under `emoji`, dropping emptied reactions. */
export function toggleReaction(list: Reaction[], emoji: string, me: string): Reaction[] {
  const hit = list.find((r) => r.emoji === emoji);
  if (!hit) return [...list, { emoji, userIds: [me] }];
  const who = hit.userIds.includes(me) ? hit.userIds.filter((u) => u !== me) : [...hit.userIds, me];
  return who.length ? list.map((r) => (r.emoji === emoji ? { ...r, userIds: who } : r)) : list.filter((r) => r.emoji !== emoji);
}
