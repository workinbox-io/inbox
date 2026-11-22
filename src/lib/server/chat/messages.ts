/**
 * Chat messages: pages of a channel, threads, send/edit/delete, reactions, saved and pinned, the Threads, Mentions
 * and Saved views. Every write publishes an event to the org's ChatRoom; DMs and mentions push to whoever has no
 * socket open.
 */
import { t } from "@/lib/i18n/panel";
import {
  and,
  asc,
  chatChannels,
  chatFollows,
  chatMembers,
  chatMentions,
  chatMessages,
  chatPins,
  chatReactions,
  chatSaved,
  db,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  member,
  lt,
  or,
  sql,
  user,
} from "@/db";
import type { ChatFile } from "@/db/schema/chat";
import { HttpError } from "@/lib/server/api";
import { canManage } from "@/lib/server/roles";
import { pushToUser } from "@/lib/server/mail/push";
import { isOrgAttachmentUrl } from "@/lib/uploads";
import { mentionedIds, plainChat } from "@/lib/chat/format";
import { sanitizeRefs } from "@/lib/mentions";
import { env } from "cloudflare:workers";
import type { ChatHit, ChatMessage, ChatView, Reaction } from "@/lib/chat/types";
import { audience, requireChannel, visibleChannelIds, type Channel, type ChatViewer } from "./access";
import { publish } from "./sync";

type Row = typeof chatMessages.$inferSelect;

/** Adds reactions, repliers, saved and pinned to rows (one query each, ids stay under D1's bound-parameter limit). */
async function hydrate(v: ChatViewer, rows: Row[]): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  for (let i = 0; i < rows.length; i += 80) {
    const part = rows.slice(i, i + 80);
    const ids = part.map((r) => r.id);
    if (!ids.length) continue;
    const roots = part.filter((r) => r.replyCount > 0).map((r) => r.id);
    const [reactions, saved, pins, repliers] = await Promise.all([
      db.select().from(chatReactions).where(inArray(chatReactions.messageId, ids)).orderBy(asc(chatReactions.createdAt)),
      db.select({ id: chatSaved.messageId }).from(chatSaved).where(and(eq(chatSaved.userId, v.userId), inArray(chatSaved.messageId, ids))),
      db.select({ id: chatPins.messageId }).from(chatPins).where(inArray(chatPins.messageId, ids)),
      roots.length
        ? db
            .selectDistinct({ parentId: chatMessages.parentId, authorId: chatMessages.authorId })
            .from(chatMessages)
            .where(and(inArray(chatMessages.parentId, roots), isNull(chatMessages.deletedAt)))
        : Promise.resolve([]),
    ]);
    const savedSet = new Set(saved.map((s) => s.id));
    const pinSet = new Set(pins.map((s) => s.id));
    for (const r of part) {
      const list: Reaction[] = [];
      for (const x of reactions.filter((x) => x.messageId === r.id)) {
        const hit = list.find((l) => l.emoji === x.emoji);
        if (hit) hit.userIds.push(x.userId);
        else list.push({ emoji: x.emoji, userIds: [x.userId] });
      }
      const deleted = !!r.deletedAt;
      out.push({
        id: r.id,
        channelId: r.channelId,
        parentId: r.parentId,
        authorId: r.authorId,
        text: deleted ? "" : r.text,
        files: deleted ? [] : (r.files ?? []),
        reactions: deleted ? [] : list,
        replyCount: r.replyCount,
        lastReplyAt: r.lastReplyAt?.getTime() ?? null,
        repliers: repliers
          .filter((x) => x.parentId === r.id && x.authorId)
          .map((x) => x.authorId!)
          .slice(0, 3),
        editedAt: r.editedAt?.getTime() ?? null,
        deleted,
        createdAt: r.createdAt.getTime(),
        saved: savedSet.has(r.id),
        pinned: pinSet.has(r.id),
      });
    }
  }
  return out;
}

