import { describe, expect, it } from "vitest";
import { HEATMAP_MIN_OPACITY, heatmapMax, heatmapOpacity } from "@/lib/heatmap";

describe("heatmapMax", () => {
  it("takes the largest finite value and skips gaps", () => {
    expect(heatmapMax([[1, null, 4], [null, 2, Number.NaN]])).toBe(4);
  });

  it("is 0 for an empty or all-missing grid", () => {
    expect(heatmapMax([])).toBe(0);
    expect(heatmapMax([[null, null]])).toBe(0);
  });
});

describe("heatmapOpacity", () => {
  it("scales from the floor to 1 against the max", () => {
    expect(heatmapOpacity(10, 10)).toBe(1);
    expect(heatmapOpacity(5, 10)).toBeCloseTo(HEATMAP_MIN_OPACITY + 0.5 * (1 - HEATMAP_MIN_OPACITY));
  });

  it("keeps a zero visible at the floor, and a gap empty", () => {
    expect(heatmapOpacity(0, 10)).toBe(HEATMAP_MIN_OPACITY);
    expect(heatmapOpacity(null, 10)).toBeNull();
  });

  it("does not divide by a zero max", () => {
    expect(heatmapOpacity(3, 0)).toBe(HEATMAP_MIN_OPACITY);
  });
});
