import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { createEvent, listEvents } from "@/lib/server/calendar/events";
import { eventListSchema, eventSchema } from "@/lib/validation-calendar";

const ids = (s?: string) => (s ? s.split(",").filter(Boolean) : undefined);

/** Events in [from, to) (ms), series expanded: ?from&to&calendars=a,b&people=userId,userId */
export const GET = handler(async (ctx) => {
  const query = eventListSchema.safeParse(Object.fromEntries(ctx.url.searchParams));
  if (!query.success) throw new HttpError(422, query.error.issues[0]?.message ?? "Invalid query");
  const { from, to, calendars, people } = query.data;
  return json({ events: await listEvents(calendarViewer(ctx), { from, to, calendars: ids(calendars), people: ids(people) }) });
});

export const POST = handler(async (ctx) => {
  const event = await createEvent(calendarViewer(ctx), await parseBody(ctx.request, eventSchema));
  ctx.audit("event.create", { target: event.title || event.id });
  return json(event, 201);
});
