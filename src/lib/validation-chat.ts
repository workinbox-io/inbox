/** Request bodies of the chat API (/api/app/chat). */
import { z } from "zod";

const uuid = z.string().uuid();
const file = z.object({ url: z.string().max(500), name: z.string().max(200), size: z.number().int().nonnegative(), type: z.string().max(120) });

export const channelCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(250).optional(),
  private: z.boolean().optional(),
  memberIds: z.array(z.string().max(64)).max(200).optional(),
});

export const channelPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), name: z.string().trim().max(80).optional(), topic: z.string().trim().max(250).optional() }),
  z.object({ action: z.literal("join") }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("read") }),
  z.object({ action: z.literal("mute"), muted: z.boolean() }),
  z.object({ action: z.literal("members"), userIds: z.array(z.string().max(64)).min(1).max(200) }),
  z.object({ action: z.literal("archive") }),
]);

export const messageListSchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const messageSendSchema = z.object({
  channelId: uuid,
  parentId: uuid.nullable().optional(),
  text: z.string().max(40_000),
  files: z.array(file).max(10).optional(),
});

export const messagePatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), text: z.string().max(40_000) }),
  z.object({ action: z.literal("react"), emoji: z.string().min(1).max(16) }),
  z.object({ action: z.literal("save"), saved: z.boolean() }),
  z.object({ action: z.literal("pin"), pinned: z.boolean() }),
]);

export const dmSchema = z.object({ userIds: z.array(z.string().max(64)).min(1).max(8) });
export const typingSchema = z.object({ parentId: uuid.nullable().optional() });
export const viewSchema = z.object({ view: z.enum(["threads", "mentions", "saved"]) });
