import { handler, json, parseBody } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { shareCalendar } from "@/lib/server/calendar/calendars";
import { noteShareSchema } from "@/lib/validation-notes";

/** Who may open the calendar (ShareDialog): private, chosen people (view or edit) or the whole team. */
export const PUT = handler(async (ctx) => {
  const input = await parseBody(ctx.request, noteShareSchema);
  const calendar = await shareCalendar(calendarViewer(ctx), ctx.params.id!, input);
  ctx.audit("calendar.share", { target: calendar.name, details: { sharing: input.sharing, people: input.people.length } });
  return json(calendar);
});
