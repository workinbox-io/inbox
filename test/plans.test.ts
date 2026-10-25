import { describe, expect, it } from "vitest";
import { PLANS, featureUpsell, hasFeature, planById, withinLimit } from "@/config/plans";

describe("plans", () => {
  it("falls back to the cheapest plan for unknown ids", () => {
    expect(planById("gone").id).toBe("starter");
  });

  it("checks limits, with null as unlimited", () => {
    expect(withinLimit(PLANS.starter, "projects", 2)).toBe(true);
    expect(withinLimit(PLANS.starter, "projects", 3)).toBe(false);
    expect(withinLimit(PLANS.business, "projects", 10_000)).toBe(true);
  });

  it("gates features by the cheapest plan that has them", () => {
    expect(hasFeature(PLANS.starter, "apiAccess")).toBe(false);
    expect(hasFeature(PLANS.pro, "apiAccess")).toBe(true);
    expect(featureUpsell("apiAccess")).toBe("API access is available on the Pro and Business plans.");
  });
});
