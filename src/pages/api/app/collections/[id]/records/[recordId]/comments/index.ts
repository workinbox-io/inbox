import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { addComment, getCollection, listComments } from "@/lib/server/collections";
import { commentSchema } from "@/lib/validation-collections";

export const GET = handler(async ({ orgId, role, locals, params }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!);
  return json({ comments: await listComments(orgId, collection, params.recordId!), me: locals.user?.id ?? null });
});

/** Anyone who can view the collection may comment. */
export const POST = handler(async ({ request, orgId, role, locals, params, audit }) => {
  const userId = locals.user?.id;
  if (!userId) throw new HttpError(403, "Comments need a signed-in person");
  const collection = await getCollection({ orgId, role, userId }, params.id!);
  const { text, parentId } = await parseBody(request, commentSchema);
  const comment = await addComment({ orgId, role, userId }, collection, params.recordId!, text, parentId);
  audit("collection_comment.create", { target: collection.name });
  return json(comment, 201);
});
