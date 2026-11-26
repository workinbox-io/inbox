import { HttpError, handler, json } from "@/lib/server/api";
import { disconnectApp } from "@/lib/server/oauth";

export const DELETE = handler(async ({ locals, params }) => {
  if (!(await disconnectApp(locals.user!.id, params.id ?? ""))) throw new HttpError(404, "Connection not found");
  return json({ ok: true });
});
