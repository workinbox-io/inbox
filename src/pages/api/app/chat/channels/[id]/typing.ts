import { handler, json, parseBody } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { typing } from "@/lib/server/chat/channels";
import { typingSchema } from "@/lib/validation-chat";

export const POST = handler(async (ctx) => {
  const { parentId } = await parseBody(ctx.request, typingSchema);
  await typing(chatViewer(ctx), ctx.params.id!, parentId ?? null);
  return json({ ok: true });
});
