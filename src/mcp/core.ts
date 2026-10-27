/** Template tools every product has. Your product's tools go in ./app.ts. */
import { z } from "zod";
import { getOrg, getOrgUsage, getSubscription } from "@/lib/server/org";
import { defineTool, type Tools } from "./define";

export const coreTools: Tools = {
  get_organization: defineTool({
    title: "Organization and plan",
    description:
      "The organization this connection works in: its name, the caller's role, the plan with its limits, the subscription status and current usage. Call it first when limits or permissions matter.",
    input: z.object({}),
    async run(_, { orgId, role }) {
      const [org, sub, usage] = await Promise.all([getOrg(orgId), getSubscription(orgId), getOrgUsage(orgId)]);
      return {
        organization: { id: orgId, name: org?.name ?? "" },
        role,
        plan: { id: usage.plan.id, name: usage.plan.name, limits: { projects: usage.plan.projects, members: usage.plan.members } },
        subscription: { status: sub?.status ?? "none", trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null },
        usage: { projects: usage.projects, members: usage.members },
      };
    },
  }),
};
