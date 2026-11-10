import { afterEach, expect, it, vi } from "vitest";
import { TAPLL_EVENTS, tapllEvent, tapllSessionId } from "../src/lib/tapll";

afterEach(() => vi.unstubAllGlobals());

it("sends the approved event roles through the pre-load command queue", () => {
  const calls: unknown[][] = [];
  vi.stubGlobal("window", { tapll: (...args: unknown[]) => calls.push(args) });
  for (const [event, [feature, role]] of Object.entries(TAPLL_EVENTS)) {
    expect(event).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    tapllEvent(event as keyof typeof TAPLL_EVENTS, { reason: "request_failed" });
    expect(calls.at(-1)).toEqual(["track", event, { reason: "request_failed" }, { feature, role }]);
  }
  expect(calls).toHaveLength(15);
});

it("does not interrupt actions when analytics is absent or throws", () => {
  vi.stubGlobal("window", {});
  expect(() => tapllEvent("signup_started")).not.toThrow();
  expect(tapllSessionId()).toBeNull();
  vi.stubGlobal("window", { tapll: () => { throw new Error("blocked"); } });
  expect(() => tapllEvent("signup_started")).not.toThrow();
  expect(tapllSessionId()).toBeNull();
});

it("only returns an available session ID, never the queue's return value", () => {
  vi.stubGlobal("window", { tapll: () => 1 });
  expect(tapllSessionId()).toBeNull();
  vi.stubGlobal("window", { tapll: () => "019a6719-7842-7000-8000-0123456789ab" });
  expect(tapllSessionId()).toBe("019a6719-7842-7000-8000-0123456789ab");
});
