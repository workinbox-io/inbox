import { handler, json, parseBody } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { sendMessage } from "@/lib/server/chat/messages";
import { messageSendSchema } from "@/lib/validation-chat";

export const POST = handler(async (ctx) => json(await sendMessage(chatViewer(ctx), await parseBody(ctx.request, messageSendSchema)), 201));
