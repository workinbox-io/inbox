import { z } from "zod";
import { handler, json, parseBody } from "@/lib/server/api";
import { gitHook } from "@/lib/server/collection-git";

/** The collection's GitHub webhook: its URL and secret (made on first ask). Managers only. */
export const GET = handler(async ({ orgId, role, locals, params }) => json(await gitHook({ orgId, role, userId: locals.user?.id ?? null }, params.id!)));

/** POST { action: "rotate" }: a new secret; GitHub's webhook must get it too. */
export const POST = handler(async ({ request, orgId, role, locals, params, audit }) => {
  await parseBody(request, z.object({ action: z.literal("rotate") }));
  const hook = await gitHook({ orgId, role, userId: locals.user?.id ?? null }, params.id!, { rotate: true });
  audit("collection.update", { target: params.id!, details: { git: "secret rotated" } });
  return json(hook);
});
