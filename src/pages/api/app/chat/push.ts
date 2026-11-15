import { handler, HttpError, json } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { pushPreview } from "@/lib/server/chat/messages";

/** What a chat push shows, read with the session when it arrives (public/mail-sw.js): ?id=<message>&userId=<who it was for>. */
export const GET = handler(async (ctx) => {
  const v = chatViewer(ctx);
  const id = ctx.url.searchParams.get("id") ?? "";
  if (ctx.url.searchParams.get("userId") !== v.userId || !/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Not found");
  return json(await pushPreview(v, id));
});
