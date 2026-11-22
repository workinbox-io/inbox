import { handler, json, manageHandler, parseBody } from "@/lib/server/api";
import { createCollection, listCollections } from "@/lib/server/collections";
import { collectionCreateSchema } from "@/lib/validation-collections";

/** The collections the caller may open. */
export const GET = handler(async ({ orgId, role, locals }) => json({ collections: await listCollections({ orgId, role, userId: locals.user?.id ?? null }) }));

/** Owners and admins: a new collection, blank or from a template, shared with the team until they change it. */
export const POST = manageHandler(async ({ request, orgId, role, locals, audit }) => {
  const collection = await createCollection({ orgId, role, userId: locals.user?.id ?? null }, await parseBody(request, collectionCreateSchema));
  audit("collection.create", { target: collection.name });
  return json(collection, 201);
});
