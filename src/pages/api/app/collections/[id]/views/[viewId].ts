import { handler, json, parseBody } from "@/lib/server/api";
import { deleteView, updateView } from "@/lib/server/collection-views";
import { getCollection } from "@/lib/server/collections";
import { viewUpdateSchema } from "@/lib/validation-collections";

export const PATCH = handler(async ({ request, orgId, role, locals, params }) => {
  const viewer = { orgId, role, userId: locals.user?.id ?? null };
  return json(await updateView(viewer, await getCollection(viewer, params.id!), params.viewId!, await parseBody(request, viewUpdateSchema)));
});

export const DELETE = handler(async ({ orgId, role, locals, params, audit }) => {
  const viewer = { orgId, role, userId: locals.user?.id ?? null };
  const collection = await getCollection(viewer, params.id!);
  const view = await deleteView(viewer, collection, params.viewId!);
  if (!view.ownerId) audit("collection_view.delete", { target: view.name, details: { collection: collection.name } });
  return json({ ok: true });
});
