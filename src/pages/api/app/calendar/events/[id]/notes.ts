import { handler, HttpError, json } from "@/lib/server/api";
import { calendarViewer } from "@/lib/server/calendar/access";
import { meetingNote } from "@/lib/server/calendar/meeting-notes";

/** ?occurrence=<original start ms> picks one occurrence of a series. */
function occurrence(url: URL) {
  const raw = url.searchParams.get("occurrence");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(422, "Invalid occurrence");
  return n;
}

/** The event's meeting note, if any: { note: { id, title } | null }. */
export const GET = handler(async (ctx) => json({ note: await meetingNote(calendarViewer(ctx), ctx.params.id!, occurrence(ctx.url), false) }));

/** Opens the meeting note (the viewer joins its people), making it first when there's none. */
export const POST = handler(async (ctx) => {
  const note = await meetingNote(calendarViewer(ctx), ctx.params.id!, occurrence(ctx.url), true);
  if (note!.created) ctx.audit("note.create", { target: note!.title, details: { event: ctx.params.id } });
  return json({ note });
});
