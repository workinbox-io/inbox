import { db, eq, session } from "@/db";
import { handler, json, parseBody } from "@/lib/server/api";
import { createWorkspace } from "@/lib/server/org";
import { createWorkspaceSchema } from "@/lib/validation";

/** Account menu → New workspace: makes it, the caller its owner, and switches this session to it. */
export const POST = handler(async ({ request, role, locals, audit }) => {
  const { name } = await parseBody(request, createWorkspaceSchema);
  const orgId = await createWorkspace(locals.user!.id, locals.user!.name, role, name);
  await db.update(session).set({ activeOrganizationId: orgId }).where(eq(session.id, locals.session!.id));
  audit("org.create", { target: name, details: { orgId } });
  return json({ ok: true, id: orgId });
});
