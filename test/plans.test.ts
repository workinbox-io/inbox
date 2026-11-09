import { describe, expect, it } from "vitest";
import { PLANS, featureUpsell, hasFeature, planById, withinLimit } from "@/config/plans";

describe("plans", () => {
  it("falls back to the cheapest plan for unknown ids", () => {
    expect(planById("gone").id).toBe("starter");
  });

  it("checks limits, with null as unlimited", () => {
    // WorkInbox plans have no limits (per-person pricing): check the rule on a plan with one.
    const limited = { ...PLANS.starter, projects: 3 };
    expect(withinLimit(limited, "projects", 2)).toBe(true);
    expect(withinLimit(limited, "projects", 3)).toBe(false);
    expect(withinLimit(PLANS.business, "projects", 10_000)).toBe(true);
  });

  it("gates features by the cheapest plan that has them", () => {
    expect(hasFeature(PLANS.starter, "apiAccess")).toBe(false);
    expect(hasFeature(PLANS.pro, "apiAccess")).toBe(true);
    expect(featureUpsell("apiAccess")).toBe("API access is available on the Pro and Business plans.");
  });
});
