import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mode: "self", subscription: undefined as { plan: string; usable: boolean } | undefined, reads: 0, people: 0 }));
vi.mock("cloudflare:workers", () => ({ env: { get DEPLOY_MODE() { return state.mode } } }));
vi.mock("@/lib/server/api", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message) } } }));
vi.mock("@/lib/server/paddle", () => ({ cancelSubscription: vi.fn() }));
vi.mock("@/lib/server/billing", () => ({ subscriptionUsable: (s: { usable: boolean }) => s.usable }));
vi.mock("@/db", async () => {
 const schema = await import("@/db/schema");
 return {
  ...schema, ...await import("drizzle-orm"),
  db: { select: () => { state.reads++; return { from: (table: unknown) => ({ where: async () =>
   table === schema.mailboxes ? [{ n: state.people }] : state.subscription ? [state.subscription] : [] }) } } },
 };
});
import { requireActivePlan, requireFeature, requireMailPlan } from "@/lib/server/org";
beforeEach(() => { state.mode = "self"; state.subscription = undefined; state.reads = 0; state.people = 0 });
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
 it("keeps mail free for one person without a plan", async () => {
  state.mode = "cloud";
  state.subscription = { plan: "pro", usable: false };
  await expect(requireMailPlan("org", 1)).resolves.toBeUndefined();
  state.people = 1;
  await expect(requireMailPlan("org")).resolves.toBeUndefined();
  await expect(requireMailPlan("org", 1)).rejects.toThrow("One person is free");
  state.people = 2;
  await expect(requireMailPlan("org")).rejects.toThrow("choose a plan");
  state.subscription = { plan: "starter", usable: true };
  await expect(requireMailPlan("org", 1)).resolves.toBeUndefined();
 });
});
