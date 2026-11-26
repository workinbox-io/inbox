import { describe, expect, it } from "vitest";
import { canCreateWorkspace } from "@/lib/workspaces";
import { MAX_OWNED_ORGS } from "@/config/plans";

describe("canCreateWorkspace", () => {
  it("lets owners and admins create on the hosted service", () => {
    expect(canCreateWorkspace({ mode: "cloud", role: "owner", owned: 1 })).toBe(true);
    expect(canCreateWorkspace({ mode: "cloud", role: "admin", owned: 0 })).toBe(true);
  });
  it("refuses members, self-hosted installs and the cap", () => {
    expect(canCreateWorkspace({ mode: "cloud", role: "member", owned: 0 })).toBe(false);
    expect(canCreateWorkspace({ mode: "self", role: "owner", owned: 1 })).toBe(false);
    expect(canCreateWorkspace({ mode: "cloud", role: "owner", owned: MAX_OWNED_ORGS })).toBe(false);
  });
});
