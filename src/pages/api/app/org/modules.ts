import { handler, json, manageHandler, parseBody } from "@/lib/server/api";
import { listModules, setModule } from "@/lib/server/modules";
import { orgModuleSchema } from "@/lib/validation";

/** Settings → Organization → Apps. */
export const GET = handler(async ({ orgId }) => json({ modules: await listModules(orgId) }));

export const PUT = manageHandler(async ({ request, orgId, audit }) => {
  const { module, enabled } = await parseBody(request, orgModuleSchema);
  if (await setModule(orgId, module, enabled)) audit("org.module", { target: module, details: { enabled } });
  return json({ modules: await listModules(orgId) });
});
