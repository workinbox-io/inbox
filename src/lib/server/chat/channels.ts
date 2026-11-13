/** Chat channels and DMs: lists with unread counts, create, join/leave, read, mute, members, DMs. */
import { env } from "cloudflare:workers";
import { and, chatChannels, chatMembers, chatMentions, chatMessages, db, eq, gt, isNull, member, ne, sql } from "@/db";
import { HttpError } from "@/lib/server/api";
import { canManage } from "@/lib/server/roles";
import { dmKey, slugifyChannel } from "@/lib/chat/rules";
import { CHAT_TICKET_TTL_MS, signChatTicket } from "@/lib/chat/ticket";
import type { ChatChannel } from "@/lib/chat/types";
import { audience, requireChannel, visibleWhere, type Channel, type ChatViewer, type Membership } from "./access";
import { publish } from "./sync";

export const chatTicket = async (v: ChatViewer) => ({
  ticket: await signChatTicket({ orgId: v.orgId, userId: v.userId, exp: Date.now() + CHAT_TICKET_TTL_MS }, env.BETTER_AUTH_SECRET),
});

/** #general exists in every org and everyone lands in it on their first visit. */
async function ensureGeneral(v: ChatViewer) {
  let [general] = await db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .where(and(eq(chatChannels.orgId, v.orgId), eq(chatChannels.kind, "channel"), eq(chatChannels.name, "general")));
  if (!general) {
    await db
      .insert(chatChannels)
      .values({ orgId: v.orgId, name: "general", topic: "Everyone in the organization", createdBy: v.userId })
      .onConflictDoNothing();
    [general] = await db
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(and(eq(chatChannels.orgId, v.orgId), eq(chatChannels.kind, "channel"), eq(chatChannels.name, "general")));
  }
  if (!general) return;
  const [joined] = await db
    .select({ userId: chatMembers.userId })
    .from(chatMembers)
    .where(and(eq(chatMembers.channelId, general.id), eq(chatMembers.userId, v.userId)));
  if (!joined) await db.insert(chatMembers).values({ channelId: general.id, userId: v.userId, orgId: v.orgId, lastReadAt: new Date(0) }).onConflictDoNothing();
}

function summary(c: Channel, m: Membership | null, memberIds: string[], unread = 0, mentions = 0): ChatChannel {
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    topic: c.topic,
    private: c.private,
    memberIds,
    joined: !!m,
    muted: m?.muted ?? false,
    unread: m ? unread : 0,
    mentions: m ? mentions : 0,
    lastReadAt: m?.lastReadAt.getTime() ?? 0,
    lastMessageAt: c.lastMessageAt?.getTime() ?? null,
    createdBy: c.createdBy,
  };
}

