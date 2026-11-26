import { handler, json, parseBody } from "@/lib/server/api";
import { deleteRecord, getCollection, getRecord, updateRecord } from "@/lib/server/collections";
import { recordUpdateSchema } from "@/lib/validation-collections";

/** `?deleted=1` also finds it in the trash. */
export const GET = handler(async ({ orgId, role, locals, params, url }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!);
  return json(await getRecord(orgId, collection.id, params.recordId!, { deleted: url.searchParams.get("deleted") === "1" }));
});

export const PATCH = handler(async ({ request, orgId, role, locals, params, audit }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, "edit");
  const record = await updateRecord(orgId, collection, params.recordId!, await parseBody(request, recordUpdateSchema), locals.user?.id ?? null);
  audit("collection_record.update", { target: record.title, details: { collection: collection.name } });
  return json(record);
});

export const DELETE = handler(async ({ orgId, role, locals, params, audit }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, "edit");
  const record = await deleteRecord(orgId, collection, params.recordId!, locals.user?.id ?? null);
  audit("collection_record.delete", { target: record.title, details: { collection: collection.name } });
  return json({ ok: true });
});
