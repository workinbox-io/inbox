import { handler, json } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { listChannels } from "@/lib/server/chat/channels";
import { viewCounts } from "@/lib/server/chat/messages";

/** Everything the rail needs: channels with unread counts and the Threads badge. */
export const GET = handler(async (ctx) => {
  const v = chatViewer(ctx);
  const [channels, counts] = await Promise.all([listChannels(v), viewCounts(v)]);
  return json({ channels, counts });
});
