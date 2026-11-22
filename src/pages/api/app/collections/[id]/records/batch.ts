import { handler, json, parseBody } from "@/lib/server/api";
import { batchRecords, getCollection } from "@/lib/server/collections";
import { recordBatchSchema } from "@/lib/validation-collections";

/** POST { ids, values?, positions?, cycle?, delete? | restore? | purge? | accept? }: the selection changed at once. */
export const POST = handler(async ({ request, orgId, role, locals, params, audit }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, "edit");
  const input = await parseBody(request, recordBatchSchema);
  const result = await batchRecords(orgId, collection, locals.user?.id ?? null, input);
  const action = input.purge ? "collection_record.purge" : input.delete ? "collection_record.delete" : input.restore ? "collection_record.restore" : "collection_record.update";
  audit(action, { target: `${input.ids.length} records`, details: { collection: collection.name } });
  return json(result);
});
