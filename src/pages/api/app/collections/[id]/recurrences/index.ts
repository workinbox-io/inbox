import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { getCollection } from "@/lib/server/collections";
import { createRecurrence, listRecurrences } from "@/lib/server/collection-planning";
import { recurrenceSchema } from "@/lib/validation-collections";

export const GET = handler(async ({ orgId, role, locals, params }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!);
  return json({ recurrences: await listRecurrences(orgId, collection.id) });
});

/** POST { recordId, every, unit, start }: a copy of the record is made on that schedule, as the person who set it up. */
export const POST = handler(async ({ request, orgId, role, locals, params, audit }) => {
  const userId = locals.user?.id;
  if (!userId) throw new HttpError(403, "Repeating records need a signed-in person");
  const collection = await getCollection({ orgId, role, userId }, params.id!, "edit");
  const r = await createRecurrence(orgId, collection, userId, await parseBody(request, recurrenceSchema));
  audit("collection_recurrence.create", { target: r.title, details: { collection: collection.name } });
  return json(r, 201);
});
