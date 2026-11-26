import { handler, json } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { chatNotifications } from "@/lib/server/chat/messages";

/** Mentions and direct messages for the notification bell. */
export const GET = handler(async (ctx) => json(await chatNotifications(chatViewer(ctx))));
