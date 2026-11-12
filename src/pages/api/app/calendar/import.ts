import { z } from "zod";
import { handler, json, parseBody } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { importIcs } from "@/lib/server/calendar/import";

const schema = z.object({ calendarId: z.string().min(1).max(100), ics: z.string().min(1).max(2_000_000, "The file is too large (2 MB at most)") });

/** Imports an .ics file's text into a calendar: { calendarId, ics } → { created, updated }. */
export const POST = handler(async (ctx) => {
  const { calendarId, ics } = await parseBody(ctx.request, schema);
  const result = await importIcs(calendarViewer(ctx), calendarId, ics);
  ctx.audit("calendar.import", { details: result });
  return json(result);
});
