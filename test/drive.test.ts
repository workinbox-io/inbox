import { describe, expect, it } from "vitest";
import { ancestorIds, cleanName, driveQuota, driveRole, isWithin, previewKind, safeServeType, uniqueName, type DriveChainItem } from "../src/lib/drive/access";

const item = (id: string, over: Partial<DriveChainItem> = {}): DriveChainItem => ({ id, ownerId: "anna", sharing: "private", teamRole: "view", ...over });
const anna = { userId: "anna", manager: false };
const bob = { userId: "bob", manager: false };
const admin = { userId: "eve", manager: true };
const apiKey = { userId: "", manager: true };
const none = new Map<string, "view" | "edit">();

describe("driveRole", () => {
  it("gives the owner everything", () => {
    expect(driveRole([item("a")], anna, none)).toMatchObject({ role: "owner", manage: true });
  });

  it("keeps private items from others, admins included", () => {
    expect(driveRole([item("a")], bob, none).role).toBeNull();
    expect(driveRole([item("a")], admin, none).role).toBeNull();
  });

  it("inherits a folder share into a private child", () => {
    const chain = [item("a", { sharing: "people" }), item("b")];
    expect(driveRole(chain, bob, new Map([["a", "edit"]]))).toMatchObject({ role: "edit", manage: false });
  });

  it("lets a share deeper down add access", () => {
    const chain = [item("a", { sharing: "team", teamRole: "view" }), item("b", { sharing: "people" })];
    expect(driveRole(chain, bob, none).role).toBe("view");
    expect(driveRole(chain, bob, new Map([["b", "edit"]])).role).toBe("edit");
  });

  it("makes the folder's owner own what others upload into it", () => {
    const chain = [item("a", { sharing: "team", teamRole: "edit" }), item("b", { ownerId: "bob" })];
    expect(driveRole(chain, anna, none)).toMatchObject({ role: "owner", manage: true });
    expect(driveRole(chain, bob, none)).toMatchObject({ role: "owner", manage: true });
  });

  it("lets managers manage team items, and run ownerless ones", () => {
    expect(driveRole([item("a", { sharing: "team" })], admin, none)).toMatchObject({ role: "view", manage: true });
    expect(driveRole([item("a", { sharing: "team", ownerId: null })], admin, none).role).toBe("owner");
  });

  it("shows API keys team items only", () => {
    expect(driveRole([item("a", { sharing: "people" })], apiKey, new Map([["a", "edit"]])).role).toBeNull();
    expect(driveRole([item("a", { sharing: "team" }), item("b")], apiKey, none).role).toBe("view");
  });

  it("marks items inside a trashed folder as trashed", () => {
    expect(driveRole([item("a", { trashedAt: 1 }), item("b")], anna, none).trashed).toBe(true);
    expect(driveRole([item("a"), item("b")], anna, none).trashed).toBe(false);
  });
});

describe("paths", () => {
  it("reads ancestors and subtrees", () => {
    expect(ancestorIds("/a/b/c/")).toEqual(["a", "b"]);
    expect(ancestorIds("/a/")).toEqual([]);
    expect(isWithin("/a/b/", "/a/")).toBe(true);
    expect(isWithin("/a/", "/a/")).toBe(true);
    expect(isWithin("/x/b/", "/a/")).toBe(false);
  });
});

describe("names", () => {
  it("cleans names", () => {
    expect(cleanName("  a/b\\c\n.txt ")).toBe("a b c .txt");
    expect(cleanName("..")).toBeNull();
    expect(cleanName("   ")).toBeNull();
  });

  it("numbers clashes", () => {
    expect(uniqueName("r.pdf", new Set())).toBe("r.pdf");
    expect(uniqueName("r.pdf", new Set(["R.pdf"]))).toBe("r (2).pdf");
    expect(uniqueName("r.pdf", new Set(["r.pdf", "r (2).pdf"]))).toBe("r (3).pdf");
    expect(uniqueName("Docs", new Set(["docs"]))).toBe("Docs (2)");
  });
});

describe("files", () => {
  it("previews safe types and never renders HTML or SVG", () => {
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("image/svg+xml")).toBe("text");
    expect(previewKind("application/zip")).toBeNull();
    expect(safeServeType("text/html")).toBe("text/plain; charset=utf-8");
    expect(safeServeType("application/zip")).toBe("application/octet-stream");
    expect(safeServeType("video/mp4")).toBe("video/mp4");
  });

  it("pools the quota per person", () => {
    expect(driveQuota(null, 3)).toBeNull();
    expect(driveQuota(10, 0)).toBe(10 * 1024 ** 3);
    expect(driveQuota(10, 3)).toBe(30 * 1024 ** 3);
  });
});
