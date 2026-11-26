import { handler, json, parseBody } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { createChannel } from "@/lib/server/chat/channels";
import { channelCreateSchema } from "@/lib/validation-chat";

export const POST = handler(async (ctx) => {
  const channel = await createChannel(chatViewer(ctx), await parseBody(ctx.request, channelCreateSchema));
  ctx.audit("chat_channel.create", { target: `#${channel.name}` });
  return json(channel, 201);
});
