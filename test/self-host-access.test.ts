import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mode: "self", subscription: undefined as { plan: string; usable: boolean } | undefined, reads: 0 }));
vi.mock("cloudflare:workers", () => ({ env: { get DEPLOY_MODE() { return state.mode } } }));
vi.mock("@/lib/server/api", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message) } } }));
vi.mock("@/lib/server/paddle", () => ({ cancelSubscription: vi.fn() }));
vi.mock("@/lib/server/billing", () => ({ subscriptionUsable: (s: { usable: boolean }) => s.usable }));
vi.mock("@/db", async () => ({
 ...await import("@/db/schema"), ...await import("drizzle-orm"),
 db: { select: () => { state.reads++; return { from: () => ({ where: async () => state.subscription ? [state.subscription] : [] }) } } },
}));
import { requireActivePlan, requireFeature } from "@/lib/server/org";
beforeEach(() => { state.mode = "self"; state.subscription = undefined; state.reads = 0 });
describe("self-host access", () => {
 it("enables all business features without a billing subscription", async () => {
  expect((await requireActivePlan("org")).id).toBe("business");
  expect((await requireFeature("org", "apiAccess")).id).toBe("business");
  expect((await requireFeature("org", "mcpAccess")).id).toBe("business");
  expect(state.reads).toBe(0);
 });
 it("does not let expired cloud subscriptions access paid features", async () => {
  state.mode = "cloud";
  state.subscription = { plan: "business", usable: false };
  await expect(requireFeature("org", "apiAccess")).rejects.toThrow("inactive");
 });
 it("keeps cloud feature tiers and missing subscriptions enforced", async () => {
  state.mode = "cloud";
  await expect(requireActivePlan("org")).rejects.toThrow("inactive");
  state.subscription = { plan: "starter", usable: true };
  await expect(requireFeature("org", "mcpAccess")).rejects.toThrow("Upgrade");
  state.subscription = { plan: "pro", usable: true };
  expect((await requireFeature("org", "mcpAccess")).id).toBe("pro");
 });
});
