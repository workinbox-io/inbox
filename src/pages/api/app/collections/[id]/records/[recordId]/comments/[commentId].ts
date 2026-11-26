import { handler, json, parseBody } from "@/lib/server/api";
import { deleteComment, editComment, getCollection, getRecord } from "@/lib/server/collections";
import { commentSchema } from "@/lib/validation-collections";

export const PATCH = handler(async ({ request, orgId, role, locals, params }) => {
  const v = { orgId, role, userId: locals.user?.id ?? null };
  const collection = await getCollection(v, params.id!);
  await getRecord(orgId, collection.id, params.recordId!);
  const { text } = await parseBody(request, commentSchema);
  return json(await editComment(v, params.recordId!, params.commentId!, text));
});

export const DELETE = handler(async ({ orgId, role, locals, params, audit }) => {
  const v = { orgId, role, userId: locals.user?.id ?? null };
  const collection = await getCollection(v, params.id!);
  await getRecord(orgId, collection.id, params.recordId!);
  await deleteComment(v, params.recordId!, params.commentId!);
  audit("collection_comment.delete", { target: collection.name });
  return json({ ok: true });
});
