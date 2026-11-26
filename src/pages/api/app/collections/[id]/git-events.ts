import { handler, json, parseBody } from "@/lib/server/api";
import { getCollection } from "@/lib/server/collections";
import { enqueue } from "@/lib/server/queue";
import { gitEventsSchema } from "@/lib/validation-collections";

/**
 * POST { events: [{ kind, repo, url?, texts, state?, environment? }] }: git activity from CI or a git hook, for
 * forges without our GitHub webhook (docs/git-integration.md). Handled like the webhook's (lib/server/collection-git.ts).
 */
export const POST = handler(async ({ request, orgId, role, locals, params }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, "edit");
  const { events } = await parseBody(request, gitEventsSchema);
  const now = Date.now();
  await enqueue("collections.git", { orgId, collectionId: collection.id, events: events.map((e) => ({ ...e, at: e.at ?? now })) });
  return json({ queued: events.length }, 202);
});