/** Every channel the viewer can see, with their unread and mention counts. Archived ones are left out. */
export async function listChannels(v: ChatViewer): Promise<ChatChannel[]> {
  await ensureGeneral(v);
  const [rows, members, unread, mentions] = await Promise.all([
    db
      .select({ channel: chatChannels, membership: chatMembers })
      .from(chatChannels)
      .leftJoin(chatMembers, and(eq(chatMembers.channelId, chatChannels.id), eq(chatMembers.userId, v.userId)))
      .where(and(visibleWhere(v), isNull(chatChannels.archivedAt))),
    // shortcut: every membership row of the org, fine for teams of hundreds; per-channel counts in SQL when larger.
    db.select({ channelId: chatMembers.channelId, userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.orgId, v.orgId)),
    db
      .select({ channelId: chatMessages.channelId, n: sql<number>`count(*)` })
      .from(chatMessages)
      .innerJoin(chatMembers, and(eq(chatMembers.channelId, chatMessages.channelId), eq(chatMembers.userId, v.userId)))
      .where(
        and(
          isNull(chatMessages.parentId),
          isNull(chatMessages.deletedAt),
          gt(chatMessages.createdAt, chatMembers.lastReadAt),
          ne(chatMessages.authorId, v.userId),
        ),
      )
      .groupBy(chatMessages.channelId),
    db
      .select({ channelId: chatMentions.channelId, n: sql<number>`count(*)` })
      .from(chatMentions)
      .innerJoin(chatMembers, and(eq(chatMembers.channelId, chatMentions.channelId), eq(chatMembers.userId, v.userId)))
      .where(and(eq(chatMentions.userId, v.userId), gt(chatMentions.createdAt, chatMembers.lastReadAt)))
      .groupBy(chatMentions.channelId),
  ]);
  const byChannel = new Map<string, string[]>();
  for (const m of members) byChannel.set(m.channelId, [...(byChannel.get(m.channelId) ?? []), m.userId]);
  const unreadBy = new Map(unread.map((r) => [r.channelId, Number(r.n)]));
  const mentionsBy = new Map(mentions.map((r) => [r.channelId, Number(r.n)]));
  return rows
    .map((r) => summary(r.channel, r.membership, byChannel.get(r.channel.id) ?? [], unreadBy.get(r.channel.id), mentionsBy.get(r.channel.id)))
    .sort((a, b) => (a.kind === b.kind ? (a.kind === "dm" ? (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0) : a.name.localeCompare(b.name)) : a.kind === "channel" ? -1 : 1));
}

export async function getChannel(v: ChatViewer, id: string) {
  const { channel, membership } = await requireChannel(v, id);
  const members = await db.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.channelId, id));
  return summary(channel, membership, members.map((m) => m.userId));
}

/** Only people of this org. */
async function orgPeople(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ userId: member.userId }).from(member).where(eq(member.organizationId, orgId));
  const inOrg = new Set(rows.map((r) => r.userId));
  return [...new Set(ids)].filter((id) => inOrg.has(id));
}

async function channelChanged(v: ChatViewer, channel: Channel, extra: string[] = []) {
  const to = await audience(channel);
  await publish(v.orgId, { type: "channel", channelId: channel.id }, to ? [...to, ...extra] : undefined);
}

export async function createChannel(v: ChatViewer, input: { name: string; topic?: string; private?: boolean; memberIds?: string[] }) {
  const name = slugifyChannel(input.name);
  if (!name) throw new HttpError(422, "Give the channel a name");
  const [taken] = await db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .where(and(eq(chatChannels.orgId, v.orgId), eq(chatChannels.kind, "channel"), eq(chatChannels.name, name)));
  if (taken) throw new HttpError(409, `#${name} already exists`);
  const id = crypto.randomUUID();
  const people = await orgPeople(v.orgId, [v.userId, ...(input.memberIds ?? [])]);
  await db.batch([
    db.insert(chatChannels).values({ id, orgId: v.orgId, name, topic: input.topic ?? "", private: !!input.private, createdBy: v.userId }),
    ...people.map((userId) => db.insert(chatMembers).values({ channelId: id, userId, orgId: v.orgId })),
  ]);
  const created = await getChannel(v, id);
  await publish(v.orgId, { type: "channel", channelId: id }, created.private ? people : undefined);
  return created;
}

export type ChannelPatch =
  | { action: "update"; name?: string; topic?: string }
  | { action: "join" }
  | { action: "leave" }
  | { action: "read" }
  | { action: "mute"; muted: boolean }
  | { action: "members"; userIds: string[] }
  | { action: "archive" };

