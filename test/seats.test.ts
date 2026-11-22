import { describe, expect, it } from "vitest";
import { FREE_PEOPLE, MIN_SEATS, peopleOf, seatsFor } from "../src/config/plans";

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

describe("peopleOf", () => {
  it("counts personal mailboxes and mailbox grants once per person", () => {
    expect(peopleOf(["a", "b"], []).size).toBe(2);
    // A personal mailbox turned shared and granted back to its person still bills them.
    expect(peopleOf(["a"], ["b", "b", "a"]).size).toBe(2);
    expect(peopleOf([null], []).size).toBe(0);
  });
});
