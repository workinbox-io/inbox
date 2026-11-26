/**
 * Who sees which chat channel: every public channel of the org, plus private channels and DMs the viewer is a member
 * of. Owners and admins get no way into private channels or DMs (like private notes). Every chat query goes through
 * `visibleChannelIds` or `requireChannel`.
 */
import { and, chatChannels, chatMembers, db, eq, or, sql } from "@/db";
import { HttpError, type HandlerContext } from "@/lib/server/api";
import type { OrgRole } from "@/lib/server/roles";

export interface ChatViewer {
  orgId: string;
  userId: string;
  role: OrgRole;
}

export type Channel = typeof chatChannels.$inferSelect;
export type Membership = typeof chatMembers.$inferSelect;

export function chatViewer(ctx: Pick<HandlerContext, "locals" | "orgId" | "role">): ChatViewer {
  const user = ctx.locals.user;
  // API keys have no person to post as or to keep unread counts for.
  if (ctx.locals.apiKeyId || !user) throw new HttpError(403, "Chat needs a signed-in person");
  return { orgId: ctx.orgId, userId: user.id, role: ctx.role };
}

/** WHERE for the channels a viewer may open. */
export const visibleWhere = (v: ChatViewer) =>
  and(
    eq(chatChannels.orgId, v.orgId),
    or(
      and(eq(chatChannels.kind, "channel"), eq(chatChannels.private, false)),
      sql`${chatChannels.id} IN (SELECT channel_id FROM chat_members WHERE user_id = ${v.userId} AND org_id = ${v.orgId})`,
    ),
  )!;

export async function visibleChannelIds(v: ChatViewer) {
  const rows = await db.select({ id: chatChannels.id }).from(chatChannels).where(visibleWhere(v));
  return new Set(rows.map((r) => r.id));
}

/** The channel and the viewer's membership; 404 when they can't see it, 403 when `member` is needed and missing. */
export async function requireChannel(v: ChatViewer, id: string, opts: { member?: boolean } = {}) {
  const [row] = await db
    .select({ channel: chatChannels, membership: chatMembers })
    .from(chatChannels)
    .leftJoin(chatMembers, and(eq(chatMembers.channelId, chatChannels.id), eq(chatMembers.userId, v.userId)))
    .where(and(eq(chatChannels.id, id), eq(chatChannels.orgId, v.orgId)));
  if (!row) throw new HttpError(404, "Channel not found");
  const visible = row.membership || (row.channel.kind === "channel" && !row.channel.private);
  if (!visible) throw new HttpError(404, "Channel not found");
  if (opts.member && !row.membership) throw new HttpError(403, "Join the channel first");
  return { channel: row.channel, membership: row.membership };
}

/** Who gets live events of a channel: everyone for public channels, the members otherwise. */
export async function audience(channel: Channel): Promise<string[] | undefined> {
  if (channel.kind === "channel" && !channel.private) return undefined;
  const rows = await db.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.channelId, channel.id));
  return rows.map((r) => r.userId);
}
