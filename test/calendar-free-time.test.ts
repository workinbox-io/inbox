import { describe, expect, it } from "vitest";
import { findFreeSlots } from "../src/lib/calendar/free-time";
import { groupSeries } from "../src/lib/calendar/import";
import type { IcsEvent } from "../src/lib/calendar/ics";

const at = (s: string) => Date.parse(s);

describe("free time", () => {
  it("finds slots inside working hours around busy blocks, skipping weekends", () => {
    const slots = findFreeSlots({
      busy: [
        { start: at("2026-11-13T08:00:00Z"), end: at("2026-11-13T09:15:00Z") }, // Fri 9:00–10:15 Warsaw
        { start: at("2026-11-13T09:00:00Z"), end: at("2026-11-13T15:00:00Z") },
      ],
      from: at("2026-11-13T00:00:00Z"),
      to: at("2026-11-17T00:00:00Z"),
      duration: 60,
      tz: "Europe/Warsaw",
      workStart: 540,
      workEnd: 1020,
      limit: 3,
    });
    expect(slots.map((s) => new Date(s.start).toISOString())).toEqual([
      "2026-11-13T15:00:00.000Z", // Fri 16:00
      "2026-11-16T08:00:00.000Z", // Mon 9:00
      "2026-11-16T08:30:00.000Z",
    ]);
  });
});

describe("import grouping", () => {
  const base = { sequence: 0, title: "", description: "", location: "", url: "", start: 0, end: 1, allDay: false, timezone: "UTC", rrule: null, exdates: [], recurrenceId: null, status: "confirmed", busy: true, organizer: null, attendees: [] } satisfies IcsEvent extends infer T ? Omit<T, "uid"> : never;
  it("puts overrides under their master and keeps orphans as single events", () => {
    const series = groupSeries([
      { ...base, uid: "a", rrule: "FREQ=DAILY" },
      { ...base, uid: "a", recurrenceId: 5 },
      { ...base, uid: "b", recurrenceId: 7 },
    ]);
    expect(series.map((s) => [s.master.uid, s.overrides.length, s.master.recurrenceId])).toEqual([["a", 1, null], ["b", 0, null]]);
  });
});
