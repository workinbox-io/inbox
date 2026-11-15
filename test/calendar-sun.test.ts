import { describe, expect, it } from "vitest";
import { approximateSunLocation, sunTimes } from "../src/lib/calendar/sun";
import { minuteOfDay, sameDay } from "../src/lib/calendar/time";

const warsaw = { latitude: 52.2297, longitude: 21.0122 };
const tz = "Europe/Warsaw";

describe("sun markers", () => {
  it("reads connection coordinates without treating missing values as zero", () => {
    expect(approximateSunLocation("52.23", "21.01")).toEqual({ latitude: 52.23, longitude: 21.01 });
    expect(approximateSunLocation("0", "0")).toEqual({ latitude: 0, longitude: 0 });
    for (const [lat, lon] of [[undefined, undefined], [null, null], ["", ""], [" ", "0"], ["bad", "0"], ["91", "21"], ["52", "181"]]) {
      expect(approximateSunLocation(lat, lon)).toBeNull();
    }
  });
  it.each([
    ["2026-06-21T12:00:00Z", 4 * 60 + 14, 21 * 60],
    ["2026-12-21T12:00:00Z", 7 * 60 + 43, 15 * 60 + 25],
  ])("matches Warsaw's seasonal sunrise and sunset within five minutes (%s)", (date, rise, set) => {
    const times = sunTimes(Date.parse(date), tz, warsaw);
    expect(times.map((s) => s.kind)).toEqual(["sunrise", "sunset"]);
    expect(Math.abs(minuteOfDay(times[0].at, tz) - rise)).toBeLessThanOrEqual(5);
    expect(Math.abs(minuteOfDay(times[1].at, tz) - set)).toBeLessThanOrEqual(5);
  });

  it("keeps the selected local day across DST and the date line", () => {
    for (const [zone, location] of [
      [tz, warsaw],
      ["Pacific/Auckland", { latitude: -36.85, longitude: 174.76 }],
      ["Pacific/Kiritimati", { latitude: 1.87, longitude: -157.43 }],
    ] as const) {
      for (const date of ["2026-03-29T12:00:00Z", "2026-10-25T12:00:00Z"]) {
        const day = Date.parse(date);
        const times = sunTimes(day, zone, location);
        expect(times).toHaveLength(2);
        expect(times.every((s) => sameDay(s.at, day, zone))).toBe(true);
      }
    }
  });

  it("omits markers during polar day/night and for invalid coordinates", () => {
    for (const date of ["2026-06-21", "2026-12-21"]) {
      expect(sunTimes(Date.parse(date), "Europe/Oslo", { latitude: 78.22, longitude: 15.65 })).toEqual([]);
    }
    for (const latitude of [NaN, Infinity, 91]) expect(sunTimes(Date.now(), tz, { latitude, longitude: 21 })).toEqual([]);
    expect(sunTimes(Date.now(), tz, { latitude: 52, longitude: 181 })).toEqual([]);
  });
});
