import { HttpError, handler, json } from "@/lib/server/api";
import { getCollection, getRecord, recordBacklinks } from "@/lib/server/collections";

export const GET = handler(async ({ orgId, role, locals, params }) => {
  const userId = locals.user?.id;
  if (!userId) throw new HttpError(403, "Needs a signed-in person");
  const collection = await getCollection({ orgId, role, userId }, params.id!);
  await getRecord(orgId, collection.id, params.recordId!);
  return json(await recordBacklinks({ orgId, role, userId }, params.recordId!));
});
