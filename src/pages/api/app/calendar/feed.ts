import { handler, HttpError, json } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { feedToken, rotateFeed } from "@/lib/server/calendar/feed";

const url = (origin: string, token: string | null) => (token ? `${origin}/cal/${token}.ics` : null);

/** The viewer's secret subscription link, or null before they make one. */
export const GET = handler(async (ctx) => {
  const v = calendarViewer(ctx);
  return json({ url: v.userId ? url(ctx.url.origin, await feedToken(v)) : null });
});

/** Makes the link, or a new one (the old link stops working). */
export const POST = handler(async (ctx) => {
  const v = calendarViewer(ctx);
  if (!v.userId) throw new HttpError(403, "Sign in to make a subscription link");
  const token = await rotateFeed(v);
  ctx.audit("calendar.feed");
  return json({ url: url(ctx.url.origin, token) });
});
