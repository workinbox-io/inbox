import { describe, expect, it } from "vitest";
import { parseQuickEvent } from "../src/lib/calendar/quick-event";
import { wallTime } from "../src/lib/calendar/time";

const tz = "Europe/Warsaw";
const now = Date.parse("2026-11-13T11:00:00Z");
const parse = (text: string) => parseQuickEvent(text, tz, now);

describe("quick calendar events", () => {
  it("extracts English and Polish dates, leaving names in the title", () => {
    const english = parse("Lunch with Ola tomorrow 1pm")!;
    expect(english).toEqual({ title: "Lunch with Ola", start: Date.parse("2026-11-14T12:00Z"), end: Date.parse("2026-11-14T13:00Z"), allDay: false });
    expect(parse("Lunch z Olą jutro o 13")).toEqual({ ...english, title: "Lunch z Olą" });
    expect(parse("Jutro o 13:00 Lunch z Olą")).toEqual({ ...english, title: "Lunch z Olą" });
  });
  it("handles noon, midnight, duration and a time without a date", () => {
    expect(wallTime(parse("Lunch today at 12pm")!.start, tz).hour).toBe(12);
    expect(wallTime(parse("Call tomorrow 12am")!.start, tz).hour).toBe(0);
    const event = parse("Call at 11:30 for 30 minutes")!;
    expect(event.start).toBe(Date.parse("2026-11-14T10:30Z"));
    expect(event.end - event.start).toBe(30 * 60_000);
    expect(parse("Praca jutro o 9 przez 2 godziny")!.end - parse("Praca jutro o 9 przez 2 godziny")!.start).toBe(2 * 3_600_000);
  });
  it("resolves weekdays and explicit dates in the calendar zone", () => {
    expect(wallTime(parse("Review on Monday at 9")!.start, tz)).toMatchObject({ year: 2026, month: 11, day: 16, hour: 9 });
    expect(wallTime(parse("Review w środę o 9")!.start, tz).day).toBe(18);
    expect(wallTime(parse("Review 2027-01-02 09:15")!.start, tz)).toMatchObject({ year: 2027, month: 1, day: 2, hour: 9, minute: 15 });
    expect(wallTime(parseQuickEvent("Lunch tomorrow at 13:00", "America/New_York", Date.parse("2026-11-14T01:00Z"))!.start, "America/New_York")).toMatchObject({ day: 14, hour: 13 });
  });
  it("keeps all-day events on local midnights through DST", () => {
    const event = parseQuickEvent("Trip tomorrow all day", tz, Date.parse("2026-03-28T12:00Z"))!;
    expect(event.allDay).toBe(true);
    expect(wallTime(event.start, tz)).toMatchObject({ month: 3, day: 29, hour: 0 });
    expect(wallTime(event.end, tz)).toMatchObject({ month: 3, day: 30, hour: 0 });
    expect(event.end - event.start).toBe(23 * 3_600_000);
    expect(parse("Wolne pojutrze cały dzień")!.allDay).toBe(true);
  });
  it.each(["", "Lunch", "tomorrow 1pm", "Lunch tomorrow at 25:00", "Lunch tomorrow at 13pm", "Lunch tomorrow at 00am", "Lunch tomorrow at 9:60", "Lunch 2026-02-30 at 9", "Lunch tomorrow 1pm-2pm", "Lunch tomorrow at 13 for 0 minutes", "Lunch tomorrow for 30 minutes", "Lunch tomorrow all day at 13", "x".repeat(501)])("does not invent an event from %s", (text) => {
    expect(parse(text)).toBeNull();
  });
});
