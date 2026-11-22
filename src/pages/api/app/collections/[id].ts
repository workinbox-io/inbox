import { handler, json, parseBody } from "@/lib/server/api";
import { deleteCollection, getCollection, updateCollection } from "@/lib/server/collections";
import { collectionUpdateSchema } from "@/lib/validation-collections";

export const GET = handler(async ({ orgId, role, locals, params }) => json(await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!)));

/** Its owner (and owners and admins for team collections): name and fields. */
export const PATCH = handler(async ({ request, orgId, role, locals, params, audit }) => {
  const collection = await updateCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, await parseBody(request, collectionUpdateSchema));
  audit("collection.update", { target: collection.name });
  return json(collection);
});

/** Deletes the collection with all its records. */
export const DELETE = handler(async ({ orgId, role, locals, params, audit }) => {
  const collection = await deleteCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!);
  audit("collection.delete", { target: collection.name, details: { records: collection.count } });
  return json({ ok: true });
});
