import { z } from "zod";
import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { NOTIFY_KINDS } from "@/lib/notifications";
import { getNotificationPrefs, saveNotificationPrefs } from "@/lib/server/notifications";

const me = (ctx: { locals: App.Locals }) => {
  if (!ctx.locals.user || ctx.locals.apiKeyId) throw new HttpError(401, "Unauthorized");
  return ctx.locals.user.id;
};

/** Settings → Notifications: the e-mail summary and the muted kinds. */
export const GET = handler(async (ctx) => json(await getNotificationPrefs(me(ctx))));

export const PUT = handler(async (ctx) =>
  json(await saveNotificationPrefs(me(ctx), await parseBody(ctx.request, z.object({ digest: z.boolean(), muted: z.array(z.enum(NOTIFY_KINDS)).max(NOTIFY_KINDS.length) })))),
);
