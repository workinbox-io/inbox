import { handler, json, manageHandler, parseBody } from "@/lib/server/api";
import { getBillingDetails, saveBillingDetails } from "@/lib/server/org";
import { billingDetailsSchema } from "@/lib/validation";

export const GET = handler(async ({ orgId }) => json(await getBillingDetails(orgId)));

/** Company details for invoices; owners and admins only. */
export const PUT = manageHandler(async ({ request, orgId, audit }) => {
  const details = await parseBody(request, billingDetailsSchema);
  const before = await getBillingDetails(orgId);
  await saveBillingDetails(orgId, details);
  const fields = (Object.keys(details) as (keyof typeof details)[]).filter((k) => details[k] !== before[k]);
  if (fields.length) audit("org.billing_details", { details: { fields } });
  return json(details);
});
