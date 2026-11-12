import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dayKey, rangeOf, stepDate } from "../src/components/calendar/shared";
import { YearGrid } from "../src/components/calendar/year-grid";

describe("year calendar", () => {
  it("uses the calendar time zone at year boundaries", () => {
    const date = Date.parse("2027-01-01T01:00:00Z");
    const tz = "America/Los_Angeles";
    const { from, to } = rangeOf(date, "year", tz, 1);
    expect(dayKey(from, tz)).toBe("2026-01-01");
    expect(dayKey(to, tz)).toBe("2027-01-01");
    expect(dayKey(stepDate(date, "year", 1, tz), tz)).toBe("2027-01-01");
    expect(dayKey(stepDate(date, "year", -1, tz), tz)).toBe("2025-01-01");
  });

  it("navigates out of leap day without skipping a year", () => {
    const date = Date.parse("2028-02-29T12:00:00Z");
    expect(dayKey(stepDate(date, "year", 1, "UTC"), "UTC")).toBe("2029-01-01");
    expect(dayKey(stepDate(date, "year", -1, "UTC"), "UTC")).toBe("2027-01-01");
  });

  it("renders twelve months including leap day and highlights today", () => {
    const date = Date.parse("2028-02-29T12:00:00Z");
    const html = renderToStaticMarkup(createElement(YearGrid, { date, tz: "UTC", weekStart: 1, now: date, onMonth: () => {} }));
    expect(html.match(/<table\b/g)).toHaveLength(12);
    expect(html).toContain("January");
    expect(html).toContain("December");
    expect(html).toContain('data-day="2028-02-29"');
    const todayCells = html.match(/<td\b[^>]*data-today="true"[^>]*>/g) ?? [];
    expect(todayCells.filter((cell) => !cell.includes('data-hidden="true"'))).toHaveLength(1);
    expect(html).not.toContain('aria-label="Next month"');
  });
});
