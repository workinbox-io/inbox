import { handler, HttpError, json } from "@/lib/server/api";
import { chatViewer } from "@/lib/server/chat/access";
import { listView } from "@/lib/server/chat/messages";
import { viewSchema } from "@/lib/validation-chat";

/** ?view=threads|mentions|saved */
export const GET = handler(async (ctx) => {
  const query = viewSchema.safeParse(Object.fromEntries(ctx.url.searchParams));
  if (!query.success) throw new HttpError(422, "Unknown view");
  return json({ hits: await listView(chatViewer(ctx), query.data.view) });
});
