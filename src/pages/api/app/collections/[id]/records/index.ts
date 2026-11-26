import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { createRecord, getCollection, listRecords } from "@/lib/server/collections";
import { atLeast } from "@/lib/notes/access";
import { recordCreateSchema, recordListSchema } from "@/lib/validation-collections";

const parseJson = (raw: string | undefined, error: string) => {
  try {
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    throw new HttpError(400, error);
  }
};

/** `?q=&limit=&offset=&scope=all|triage|trash&parent=&cycle=&filter={"Status":"Done"}&view={"filters":[…],"closed":false}` */
export const GET = handler(async ({ orgId, role, locals, params, url }) => {
  const raw = Object.fromEntries(url.searchParams);
  const parsed = recordListSchema.safeParse({ ...raw, filter: parseJson(raw.filter, "filter must be JSON"), view: parseJson(raw.view, "view must be JSON") });
  if (!parsed.success) throw new HttpError(400, "Invalid query", parsed.error.flatten());
  return json(await listRecords(orgId, await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!), parsed.data));
});

/** Editors add records; with triage on, viewers (and API keys) send them to Triage instead. */
export const POST = handler(async ({ request, orgId, role, params, locals, audit }) => {
  const userId = locals.user?.id ?? null;
  const collection = await getCollection({ orgId, role, userId }, params.id!);
  const triage = !userId || !atLeast(collection.role, "edit");
  if (triage && !collection.settings.triage) throw new HttpError(403, "You can only view this collection");
  const record = await createRecord(orgId, collection, userId, await parseBody(request, recordCreateSchema), { triage });
  audit("collection_record.create", { target: record.title, details: { collection: collection.name, triage } });
  return json(record, 201);
});
