import { z } from "zod";
import { REF_KINDS } from "@/lib/mentions";

export const refSchema = z.object({
  kind: z.enum(REF_KINDS),
  id: z.string().regex(/^[\w~-]{1,80}$/),
  title: z.string().max(500),
  url: z.string().url().max(500).optional(),
});

export const mentionAccessSchema = z.object({
  refs: z.array(refSchema).max(20),
  audience: z.object({ channelId: z.string().max(100).optional(), emails: z.array(z.string().trim().toLowerCase().email().max(254)).max(70).optional() }),
});

export const mentionShareSchema = z.object({
  ref: refSchema,
  action: z.enum(["grant", "live", "snapshot"]),
  userIds: z.array(z.string().max(100)).max(200).default([]),
  emails: z.array(z.string().trim().toLowerCase().email().max(254)).max(70).default([]),
  expiresAt: z.number().int().positive().nullable().optional(),
});
