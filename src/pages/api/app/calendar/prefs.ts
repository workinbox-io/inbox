import { handler, json, parseBody } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { getPrefs, savePrefs } from "@/lib/server/calendar/events";
import { prefsSchema } from "@/lib/validation-calendar";

/** The viewer's calendar settings: time zones (first = own), week start, working hours, default reminder. */
export const GET = handler(async (ctx) => json(await getPrefs(calendarViewer(ctx).userId)));

export const PUT = handler(async (ctx) => json(await savePrefs(calendarViewer(ctx).userId, await parseBody(ctx.request, prefsSchema))));
