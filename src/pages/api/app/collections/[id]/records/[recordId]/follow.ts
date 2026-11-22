import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { getCollection, getFollow, setFollow } from "@/lib/server/collections";
import { followSchema } from "@/lib/validation-collections";

/** `{ on }`: true or false as the viewer chose, null = by default (assigned, created or commented). */
export const GET = handler(async ({ orgId, role, locals, params }) => {
  const userId = locals.user?.id;
  if (!userId) return json({ on: null });
  await getCollection({ orgId, role, userId }, params.id!);
  return json({ on: await getFollow(params.recordId!, userId) });
});

export const PUT = handler(async ({ request, orgId, role, locals, params }) => {
  const userId = locals.user?.id;
  if (!userId) throw new HttpError(403, "Following needs a signed-in person");
  const collection = await getCollection({ orgId, role, userId }, params.id!);
  const { on } = await parseBody(request, followSchema);
  return json({ on: await setFollow(orgId, collection, params.recordId!, userId, on) });
});
