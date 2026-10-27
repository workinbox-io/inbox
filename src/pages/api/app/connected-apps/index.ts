import { handler, json } from "@/lib/server/api";
import { listConnectedApps } from "@/lib/server/oauth";

/** AI apps the signed-in user connected over OAuth (Settings → AI apps). */
export const GET = handler(async ({ locals }) => json({ apps: await listConnectedApps(locals.user!.id) }));
