import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { OrgError, transferOwnership } from "@/lib/server/org";
import { transferOwnershipSchema } from "@/lib/validation";

/** The owner hands the organization to another member and stays on as an admin. */
export const POST = handler(async ({ request, orgId, role, locals, audit }) => {
  if (role !== "owner") throw new HttpError(403, "Only the owner can transfer ownership.");
  const { memberId } = await parseBody(request, transferOwnershipSchema);
  try {
    const to = await transferOwnership(orgId, locals.user!.id, memberId);
    audit("org.transfer", { target: to.email });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof OrgError) throw new HttpError(409, e.message);
    throw e;
  }
});
