import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { deleteEvent, getEvent, updateEvent } from "@/lib/server/calendar/events";
import { eventDeleteSchema, eventUpdateSchema } from "@/lib/validation-calendar";

export const GET = handler(async (ctx) => json(await getEvent(calendarViewer(ctx), ctx.params.id!)));

/** Body: the fields to change, plus `scope` (this|following|all) and `occurrence` (original start) for a series. */
export const PATCH = handler(async (ctx) => {
  const event = await updateEvent(calendarViewer(ctx), ctx.params.id!, await parseBody(ctx.request, eventUpdateSchema));
  ctx.audit("event.update", { target: event.title || event.id });
  return json(event);
});

/** ?scope=this|following|all&occurrence=<original start ms> */
export const DELETE = handler(async (ctx) => {
  const query = eventDeleteSchema.safeParse(Object.fromEntries(ctx.url.searchParams));
  if (!query.success) throw new HttpError(422, query.error.issues[0]?.message ?? "Invalid query");
  const event = await deleteEvent(calendarViewer(ctx), ctx.params.id!, query.data);
  ctx.audit("event.delete", { target: event.title || event.id, details: { scope: query.data.scope } });
  return json({ ok: true });
});