/** A deleted message stays as "deleted" only while its thread has replies. */
const shown = or(isNull(chatMessages.deletedAt), gt(chatMessages.replyCount, 0));

export async function listMessages(v: ChatViewer, channelId: string, opts: { before?: number; q?: string; limit?: number }) {
  await requireChannel(v, channelId);
  const limit = opts.limit ?? 50;
  const rows = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.channelId, channelId),
        opts.q ? isNull(chatMessages.deletedAt) : isNull(chatMessages.parentId),
        shown,
        opts.before ? lt(chatMessages.createdAt, new Date(opts.before)) : undefined,
        // shortcut: LIKE scan of one channel, move to FTS5 when channels get big.
        opts.q ? like(chatMessages.text, `%${opts.q.replace(/[%_]/g, "")}%`) : undefined,
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit + 1);
  const messages = await hydrate(v, rows.slice(0, limit).reverse());
  return { messages, hasMore: rows.length > limit };
}

export async function listPins(v: ChatViewer, channelId: string) {
  await requireChannel(v, channelId);
  const rows = await db
    .select({ m: chatMessages })
    .from(chatPins)
    .innerJoin(chatMessages, eq(chatMessages.id, chatPins.messageId))
    .where(and(eq(chatPins.channelId, channelId), isNull(chatMessages.deletedAt)))
    .orderBy(desc(chatPins.createdAt));
  return hydrate(
    v,
    rows.map((r) => r.m),
  );
}

async function requireMessage(v: ChatViewer, id: string) {
  const [row] = await db.select().from(chatMessages).where(and(eq(chatMessages.id, id), eq(chatMessages.orgId, v.orgId)));
  if (!row) throw new HttpError(404, "Message not found");
  const { channel, membership } = await requireChannel(v, row.channelId);
  return { row, channel, membership };
}

/** The thread: its first message and the replies. Marks it read for the viewer. */
export async function getThread(v: ChatViewer, id: string) {
  const { row } = await requireMessage(v, id);
  if (row.parentId) throw new HttpError(422, "Not the start of a thread");
  const replies = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.parentId, id), isNull(chatMessages.deletedAt)))
    .orderBy(asc(chatMessages.createdAt))
    .limit(1000);
  await db.update(chatFollows).set({ lastReadAt: new Date() }).where(and(eq(chatFollows.userId, v.userId), eq(chatFollows.messageId, id)));
  const [root, ...rest] = await hydrate(v, [row, ...replies]);
  return { root: root!, replies: rest };
}

/** Mentions only count for people who can read the channel. */
async function mentionable(channel: Channel, ids: string[]) {
  if (!ids.length) return [];
  const to = await audience(channel);
  if (to) return ids.filter((id) => to.includes(id));
  const rows = await db
    .select({ id: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, channel.orgId), inArray(member.userId, ids.slice(0, 50))));
  return rows.map((r) => r.id);
}

const MAX_TEXT = 40_000;

function cleanFiles(v: ChatViewer, files: ChatFile[] | undefined) {
  return (files ?? []).filter((f) => isOrgAttachmentUrl(f.url, v.orgId)).slice(0, 10);
}

