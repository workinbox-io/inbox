import { handler, json, parseBody } from "@/lib/server/api";
import { getCollection, importRecords } from "@/lib/server/collections";
import { recordImportSchema } from "@/lib/validation-collections";

/** Up to IMPORT_CHUNK spreadsheet rows (the browser maps the columns, lib/collections/csv.ts). */
export const POST = handler(async ({ request, orgId, role, params, locals, audit }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, "edit");
  const { rows } = await parseBody(request, recordImportSchema);
  // Whoever may change the fields also gets unknown choices added.
  const result = await importRecords(orgId, collection, locals.user?.id ?? null, rows, { addChoices: collection.canManage });
  if (result.created) audit("collection_record.import", { target: collection.name, details: { created: result.created, failed: result.failed.length } });
  return json(result);
});
