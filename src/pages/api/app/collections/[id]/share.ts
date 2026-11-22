import { handler, json, parseBody } from "@/lib/server/api";
import { shareCollection } from "@/lib/server/collections";
import { noteShareSchema } from "@/lib/validation-notes";

/** Who may open the collection: its owner only, chosen people (view or edit) or the whole team. Same body as notes. */
export const PUT = handler(async ({ request, orgId, role, locals, params, audit }) => {
  const input = await parseBody(request, noteShareSchema);
  const collection = await shareCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!, input);
  audit("collection.share", { target: collection.name, details: { sharing: input.sharing, people: input.people.length } });
  return json(collection);
});