export async function sendMessage(v: ChatViewer, input: { channelId: string; parentId?: string | null; text: string; files?: ChatFile[] }) {
  const { channel, membership } = await requireChannel(v, input.channelId);
  if (channel.archivedAt) throw new HttpError(422, "This channel is archived");
  const text = sanitizeRefs(input.text.trim().slice(0, MAX_TEXT), env.PUBLIC_APP_URL);
  const files = cleanFiles(v, input.files);
  if (!text && !files.length) throw new HttpError(422, "Write something first");
  let root: Row | null = null;
  if (input.parentId) {
    [root] = await db.select().from(chatMessages).where(and(eq(chatMessages.id, input.parentId), eq(chatMessages.channelId, channel.id), isNull(chatMessages.parentId)));
    if (!root) throw new HttpError(404, "Thread not found");
  }
  const mentioned = (await mentionable(channel, mentionedIds(text))).filter((id) => id !== v.userId);
  const id = crypto.randomUUID();
  const now = new Date();
  const followers = root ? [...new Set([v.userId, root.authorId ?? v.userId, ...mentioned])] : mentioned.length ? [v.userId, ...mentioned] : [];
  await db.batch([
    db.insert(chatMessages).values({ id, orgId: v.orgId, channelId: channel.id, parentId: root?.id ?? null, authorId: v.userId, text, files, createdAt: now }),
    // Posting in a public channel joins it, like Slack.
    ...(membership ? [] : [db.insert(chatMembers).values({ channelId: channel.id, userId: v.userId, orgId: v.orgId }).onConflictDoNothing()]),
    ...mentioned.map((userId) => db.insert(chatMentions).values({ messageId: id, userId, channelId: channel.id, createdAt: now })),
    root
      ? db
          .update(chatMessages)
          .set({ replyCount: sql`${chatMessages.replyCount} + 1`, lastReplyAt: now })
          .where(eq(chatMessages.id, root.id))
      : db.update(chatChannels).set({ lastMessageAt: now }).where(eq(chatChannels.id, channel.id)),
    ...followers.map((userId) =>
      db
        .insert(chatFollows)
        .values({ userId, messageId: root?.id ?? id, lastReadAt: userId === v.userId ? now : new Date(0) })
        .onConflictDoNothing(),
    ),
    ...(root ? [db.update(chatFollows).set({ lastReadAt: now }).where(and(eq(chatFollows.userId, v.userId), eq(chatFollows.messageId, root.id)))] : []),
    db
      .update(chatMembers)
      .set({ lastReadAt: now })
      .where(and(eq(chatMembers.channelId, channel.id), eq(chatMembers.userId, v.userId))),
  ]);
  const [message] = await hydrate(v, [(await db.select().from(chatMessages).where(eq(chatMessages.id, id)))[0]!]);
  const to = await audience(channel);
  const online = await publish(v.orgId, { type: "message", message: message! }, to);
  if (root) {
    const [updated] = await hydrate(v, [(await db.select().from(chatMessages).where(eq(chatMessages.id, root.id)))[0]!]);
    await publish(v.orgId, { type: "message.updated", message: { ...updated!, saved: false } }, to);
  }
  if (!membership) await publish(v.orgId, { type: "channel", channelId: channel.id }, [v.userId]);
  await notify(v, channel, message!, mentioned, online);
  return message!;
}

/** Push for DMs and mentions to people without an open chat socket, unless they muted the conversation. */
async function notify(v: ChatViewer, channel: Channel, message: ChatMessage, mentioned: string[], online: Set<string>) {
  const targets = new Set(mentioned);
  if (channel.kind === "dm") for (const id of (await audience(channel)) ?? []) targets.add(id);
  targets.delete(v.userId);
  if (!targets.size) return;
  // Their bell and Chat badge recount; plain channel messages don't change either.
  await publish(v.orgId, { type: "notification" }, [...targets]);
  const muted = await db
    .select({ userId: chatMembers.userId })
    .from(chatMembers)
    .where(and(eq(chatMembers.channelId, channel.id), eq(chatMembers.muted, true)));
  for (const m of muted) if (!mentioned.includes(m.userId)) targets.delete(m.userId);
  for (const userId of targets) {
    if (online.has(userId)) continue;
    await pushToUser(v.orgId, userId, { kind: "chat", messageId: message.id }).catch((e) => console.error("[chat] push", e));
  }
}

async function broadcastUpdate(v: ChatViewer, channel: Channel, id: string) {
  const [row] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
  if (!row) return null;
  const [message] = await hydrate(v, [row]);
  // `saved` is per person: listeners keep their own.
  await publish(v.orgId, { type: "message.updated", message: { ...message!, saved: false } }, await audience(channel));
  return message!;
}

