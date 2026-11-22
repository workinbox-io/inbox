/** What the chat API returns (lib/server/chat/*) and the browser keeps (components/chat/*). Times are ms. */
import type { ChatFile } from "@/db/schema/chat";
import type { Reaction } from "./rules";

export type { ChatFile, Reaction };

export interface ChatPerson {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface ChatChannel {
  id: string;
  kind: "channel" | "dm";
  name: string;
  topic: string;
  private: boolean;
  /** Member ids (DMs: everyone in it). */
  memberIds: string[];
  joined: boolean;
  muted: boolean;
  unread: number;
  mentions: number;
  lastReadAt: number;
  lastMessageAt: number | null;
  createdBy: string | null;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  parentId: string | null;
  authorId: string | null;
  text: string;
  files: ChatFile[];
  reactions: Reaction[];
  replyCount: number;
  lastReplyAt: number | null;
  /** Up to three people who replied, for the thread summary. */
  repliers: string[];
  editedAt: number | null;
  deleted: boolean;
  createdAt: number;
  /** Per viewer. */
  saved: boolean;
  pinned: boolean;
}

export type ChatView = "threads" | "mentions" | "saved";

export interface ChatHit {
  message: ChatMessage;
  /** The thread's first message when `message` is a reply. */
  root?: ChatMessage;
  unread?: boolean;
}

/** Sent over the org's socket (src/chat/room.ts). */
export type ChatEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "message.updated"; message: ChatMessage }
  | { type: "message.deleted"; id: string; channelId: string; parentId: string | null }
  | { type: "channel"; channelId: string }
  | { type: "typing"; channelId: string; parentId: string | null; userId: string }
  | { type: "presence"; online: string[]; away: string[] }
  /** Something new for the bell (lib/server/notifications.ts); the browser refetches it. */
  | { type: "notification" }
  /** Records of a collection changed (lib/server/collections.ts `publishRecords`); open boards refetch them. */
  | { type: "collection"; collectionId: string; recordIds: string[]; deleted?: boolean; reload?: boolean; by: string | null };
