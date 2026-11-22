import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { getCollection, getRecord, toggleReaction } from "@/lib/server/collections";
import { reactionSchema } from "@/lib/validation-collections";

/** POST { emoji }: adds the viewer's reaction, or takes it back. Returns the comment's reactions. */
export const POST = handler(async ({ request, orgId, role, locals, params }) => {
  const userId = locals.user?.id;
  if (!userId) throw new HttpError(403, "Reactions need a signed-in person");
  const collection = await getCollection({ orgId, role, userId }, params.id!);
  await getRecord(orgId, collection.id, params.recordId!);
  const { emoji } = await parseBody(request, reactionSchema);
  return json({ reactions: await toggleReaction({ orgId, role, userId }, params.recordId!, params.commentId!, emoji) });
});
