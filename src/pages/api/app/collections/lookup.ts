import { handler, json } from "@/lib/server/api";
import { lookupRecords } from "@/lib/server/collection-relations";

/** `?ids=a,b`: records by id from any collection the viewer may open (relation fields show their titles). */
export const GET = handler(async ({ orgId, role, locals, url }) => {
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 200);
  return json({ records: ids.length ? await lookupRecords({ orgId, role, userId: locals.user?.id ?? null }, ids) : [] });
});
