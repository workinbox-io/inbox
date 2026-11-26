import { handler, json, parseBody } from "@/lib/server/api";
import { addLink, getCollection, getRecord, listLinks } from "@/lib/server/collections";
import { linkSchema } from "@/lib/validation-collections";

export const GET = handler(async ({ orgId, role, locals, params }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!);
  await getRecord(orgId, collection.id, params.recordId!);
  return json({ links: await listLinks(orgId, params.recordId!) });
});

/** POST { url }: the kind and title are read from the URL (lib/collections/links.ts). */
export const POST = handler(async ({ request, orgId, role, locals, params }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, "edit");
  const { url } = await parseBody(request, linkSchema);
  return json(await addLink(orgId, collection, params.recordId!, url, locals.user?.id ?? null), 201);
});
