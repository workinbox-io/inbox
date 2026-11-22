import { handler, json } from "@/lib/server/api";
import { loadTeam } from "@/lib/server/org";

/** Fresh team data for Settings → Organization after an invite, revoke or removal. */
export const GET = handler(async ({ orgId, locals }) => json(await loadTeam(orgId, locals.user!.id)));
