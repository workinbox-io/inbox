import { describe, expect, it } from "vitest";
import { FREE_PEOPLE, MIN_SEATS, seatsFor } from "../src/config/plans";

describe("seatsFor", () => {
  it("bills people beyond the free ones, never below the minimum", () => {
    expect([FREE_PEOPLE, MIN_SEATS]).toEqual([5, 5]);
    expect(seatsFor(0)).toBe(5);
    expect(seatsFor(5)).toBe(5);
    expect(seatsFor(6)).toBe(5);
    expect(seatsFor(10)).toBe(5);
    expect(seatsFor(11)).toBe(6);
    expect(seatsFor(30)).toBe(25);
  });
});
