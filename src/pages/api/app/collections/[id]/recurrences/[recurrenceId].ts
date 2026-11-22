import { handler, json } from "@/lib/server/api";
import { getCollection } from "@/lib/server/collections";
import { deleteRecurrence } from "@/lib/server/collection-planning";

export const DELETE = handler(async ({ orgId, role, locals, params, audit }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, "edit");
  await deleteRecurrence(orgId, collection.id, params.recurrenceId!);
  audit("collection_recurrence.delete", { target: collection.name });
  return json({ ok: true });
});
