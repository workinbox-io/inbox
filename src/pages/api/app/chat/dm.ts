import { handler, json, parseBody } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { openDm } from "@/lib/server/chat/channels";
import { dmSchema } from "@/lib/validation-chat";

/** The direct message with these people, made on first use. */
export const POST = handler(async (ctx) => json(await openDm(chatViewer(ctx), (await parseBody(ctx.request, dmSchema)).userIds)));
