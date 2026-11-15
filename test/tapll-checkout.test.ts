import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

const { createCheckout } = vi.hoisted(() => ({ createCheckout: vi.fn() }));
vi.mock("@/lib/server/paddle", () => ({ createCheckout }));
vi.mock("@/lib/server/api", () => ({
  manageHandler: (run: unknown) => run,
  parseBody: async (request: Request, schema: z.ZodType) => schema.parse(await request.json()),
  json: (data: unknown) => Response.json(data),
}));
import { POST } from "../src/pages/api/app/billing/checkout";
import { PLAN_LIST } from "../src/config/plans";

beforeEach(() => { createCheckout.mockReset().mockResolvedValue("https://checkout.test"); });

async function checkout(extra: Record<string, unknown>) {
  return POST({
    request: new Request("https://workinbox.io/api/app/billing/checkout", {
      method: "POST", body: JSON.stringify({ plan: PLAN_LIST[0].id, interval: "month", ...extra }),
    }),
    orgId: "org",
    locals: { user: { id: "authenticated-user", email: "private@example.test" } },
  } as unknown as Parameters<typeof POST>[0]);
}

it("takes the visit from the request and the user ID only from the authenticated session", async () => {
  const visit = "019a6719-7842-7000-8000-0123456789ab";
  await checkout({ tapllSessionId: visit, tapll_user_id: "forged-user" });
  expect(createCheckout).toHaveBeenCalledWith("org", "private@example.test", PLAN_LIST[0].id, "month", {
    tapll_session_id: visit, tapll_user_id: "authenticated-user",
  });
});

it("accepts checkout without analytics but rejects arbitrary text as a visit ID", async () => {
  await checkout({});
  expect(createCheckout.mock.calls[0][4].tapll_session_id).toBe("");
  createCheckout.mockClear();
  await expect(checkout({ tapllSessionId: "private@example.test" })).rejects.toThrow();
  expect(createCheckout).not.toHaveBeenCalled();
});
