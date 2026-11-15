import { and, apiKeys, db, eq } from "@/db";
import { HttpError, json, manageHandler } from "@/lib/server/api";

/** Revoking deletes the key; requests with it fail right away. */
export const DELETE = manageHandler(async ({ params, orgId, audit }) => {
  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, params.keyId ?? ""), eq(apiKeys.orgId, orgId)))
    .returning({ name: apiKeys.name, prefix: apiKeys.prefix });
  if (!deleted.length) throw new HttpError(404, "API key not found");
  audit("api_key.revoke", { target: deleted[0]!.name, details: { prefix: deleted[0]!.prefix } });
  return json({ ok: true });
});
