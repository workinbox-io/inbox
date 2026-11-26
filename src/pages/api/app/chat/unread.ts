import { handler, json } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { unreadTotal } from "@/lib/server/chat/channels";

/** Unread DMs and mentions, for the "Chat" badge in the sidebar and app rail. */
export const GET = handler(async (ctx) => json({ total: await unreadTotal(chatViewer(ctx)) }));
