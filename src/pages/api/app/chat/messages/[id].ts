import { handler, json, parseBody } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { deleteMessage, getThread, patchMessage } from "@/lib/server/chat/messages";
import { messagePatchSchema } from "@/lib/validation-chat";

/** The thread that starts with this message. */
export const GET = handler(async (ctx) => json(await getThread(chatViewer(ctx), ctx.params.id!)));

/** Edit, react, save or pin: one `action` per request. */
export const PATCH = handler(async (ctx) => json(await patchMessage(chatViewer(ctx), ctx.params.id!, await parseBody(ctx.request, messagePatchSchema))));

export const DELETE = handler(async (ctx) => {
  await deleteMessage(chatViewer(ctx), ctx.params.id!);
  return json({ ok: true });
});
