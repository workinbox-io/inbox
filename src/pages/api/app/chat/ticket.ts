import { handler, json } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { chatTicket } from "@/lib/server/chat/channels";

/** A short-lived ticket for the org's chat socket (/chat-sync), asked for on every (re)connect. */
export const POST = handler(async (ctx) => json(await chatTicket(chatViewer(ctx))));
