import { z } from "zod";
import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { announce, clearReadNotifications, dismissNotifications, listNotifications, markAllNotifications, markNotifications, restoreNotifications } from "@/lib/server/notifications";

const viewer = (ctx: Parameters<Parameters<typeof handler>[0]>[0]) => {
  if (!ctx.locals.user || ctx.locals.apiKeyId) throw new HttpError(401, "Unauthorized");
  return { orgId: ctx.orgId, userId: ctx.locals.user.id, role: ctx.role };
};

/** The bell: groups from mail, chat and the other apps. `?filter=all|unread|mentions`. */
export const GET = handler(async (ctx) => {
  const filter = ctx.url.searchParams.get("filter");
  return json(await listNotifications(viewer(ctx), filter === "unread" || filter === "mentions" ? filter : "all"));
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), keys: z.array(z.string().min(3).max(200)).min(1).max(100) }),
  z.object({ action: z.literal("unread"), keys: z.array(z.string().min(3).max(200)).min(1).max(100) }),
  z.object({ action: z.literal("dismiss"), keys: z.array(z.string().min(3).max(200)).min(1).max(100) }),
  z.object({ action: z.literal("snooze"), keys: z.array(z.string().min(3).max(200)).min(1).max(100), until: z.number().int().positive() }),
  z.object({ action: z.literal("mute"), keys: z.array(z.string().min(3).max(200)).min(1).max(100) }),
  z.object({ action: z.literal("restore"), keys: z.array(z.string().min(3).max(200)).min(1).max(100) }),
  z.object({ action: z.literal("readAll") }),
  z.object({ action: z.literal("clearRead") }),
]);

/** Read, unread, dismiss (done), snooze, mute, restore; everything read; read ones cleared. */
export const POST = handler(async (ctx) => {
  const v = viewer(ctx);
  const input = await parseBody(ctx.request, body);
  if (input.action === "readAll") await markAllNotifications(v);
  else if (input.action === "clearRead") await clearReadNotifications(v);
  else if (input.action === "dismiss") await dismissNotifications(v, input.keys);
  else if (input.action === "snooze") {
    if (input.until <= Date.now()) throw new HttpError(422, "Pick a time in the future");
    await dismissNotifications(v, input.keys, { until: input.until });
  } else if (input.action === "mute") await dismissNotifications(v, input.keys, { muted: true });
  else if (input.action === "restore") await restoreNotifications(v, input.keys);
  else await markNotifications(v, input.keys, input.action === "read");
  await announce(v.orgId, [v.userId]);
  return json({ ok: true });
});
