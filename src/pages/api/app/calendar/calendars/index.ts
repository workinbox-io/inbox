import { handler, json, parseBody } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { createCalendar, listCalendars } from "@/lib/server/calendar/calendars";
import { calendarSchema } from "@/lib/validation-calendar";

export const GET = handler(async (ctx) => json({ calendars: await listCalendars(calendarViewer(ctx)) }));

export const POST = handler(async (ctx) => {
  const calendar = await createCalendar(calendarViewer(ctx), await parseBody(ctx.request, calendarSchema));
  ctx.audit("calendar.create", { target: calendar.name });
  return json(calendar, 201);
});
