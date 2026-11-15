import { and, db, eq, session } from "@/db";
import { HttpError, handler, json } from "@/lib/server/api";

/** Signs out one of the user's other sessions by id, so session tokens never reach the page. */
export const DELETE = handler(async ({ params, locals }) => {
  if (params.id === locals.session?.id) throw new HttpError(409, "Use Sign out to end this session.");
  const deleted = await db
    .delete(session)
    .where(and(eq(session.id, params.id ?? ""), eq(session.userId, locals.user!.id)))
    .returning({ id: session.id });
  if (!deleted.length) throw new HttpError(404, "Session not found");
  return json({ ok: true });
});
