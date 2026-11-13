import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { getChannel, patchChannel } from "@/lib/server/chat/channels";
import { listMessages, listPins } from "@/lib/server/chat/messages";
import { channelPatchSchema, messageListSchema } from "@/lib/validation-chat";

/** The channel and a page of its messages: ?before=<ms>&q=&limit=. The first page also brings the pins. */
export const GET = handler(async (ctx) => {
  const query = messageListSchema.safeParse(Object.fromEntries(ctx.url.searchParams));
  if (!query.success) throw new HttpError(422, query.error.issues[0]?.message ?? "Invalid query");
  const v = chatViewer(ctx);
  const id = ctx.params.id!;
  const first = !query.data.before && !query.data.q;
  const [channel, page, pins] = await Promise.all([getChannel(v, id), listMessages(v, id, query.data), first ? listPins(v, id) : undefined]);
  return json({ channel, ...page, pins });
});

export const PATCH = handler(async (ctx) => {
  const body = await parseBody(ctx.request, channelPatchSchema);
  const channel = await patchChannel(chatViewer(ctx), ctx.params.id!, body);
  if (body.action === "update") ctx.audit("chat_channel.update", { target: channel ? `#${channel.name}` : ctx.params.id });
  if (body.action === "archive") ctx.audit("chat_channel.archive", { target: ctx.params.id });
  return json({ channel });
});
