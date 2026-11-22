/**
 * Team chat: channels (public or private) and direct messages, threads, reactions, mentions, saved and pinned
 * messages. D1 is the source of truth; the org's ChatRoom Durable Object (src/chat/room.ts) only fans events out.
 */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, id, organization, time, user } from "./core";

export interface ChatFile {
  url: string;
  name: string;
  size: number;
  type: string;
}

const orgRef = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const chatChannels = sqliteTable(
  "chat_channels",
  {
    id: id(),
    orgId: orgRef(),
    kind: text("kind", { enum: ["channel", "dm"] }).notNull().default("channel"),
    /** Slug for channels; DMs repeat their dm_key (the UI names them after the people). */
    name: text("name").notNull().default(""),
    topic: text("topic").notNull().default(""),
    private: integer("private", { mode: "boolean" }).notNull().default(false),
    /** DMs: the sorted member ids joined by ",", so one conversation per set of people. */
    dmKey: text("dm_key"),
    createdBy: text("created_by"),
    lastMessageAt: time("last_message_at"),
    archivedAt: time("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("chat_channels_org_idx").on(t.orgId, t.kind),
    uniqueIndex("chat_channels_name_idx").on(t.orgId, t.kind, t.name),
    uniqueIndex("chat_channels_dm_idx").on(t.orgId, t.dmKey),
  ],
);

export const chatMembers = sqliteTable(
  "chat_members",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: orgRef(),
    lastReadAt: time("last_read_at").notNull().$defaultFn(() => new Date()),
    muted: integer("muted", { mode: "boolean" }).notNull().default(false),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] }), index("chat_members_user_idx").on(t.userId, t.orgId)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    orgId: orgRef(),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    /** The thread's first message for replies; null for messages in the channel. */
    parentId: text("parent_id"),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    /** Mentions are stored as <@userId> (lib/chat/format.ts). */
    text: text("text").notNull().default(""),
    files: text("files", { mode: "json" }).$type<ChatFile[]>(),
    replyCount: integer("reply_count").notNull().default(0),
    lastReplyAt: time("last_reply_at"),
    editedAt: time("edited_at"),
    deletedAt: time("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_channel_idx").on(t.channelId, t.parentId, t.createdAt), index("chat_messages_org_idx").on(t.orgId, t.createdAt)],
);

export const chatReactions = sqliteTable(
  "chat_reactions",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

/** Who a message mentions: the Mentions view and the red badges. */
export const chatMentions = sqliteTable(
  "chat_mentions",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] }), index("chat_mentions_user_idx").on(t.userId, t.createdAt)],
);

export const chatSaved = sqliteTable(
  "chat_saved",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.messageId] })],
);

export const chatPins = sqliteTable(
  "chat_pins",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    pinnedBy: text("pinned_by"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.messageId] })],
);

/** Threads someone follows (started, replied, mentioned): the Threads view. */
export const chatFollows = sqliteTable(
  "chat_follows",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    lastReadAt: time("last_read_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.messageId] })],
);
