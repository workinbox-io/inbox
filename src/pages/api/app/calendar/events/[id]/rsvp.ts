import { handler, json, parseBody } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { rsvp } from "@/lib/server/calendar/events";
import { rsvpSchema } from "@/lib/validation-calendar";

/** The viewer's answer to an invitation: { status: accepted|declined|tentative }. */
export const POST = handler(async (ctx) => {
  const { status } = await parseBody(ctx.request, rsvpSchema);
  return json(await rsvp(calendarViewer(ctx), ctx.params.id!, status));
});
