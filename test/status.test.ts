import { describe, expect, it } from "vitest";
import { nextStatus, worstStatus } from "@/lib/status";

describe("nextStatus", () => {
  it("takes the first result as is", () => {
    expect(nextStatus(null, "down")).toMatchObject({ status: "down", changed: true });
    expect(nextStatus(null, "ok")).toMatchObject({ status: "ok", changed: false });
  });

  it("waits for a second identical result before flipping", () => {
    const first = nextStatus({ status: "ok", pendingStatus: null, pendingCount: 0 }, "down");
    expect(first).toEqual({ status: "ok", changed: false, pendingStatus: "down", pendingCount: 1 });
    expect(nextStatus({ ...first, status: "ok" }, "down")).toMatchObject({ status: "down", changed: true, pendingCount: 0 });
  });

  it("forgets a blip that doesn't repeat", () => {
    expect(nextStatus({ status: "ok", pendingStatus: "down", pendingCount: 1 }, "ok")).toEqual({ status: "ok", changed: false, pendingStatus: null, pendingCount: 0 });
    expect(nextStatus({ status: "ok", pendingStatus: "down", pendingCount: 1 }, "degraded")).toMatchObject({ pendingStatus: "degraded", pendingCount: 1 });
  });

  it("picks the worst status", () => {
    expect(worstStatus([])).toBe("ok");
    expect(worstStatus(["ok", "down", "degraded"])).toBe("down");
  });
});
