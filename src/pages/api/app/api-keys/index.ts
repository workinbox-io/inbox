import { apiKeys, db } from "@/db";
import { json, manageHandler, parseBody } from "@/lib/server/api";
import { generateApiKey, listApiKeys } from "@/lib/server/api-keys";
import { requireFeature } from "@/lib/server/org";
import { apiKeySchema } from "@/lib/validation";

export const GET = manageHandler(async ({ orgId }) => json({ keys: await listApiKeys(orgId) }));

/** The key itself is only in this response. */
export const POST = manageHandler(async ({ request, orgId, locals, audit }) => {
  await requireFeature(orgId, "apiAccess");
  const input = await parseBody(request, apiKeySchema);
  const { key, hash, prefix } = await generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ ...input, orgId, hash, prefix, createdBy: locals.user?.id ?? null })
    .returning({ id: apiKeys.id });
  audit("api_key.create", { target: input.name, details: { role: input.role, prefix } });
  return json({ id: row!.id, key }, 201);
});