export async function patchChannel(v: ChatViewer, id: string, body: ChannelPatch) {
  const { channel, membership } = await requireChannel(v, id);
  const mine = and(eq(chatMembers.channelId, id), eq(chatMembers.userId, v.userId));
  switch (body.action) {
    case "join":
      if (channel.kind !== "channel" || channel.private) throw new HttpError(403, "Ask a member to add you");
      await db.insert(chatMembers).values({ channelId: id, userId: v.userId, orgId: v.orgId }).onConflictDoNothing();
      await channelChanged(v, channel);
      break;
    case "leave":
      if (channel.kind === "dm") throw new HttpError(422, "You can't leave a direct message");
      await db.delete(chatMembers).where(mine);
      await channelChanged(v, channel, [v.userId]);
      break;
    case "read":
      if (membership) await db.update(chatMembers).set({ lastReadAt: new Date() }).where(mine);
      break;
    case "mute":
      if (!membership) throw new HttpError(403, "Join the channel first");
      await db.update(chatMembers).set({ muted: body.muted }).where(mine);
      break;
    case "members": {
      if (!membership) throw new HttpError(403, "Join the channel first");
      if (channel.kind === "dm") throw new HttpError(422, "Start a new conversation to add people");
      const people = await orgPeople(v.orgId, body.userIds);
      const [first, ...rest] = people.map((userId) => db.insert(chatMembers).values({ channelId: id, userId, orgId: v.orgId }).onConflictDoNothing());
      if (first) await db.batch([first, ...rest]);
      await channelChanged(v, channel, people);
      break;
    }
    case "update": {
      if (channel.kind === "dm") throw new HttpError(422, "Direct messages have no name");
      if (!membership) throw new HttpError(403, "Join the channel first");
      const name = body.name === undefined ? undefined : slugifyChannel(body.name);
      if (name !== undefined && !name) throw new HttpError(422, "Give the channel a name");
      if (name && name !== channel.name) {
        if (channel.name === "general") throw new HttpError(422, "#general keeps its name");
        const [taken] = await db
          .select({ id: chatChannels.id })
          .from(chatChannels)
          .where(and(eq(chatChannels.orgId, v.orgId), eq(chatChannels.kind, "channel"), eq(chatChannels.name, name)));
        if (taken) throw new HttpError(409, `#${name} already exists`);
      }
      await db.update(chatChannels).set({ name, topic: body.topic }).where(eq(chatChannels.id, id));
      await channelChanged(v, channel);
      break;
    }
    case "archive":
      if (channel.kind === "dm" || channel.name === "general") throw new HttpError(422, "This conversation can't be archived");
      if (channel.createdBy !== v.userId && !canManage(v.role)) throw new HttpError(403, "Only whoever made the channel, owners and admins can archive it");
      await db.update(chatChannels).set({ archivedAt: new Date() }).where(eq(chatChannels.id, id));
      await channelChanged(v, channel);
      break;
  }
  return getChannel(v, id).catch(() => null);
}

/** The DM between the viewer and these people, made on first use. */
export async function openDm(v: ChatViewer, userIds: string[]) {
  const people = await orgPeople(v.orgId, [v.userId, ...userIds]);
  if (!people.includes(v.userId)) throw new HttpError(403, "Not a member of this organization");
  const key = dmKey(people);
  const find = () => db.select({ id: chatChannels.id }).from(chatChannels).where(and(eq(chatChannels.orgId, v.orgId), eq(chatChannels.dmKey, key)));
  let [dm] = await find();
  if (!dm) {
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(chatChannels).values({ id, orgId: v.orgId, kind: "dm", name: key, dmKey: key, private: true, createdBy: v.userId }).onConflictDoNothing(),
      ...people.map((userId) => db.insert(chatMembers).values({ channelId: id, userId, orgId: v.orgId }).onConflictDoNothing()),
    ]).catch(() => null); // someone opened the same DM at the same moment: theirs is found below
    [dm] = await find();
  }
  return getChannel(v, dm!.id);
}

/** "Someone is typing": to the channel's audience only, so private channel ids never reach others. */
export async function typing(v: ChatViewer, id: string, parentId: string | null) {
  const { channel } = await requireChannel(v, id);
  const to = await audience(channel);
  await publish(v.orgId, { type: "typing", channelId: id, parentId, userId: v.userId }, to?.filter((u) => u !== v.userId));
}
