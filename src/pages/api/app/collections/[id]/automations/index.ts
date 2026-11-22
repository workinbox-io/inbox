import { handler, json, parseBody } from "@/lib/server/api";
import { createAutomation, listAutomations } from "@/lib/server/collection-automations";
import { automationSchema, triggerText } from "@/lib/collections/automations";

/** Whoever may change the collection: its rules, and a new one. */
export const GET = handler(async ({ orgId, role, locals, params }) =>
  json({ automations: await listAutomations({ orgId, role, userId: locals.user?.id ?? null }, params.id!) }));

export const POST = handler(async ({ request, orgId, role, locals, params, audit }) => {
  const { automation, collection } = await createAutomation({ orgId, role, userId: locals.user?.id ?? null }, params.id!, await parseBody(request, automationSchema));
  audit("collection.automation", { target: collection.name, details: { added: triggerText(automation.trigger, collection.fields), action: automation.action.kind } });
  return json(automation, 201);
});