export async function editMessage(v: ChatViewer, id: string, text: string) {
  const { row, channel } = await requireMessage(v, id);
  if (row.authorId !== v.userId || row.deletedAt) throw new HttpError(403, "You can only edit your own messages");
  const clean = sanitizeRefs(text.trim().slice(0, MAX_TEXT), env.PUBLIC_APP_URL);
  if (!clean && !row.files?.length) throw new HttpError(422, "Write something first");
  const mentioned = (await mentionable(channel, mentionedIds(clean))).filter((u) => u !== v.userId);
  await db.batch([
    db.update(chatMessages).set({ text: clean, editedAt: new Date() }).where(eq(chatMessages.id, id)),
    db.delete(chatMentions).where(eq(chatMentions.messageId, id)),
    ...mentioned.map((userId) => db.insert(chatMentions).values({ messageId: id, userId, channelId: channel.id, createdAt: row.createdAt })),
  ]);
  return broadcastUpdate(v, channel, id);
}

export async function deleteMessage(v: ChatViewer, id: string) {
  const { row, channel } = await requireMessage(v, id);
  const mayModerate = channel.kind === "channel" && canManage(v.role);
  if (row.authorId !== v.userId && !mayModerate) throw new HttpError(403, "You can only delete your own messages");
  await db.batch([
    db.update(chatMessages).set({ deletedAt: new Date(), text: "", files: [] }).where(eq(chatMessages.id, id)),
    db.delete(chatMentions).where(eq(chatMentions.messageId, id)),
    db.delete(chatPins).where(eq(chatPins.messageId, id)),
    db.delete(chatReactions).where(eq(chatReactions.messageId, id)),
    ...(row.parentId
      ? [
          db
            .update(chatMessages)
            .set({ replyCount: sql`max(${chatMessages.replyCount} - 1, 0)` })
            .where(eq(chatMessages.id, row.parentId)),
        ]
      : []),
  ]);
  const to = await audience(channel);
  await publish(v.orgId, { type: "message.deleted", id, channelId: channel.id, parentId: row.parentId }, to);
  if (row.parentId) await broadcastUpdate(v, channel, row.parentId);
}

export type MessagePatch = { action: "edit"; text: string } | { action: "react"; emoji: string } | { action: "save"; saved: boolean } | { action: "pin"; pinned: boolean };

export async function patchMessage(v: ChatViewer, id: string, body: MessagePatch) {
  if (body.action === "edit") return editMessage(v, id, body.text);
  const { row, channel } = await requireMessage(v, id);
  if (row.deletedAt) throw new HttpError(422, "This message was deleted");
  if (body.action === "save") {
    if (body.saved) await db.insert(chatSaved).values({ userId: v.userId, messageId: id }).onConflictDoNothing();
    else await db.delete(chatSaved).where(and(eq(chatSaved.userId, v.userId), eq(chatSaved.messageId, id)));
    const [message] = await hydrate(v, [row]);
    return message!;
  }
  if (body.action === "pin") {
    if (body.pinned) await db.insert(chatPins).values({ channelId: channel.id, messageId: id, pinnedBy: v.userId }).onConflictDoNothing();
    else await db.delete(chatPins).where(and(eq(chatPins.channelId, channel.id), eq(chatPins.messageId, id)));
  } else {
    const mine = and(eq(chatReactions.messageId, id), eq(chatReactions.userId, v.userId), eq(chatReactions.emoji, body.emoji));
    const [had] = await db.select({ e: chatReactions.emoji }).from(chatReactions).where(mine);
    if (had) await db.delete(chatReactions).where(mine);
    else await db.insert(chatReactions).values({ messageId: id, userId: v.userId, emoji: body.emoji }).onConflictDoNothing();
  }
  const message = await broadcastUpdate(v, channel, id);
  return { ...message!, saved: (await db.select().from(chatSaved).where(and(eq(chatSaved.userId, v.userId), eq(chatSaved.messageId, id)))).length > 0 };
}

