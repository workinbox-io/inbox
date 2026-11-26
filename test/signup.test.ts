import { describe, expect, it } from "vitest";
import { safeNext, signUpAllowed } from "../src/lib/signup";

describe("signUpAllowed", () => {
  it("keeps hosted sign-up open", () => expect(signUpAllowed("cloud", true, false)).toBe(true));
  it("lets the first user in on a self-hosted instance", () => expect(signUpAllowed("self", false, false)).toBe(true));
  it("lets invited people in", () => expect(signUpAllowed("self", true, true)).toBe(true));
  it("closes self-hosted sign-up to everyone else", () => expect(signUpAllowed("self", true, false)).toBe(false));
});

describe("safeNext", () => {
  it("keeps paths on this site", () => expect(safeNext("/app/mail?x=1")).toBe("/app/mail?x=1"));
  it("refuses other hosts", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\tevil.com", "/\t/evil.com", "https://evil.com", "", null]) expect(safeNext(bad)).toBe("/app");
  });
});
