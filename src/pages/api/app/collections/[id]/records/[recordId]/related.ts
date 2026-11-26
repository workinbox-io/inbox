import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { getCollection, getRecord } from "@/lib/server/collections";
import { addRelation, deleteRelation, relatedOf } from "@/lib/server/collection-relations";
import { relationSchema } from "@/lib/validation-collections";

/** The record's parent, sub-records, relations and the records linking to it from other collections. */
export const GET = handler(async ({ orgId, role, locals, params }) => {
  const v = { orgId, role, userId: locals.user?.id ?? null };
  return json(await relatedOf(v, await getCollection(v, params.id!), params.recordId!));
});

/** POST { to, kind }: blocks / blockedBy / related / duplicate. */
export const POST = handler(async ({ request, orgId, role, locals, params }) => {
  const v = { orgId, role, userId: locals.user?.id ?? null };
  const collection = await getCollection(v, params.id!, "edit");
  await getRecord(orgId, collection.id, params.recordId!);
  await addRelation(v, collection, params.recordId!, await parseBody(request, relationSchema));
  return json(await relatedOf(v, collection, params.recordId!), 201);
});

/** `?relation=<id>` */
export const DELETE = handler(async ({ orgId, role, locals, params, url }) => {
  const v = { orgId, role, userId: locals.user?.id ?? null };
  const collection = await getCollection(v, params.id!, "edit");
  const id = url.searchParams.get("relation");
  if (!id) throw new HttpError(400, "Which relation?");
  await deleteRelation(v, collection, params.recordId!, id);
  return json(await relatedOf(v, collection, params.recordId!));
});