/** Threads I follow, messages that mention me, messages I saved; newest first, in channels I can still see. */
export async function listView(v: ChatViewer, view: ChatView): Promise<ChatHit[]> {
  const visible = await visibleChannelIds(v);
  let pairs: { row: Row; unread?: boolean }[];
  if (view === "threads") {
    const rows = await db
      .select({ m: chatMessages, readAt: chatFollows.lastReadAt })
      .from(chatFollows)
      .innerJoin(chatMessages, eq(chatMessages.id, chatFollows.messageId))
      .where(and(eq(chatFollows.userId, v.userId), eq(chatMessages.orgId, v.orgId), gt(chatMessages.replyCount, 0)))
      .orderBy(desc(chatMessages.lastReplyAt))
      .limit(50);
    pairs = rows.map((r) => ({ row: r.m, unread: (r.m.lastReplyAt?.getTime() ?? 0) > r.readAt.getTime() }));
  } else {
    const table = view === "mentions" ? chatMentions : chatSaved;
    const rows = await db
      .select({ m: chatMessages })
      .from(table)
      .innerJoin(chatMessages, eq(chatMessages.id, table.messageId))
      .where(and(eq(table.userId, v.userId), eq(chatMessages.orgId, v.orgId), isNull(chatMessages.deletedAt)))
      .orderBy(desc(table.createdAt))
      .limit(50);
    pairs = rows.map((r) => ({ row: r.m }));
  }
  pairs = pairs.filter((p) => visible.has(p.row.channelId));
  const messages = await hydrate(
    v,
    pairs.map((p) => p.row),
  );
  const rootIds = [...new Set(pairs.map((p) => p.row.parentId).filter((x): x is string => !!x))];
  const roots = rootIds.length ? await hydrate(v, await db.select().from(chatMessages).where(inArray(chatMessages.id, rootIds.slice(0, 80)))) : [];
  return messages.map((message, i) => ({ message, root: roots.find((r) => r.id === message.parentId), unread: pairs[i]!.unread }));
}

export async function viewCounts(v: ChatViewer) {
  const [threads] = await db
    .select({ n: sql<number>`count(*)` })
    .from(chatFollows)
    .innerJoin(chatMessages, eq(chatMessages.id, chatFollows.messageId))
    .where(and(eq(chatFollows.userId, v.userId), eq(chatMessages.orgId, v.orgId), gt(chatMessages.lastReplyAt, chatFollows.lastReadAt)));
  return { threads: Number(threads?.n ?? 0) };
}

/** Title and text for a push notification, read with the session at display time (public/mail-sw.js). */
export async function pushPreview(v: ChatViewer, id: string) {
  const { row, channel } = await requireMessage(v, id);
  const people = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, [row.authorId ?? "", ...mentionedIds(row.text)].slice(0, 50)));
  const nameOf = (uid: string) => people.find((p) => p.id === uid)?.name;
  const author = nameOf(row.authorId ?? "") ?? "Someone";
  return {
    title: channel.kind === "dm" ? author : `${author} in #${channel.name}`,
    body: row.deletedAt ? "" : plainChat(row.text, nameOf).slice(0, 180) || "Sent a file",
    url: `/app/chat/${channel.id}?${row.parentId ? `thread=${row.parentId}&` : ""}m=${row.id}`,
  };
}

/** For MCP: recent messages across visible channels whose text contains `q`. */
export async function searchMessages(v: ChatViewer, q: string, limit = 20) {
  const visible = [...(await visibleChannelIds(v))];
  if (!visible.length) return [];
  const rows = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.orgId, v.orgId),
        isNull(chatMessages.deletedAt),
        inArray(chatMessages.channelId, visible.slice(0, 90)),
        like(chatMessages.text, `%${q.replace(/[%_]/g, "")}%`),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return hydrate(v, rows);
}

