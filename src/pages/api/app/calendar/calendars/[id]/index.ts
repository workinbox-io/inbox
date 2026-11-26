import { handler, json, parseBody } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { deleteCalendar, getCalendar, updateCalendar } from "@/lib/server/calendar/calendars";
import { calendarUpdateSchema } from "@/lib/validation-calendar";

export const GET = handler(async (ctx) => json(await getCalendar(calendarViewer(ctx), ctx.params.id!)));

export const PATCH = handler(async (ctx) => {
  const calendar = await updateCalendar(calendarViewer(ctx), ctx.params.id!, await parseBody(ctx.request, calendarUpdateSchema));
  ctx.audit("calendar.update", { target: calendar.name });
  return json(calendar);
});

export const DELETE = handler(async (ctx) => {
  const calendar = await deleteCalendar(calendarViewer(ctx), ctx.params.id!);
  ctx.audit("calendar.delete", { target: calendar.name });
  return json({ ok: true });
});
