import { describe, expect, it } from "vitest";
import { dithered, palette, sprite } from "../src/components/site/pixel/pixel";

describe("pixel helpers", () => {
  it("dithers by level: none at 0, all at 1, half at 0.5", () => {
    const count = (l: number) => Array.from({ length: 16 }, (_, i) => dithered(l, i % 4, Math.floor(i / 4))).filter(Boolean).length;
    expect(count(0)).toBe(0);
    expect(count(1)).toBe(16);
    expect(count(0.5)).toBe(8);
  });
  it("parses sprites with see-through cells and pads short rows", () => {
    const s = sprite(["5.5", "5"]);
    expect([s.w, s.h]).toEqual([3, 2]);
    expect(s.cells).toEqual(["5", null, "5", "5", null, null]);
  });
  it("builds six steps from background to foreground", () => {
    const p = palette("#000000", "#ffffff", "#fefefe");
    expect(p["0"]).toBe("#000000");
    expect(p["5"]).toBe("#ffffff");
    expect(p.p).toBe("#fefefe");
  });
});
