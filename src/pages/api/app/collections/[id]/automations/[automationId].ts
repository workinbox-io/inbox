import { z } from "zod";
import { handler, json, parseBody } from "@/lib/server/api";
import { setAutomation } from "@/lib/server/collection-automations";
import { triggerText } from "@/lib/collections/automations";

/** Turn a rule on or off. */
export const PATCH = handler(async ({ request, orgId, role, locals, params, audit }) => {
  const { enabled } = await parseBody(request, z.object({ enabled: z.boolean() }));
  const { automation, collection } = await setAutomation({ orgId, role, userId: locals.user?.id ?? null }, params.id!, params.automationId!, { enabled });
  audit("collection.automation", { target: collection.name, details: { [enabled ? "on" : "off"]: triggerText(automation.trigger, collection.fields) } });
  return json(automation);
});

export const DELETE = handler(async ({ orgId, role, locals, params, audit }) => {
  const { automation, collection } = await setAutomation({ orgId, role, userId: locals.user?.id ?? null }, params.id!, params.automationId!, { remove: true });
  audit("collection.automation", { target: collection.name, details: { removed: triggerText(automation.trigger, collection.fields) } });
  return json({ ok: true });
});
