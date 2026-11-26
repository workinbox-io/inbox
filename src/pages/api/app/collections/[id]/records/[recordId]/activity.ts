import { handler, json } from "@/lib/server/api";
import { listActivity } from "@/lib/server/collection-activity";
import { getCollection, getRecord } from "@/lib/server/collections";

/** The record's history, oldest first (the last 200 changes). */
export const GET = handler(async ({ orgId, role, locals, params }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!);
  await getRecord(orgId, collection.id, params.recordId!);
  return json({ activity: await listActivity(orgId, params.recordId!) });
});
