import { handler, json } from "@/lib/server/api";
import { deleteLink, getCollection } from "@/lib/server/collections";

export const DELETE = handler(async ({ orgId, role, locals, params }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, "edit");
  await deleteLink(orgId, collection, params.recordId!, params.linkId!, locals.user?.id ?? null);
  return json({ ok: true });
});
