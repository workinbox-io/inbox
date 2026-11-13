/**
 * MCP tools for team chat: the same lib/server/chat functions as /api/app/chat, as the signed-in person (API keys
 * have no person to read unread state or post as, so they get an error). Results carry names, never user ids.
 */
import { z } from "zod";
import { HttpError } from "@/lib/server/api";
import type { ChatViewer } from "@/lib/server/chat/access";
import { listChannels } from "@/lib/server/chat/channels";
import { listMessages, searchMessages, sendMessage } from "@/lib/server/chat/messages";
import { notePeople } from "@/lib/server/notes/notes";
import { encodeMentions, plainChat } from "@/lib/chat/format";
import type { ChatChannel, ChatMessage } from "@/lib/chat/types";
import { defineTool, type McpContext, type McpModule, type Tools } from "./define";

function viewer(ctx: McpContext): ChatViewer {
  if (!ctx.userId) throw new HttpError(403, "Chat tools need a signed-in person, not an API key");
  return { orgId: ctx.orgId, userId: ctx.userId, role: ctx.role };
}

async function context(v: ChatViewer) {
  const [people, channels] = await Promise.all([notePeople(v.orgId), listChannels(v)]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name;
  const label = (c: ChatChannel) =>
    c.kind === "channel" ? `#${c.name}` : `DM with ${c.memberIds.filter((id) => id !== v.userId).map((id) => nameOf(id) ?? "someone").join(", ") || "yourself"}`;
  const text = (m: ChatMessage) => ({
    from: (m.authorId && nameOf(m.authorId)) || "Former member",
    at: new Date(m.createdAt).toISOString(),
    text: plainChat(m.text, nameOf),
    files: m.files.map((f) => f.name),
    replies: m.replyCount || undefined,
    inThread: m.parentId ? true : undefined,
  });
  return { people, channels, label, text };
}

/** "#design", "design" or a person's name for their DM. */
function findChannel(channels: ChatChannel[], label: (c: ChatChannel) => string, name: string) {
  const want = name.trim().replace(/^#/, "").toLowerCase();
  const hit = channels.find((c) => (c.kind === "channel" ? c.name === want : label(c).toLowerCase() === `dm with ${want}`));
  if (!hit) throw new HttpError(404, `No conversation called ${name}. chat_list_channels shows them.`);
  return hit;
}

export const chatTools: Tools = {
  chat_list_channels: defineTool({
    title: "List chat channels",
    description: "The team chat channels and direct messages the person can see, with unread and mention counts and whether they joined.",
    input: z.object({}),
    async run(_input, ctx) {
      const { channels, label } = await context(viewer(ctx));
      return {
        channels: channels.map((c) => ({ name: label(c), topic: c.topic || undefined, private: c.private || undefined, joined: c.joined, unread: c.unread, mentions: c.mentions })),
      };
    },
  }),

  chat_read_channel: defineTool({
    title: "Read chat channel",
    description: "The latest messages of one channel (`#name`) or direct message (the other person's full name), oldest first, without thread replies.",
    input: z.object({ channel: z.string().max(120).describe("#channel-name, or a person's full name for their DM"), limit: z.number().int().min(1).max(100).optional() }),
    async run({ channel, limit }, ctx) {
      const v = viewer(ctx);
      const { channels, label, text } = await context(v);
      const c = findChannel(channels, label, channel);
      const page = await listMessages(v, c.id, { limit: limit ?? 30 });
      return { channel: label(c), topic: c.topic || undefined, messages: page.messages.filter((m) => !m.deleted).map(text), more: page.hasMore || undefined };
    },
  }),

  chat_search: defineTool({
    title: "Search chat",
    description: "Finds recent chat messages containing the words, across every channel and DM the person can see, newest first.",
    input: z.object({ q: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(50).optional() }),
    async run({ q, limit }, ctx) {
      const v = viewer(ctx);
      const { channels, label, text } = await context(v);
      const hits = await searchMessages(v, q, limit ?? 20);
      return { messages: hits.map((m) => ({ in: label(channels.find((c) => c.id === m.channelId)!), ...text(m) })) };
    },
  }),

  chat_post: defineTool({
    title: "Post to chat",
    description:
      "Posts a message as the person in a channel (`#name`) or DM (the other person's full name). Write @Full Name to mention someone. Everyone in the conversation sees it immediately; confirm the wording with the person first.",
    input: z.object({ channel: z.string().max(120), text: z.string().trim().min(1).max(4000) }),
    scope: "write",
    async run({ channel, text: body }, ctx) {
      const v = viewer(ctx);
      const { people, channels, label } = await context(v);
      const c = findChannel(channels, label, channel);
      await sendMessage(v, { channelId: c.id, text: encodeMentions(body, people) });
      return { posted: true, in: label(c) };
    },
  }),
};

export const chatModule: McpModule = {
  name: "chat",
  instructions: "Chat: the team's channels and DMs; chat_list_channels or chat_search first, and confirm wording before chat_post.",
  tools: chatTools,
};