/**
 * Chat items for the notification bell (components/mailbox/notification-center.tsx): messages that mention the viewer
 * and direct messages from others, newest first. Read once the viewer has seen the channel (or the thread, for
 * replies): the same `last_read_at` as the unread counts, so no separate table.
 */
export async function chatNotifications(v: ChatViewer, limit = 30) {
  const visible = await visibleChannelIds(v);
  const [mentions, dms] = await Promise.all([
    db
      .select({ m: chatMessages })
      .from(chatMentions)
      .innerJoin(chatMessages, eq(chatMessages.id, chatMentions.messageId))
      .where(and(eq(chatMentions.userId, v.userId), eq(chatMessages.orgId, v.orgId), isNull(chatMessages.deletedAt)))
      .orderBy(desc(chatMentions.createdAt))
      .limit(limit),
    db
      .select({ m: chatMessages })
      .from(chatMessages)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .innerJoin(chatMembers, and(eq(chatMembers.channelId, chatChannels.id), eq(chatMembers.userId, v.userId)))
      .where(
        and(
          eq(chatChannels.orgId, v.orgId),
          eq(chatChannels.kind, "dm"),
          eq(chatMembers.muted, false),
          isNull(chatMessages.deletedAt),
          sql`${chatMessages.authorId} IS NOT ${v.userId}`,
        ),
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit),
  ]);
  const mentioned = new Set(mentions.map((r) => r.m.id));
  const rows = [...new Map([...mentions, ...dms].map((r) => [r.m.id, r.m])).values()]
    .filter((m) => visible.has(m.channelId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
  if (!rows.length) return { notifications: [], unread: 0 };
  const channelIds = [...new Set(rows.map((r) => r.channelId))];
  const rootIds = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))];
  const [channels, memberships, follows] = await Promise.all([
    db.select({ id: chatChannels.id, kind: chatChannels.kind, name: chatChannels.name }).from(chatChannels).where(inArray(chatChannels.id, channelIds)),
    db
      .select({ channelId: chatMembers.channelId, lastReadAt: chatMembers.lastReadAt })
      .from(chatMembers)
      .where(and(eq(chatMembers.userId, v.userId), inArray(chatMembers.channelId, channelIds))),
    rootIds.length
      ? db
          .select({ id: chatFollows.messageId, lastReadAt: chatFollows.lastReadAt })
          .from(chatFollows)
          .where(and(eq(chatFollows.userId, v.userId), inArray(chatFollows.messageId, rootIds)))
      : Promise.resolve([]),
  ]);
  const ids = [...new Set(rows.flatMap((r) => [r.authorId ?? "", ...mentionedIds(r.text)]))].filter(Boolean).slice(0, 90);
  const people = ids.length ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, ids)) : [];
  const person = (id: string | null) => people.find((p) => p.id === id);
  const notifications = rows.map((m) => {
    const c = channels.find((x) => x.id === m.channelId);
    const readAt = (m.parentId ? follows.find((f) => f.id === m.parentId)?.lastReadAt : memberships.find((x) => x.channelId === m.channelId)?.lastReadAt)?.getTime() ?? 0;
    const author = person(m.authorId);
    return {
      id: m.id,
      channelId: m.channelId,
      parentId: m.parentId,
      dm: c?.kind === "dm",
      mention: mentioned.has(m.id),
      createdAt: m.createdAt.getTime(),
      read: readAt >= m.createdAt.getTime(),
      sender: author?.email ?? "",
      senderName: author?.name ?? t("Former member"),
      title: c?.kind === "dm" ? t("Direct message") : m.parentId ? t("Thread in #{name}", { name: c?.name ?? "" }) : `#${c?.name ?? ""}`,
      preview: plainChat(m.text, (id) => person(id)?.name).slice(0, 300) || t("Sent a file"),
      href: `/app/chat/${m.channelId}?${m.parentId ? `thread=${m.parentId}&` : ""}m=${m.id}`,
    };
  });
  return { notifications, unread: notifications.filter((n) => !n.read).length };
}
