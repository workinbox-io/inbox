import { handler, json, parseBody } from "@/lib/server/api";
import { createView, listViews } from "@/lib/server/collection-views";
import { getCollection } from "@/lib/server/collections";
import { viewCreateSchema } from "@/lib/validation-collections";

export const GET = handler(async ({ orgId, role, locals, params }) => {
  const viewer = { orgId, role, userId: locals.user?.id ?? null };
  return json({ views: await listViews(viewer, await getCollection(viewer, params.id!)) });
});

export const POST = handler(async ({ request, orgId, role, locals, params, audit }) => {
  const viewer = { orgId, role, userId: locals.user?.id ?? null };
  const collection = await getCollection(viewer, params.id!);
  const view = await createView(viewer, collection, await parseBody(request, viewCreateSchema));
  if (view.team) audit("collection_view.create", { target: view.name, details: { collection: collection.name } });
  return json(view, 201);
});
