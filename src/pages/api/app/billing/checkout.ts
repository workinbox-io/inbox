import { z } from "zod";
import { PLANS, type PlanId } from "@/config/plans";
import { json, manageHandler, parseBody } from "@/lib/server/api";
import { createCheckout } from "@/lib/server/paddle";

const schema = z.object({
  plan: z.enum(Object.keys(PLANS) as [PlanId, ...PlanId[]]),
  interval: z.enum(["month", "year"]),
});

export const POST = manageHandler(async ({ request, orgId, locals }) => {
  const { plan, interval } = await parseBody(request, schema);
  return json({ url: await createCheckout(orgId, locals.user!.email, plan, interval) });
});
