import { db, eq, organization } from "@/db";
import { HttpError, handler, json, manageHandler, parseBody } from "@/lib/server/api";
import { deleteOrganization, getOrg } from "@/lib/server/org";
import { deleteOrgSchema, renameOrgSchema } from "@/lib/validation";

/** Settings → Organization → Name. */
export const PATCH = manageHandler(async ({ request, orgId, audit }) => {
  const { name } = await parseBody(request, renameOrgSchema);
  const org = await getOrg(orgId);
  if (!org) throw new HttpError(404, "Organization not found");
  if (org.name !== name) {
    await db.update(organization).set({ name }).where(eq(organization.id, orgId));
    audit("org.rename", { target: name, details: { from: org.name } });
  }
  return json({ ok: true, name });
});

/** Owner only, with the name typed to confirm. Cancels the subscription and deletes everything. */
export const DELETE = handler(async ({ request, orgId, role }) => {
  if (role !== "owner") throw new HttpError(403, "Only the owner can delete the organization.");
  const { confirmName } = await parseBody(request, deleteOrgSchema);
  const org = await getOrg(orgId);
  if (!org) throw new HttpError(404, "Organization not found");
  if (confirmName.trim() !== org.name) throw new HttpError(422, "Type the organization's name exactly to confirm.");
  // No audit entry: the log is deleted with the organization.
  await deleteOrganization(orgId);
  return json({ ok: true });
});
