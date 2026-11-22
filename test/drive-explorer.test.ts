import { describe, expect, it } from "vitest";
import { boxFrom, clickSelect, marqueeHits, moveFocus, sortItems } from "../src/lib/drive/explorer";

const item = (name: string, kind: "folder" | "file" = "file", over: Partial<{ size: number; updatedAt: string; ownerName: string | null }> = {}) => ({
  name,
  kind,
  size: 0,
  updatedAt: "2026-01-01",
  ownerName: null,
  ...over,
});

describe("sortItems", () => {
  it("puts folders first and sorts names naturally", () => {
    const out = sortItems([item("b10.txt"), item("Zeta", "folder"), item("b2.txt"), item("alpha", "folder")], "name", "asc");
    expect(out.map((i) => i.name)).toEqual(["alpha", "Zeta", "b2.txt", "b10.txt"]);
  });

  it("sorts by size and date both ways, folders still first", () => {
    const list = [item("a", "file", { size: 5 }), item("b", "file", { size: 50 }), item("f", "folder")];
    expect(sortItems(list, "size", "desc").map((i) => i.name)).toEqual(["f", "b", "a"]);
    const dated = [item("old", "file", { updatedAt: "2025-01-01" }), item("new", "file", { updatedAt: "2026-05-01" })];
    expect(sortItems(dated, "updated", "desc").map((i) => i.name)).toEqual(["new", "old"]);
  });
});

describe("clickSelect", () => {
  const order = ["a", "b", "c", "d", "e"];
  const none = { ids: new Set<string>(), anchor: null };
  it("selects one, toggles with ⌘, ranges with Shift", () => {
    let s = clickSelect(none, order, "b", {});
    expect([...s.ids]).toEqual(["b"]);
    s = clickSelect(s, order, "d", { shift: true });
    expect([...s.ids]).toEqual(["b", "c", "d"]);
    s = clickSelect(s, order, "c", { meta: true });
    expect([...s.ids].sort()).toEqual(["b", "d"]);
    s = clickSelect({ ids: new Set(["a"]), anchor: "e" }, order, "d", { shift: true, meta: true });
    expect([...s.ids].sort()).toEqual(["a", "d", "e"]);
  });
});

describe("marqueeHits", () => {
  it("returns the boxes the rectangle touches", () => {
    const boxes = [
      { id: "a", box: boxFrom(0, 0, 100, 30) },
      { id: "b", box: boxFrom(0, 30, 100, 60) },
      { id: "c", box: boxFrom(0, 60, 100, 90) },
    ];
    expect(marqueeHits(boxFrom(50, 40, 10, 70), boxes)).toEqual(["b", "c"]);
    expect(marqueeHits(boxFrom(200, 0, 300, 100), boxes)).toEqual([]);
  });
});

describe("moveFocus", () => {
  const order = ["a", "b", "c", "d", "e", "f"];
  it("moves in lists and grids", () => {
    expect(moveFocus(order, null, "ArrowDown")).toBe("a");
    expect(moveFocus(order, "b", "ArrowDown")).toBe("c");
    expect(moveFocus(order, "b", "ArrowDown", 3)).toBe("e");
    expect(moveFocus(order, "b", "ArrowRight", 3)).toBe("c");
    expect(moveFocus(order, "b", "ArrowRight")).toBe("b");
    expect(moveFocus(order, "c", "End")).toBe("f");
    expect(moveFocus(order, "f", "ArrowDown")).toBe("f");
  });
});
