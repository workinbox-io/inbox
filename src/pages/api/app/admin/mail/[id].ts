import { adminMailboxes, isAdmin } from "@/lib/server/admin";
import { getAdminThread } from "@/lib/server/admin-mail";
import { handler, HttpError, json } from "@/lib/server/api";

/** Staff only: a thread with its messages and the person's other threads; opening it marks it read. */
export const GET = handler(async ({ locals, params }) => {
  if (!isAdmin(locals.user)) throw new HttpError(404, "Not found");
  return json(await getAdminThread(params.id!, adminMailboxes()));
});
