/**
 * Wall-clock time in IANA zones through Intl (workerd and browsers carry the tz database), so the calendar
 * needs no date library. All instants are UTC ms.
 */

export interface WallTime {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const DAY = 86_400_000;
export type HourCycle = "h12" | "h23";

export function formatTime(ms: number, tz: string, locale = "en-US", hourCycle?: HourCycle) {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle }).format(ms);
}
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isTimeZone(tz: string) {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** The wall clock in `tz` at instant `ms`. */
export function wallTime(ms: number, tz: string): WallTime {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(ms)) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

const asUtc = (w: WallTime) => Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);

/** UTC offset of `tz` at instant `ms`, in ms (Warsaw in winter: +3_600_000). */
export function offsetAt(ms: number, tz: string) {
  return asUtc(wallTime(ms, tz)) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant a wall clock in `tz` shows `w`. Times skipped by DST move forward by the gap (02:30 on the spring
 * change becomes 03:30); repeated times take the first (earlier) instant.
 */
export function fromWallTime(w: WallTime, tz: string) {
  const guess = asUtc(w);
  // Offsets either side of any DST change near this time; a change never comes twice within a day.
  const before = guess - offsetAt(guess - DAY / 2, tz);
  const after = guess - offsetAt(guess + DAY / 2, tz);
  const shows = (ms: number) => asUtc(wallTime(ms, tz)) === guess;
  if (shows(before)) return before <= after || !shows(after) ? before : after;
  if (shows(after)) return after;
  // Skipped by a spring change: the offset before the gap moves the time forward by it.
  return before;
}

/** Midnight of the day `ms` falls on in `tz`. */
export function startOfDay(ms: number, tz: string) {
  const w = wallTime(ms, tz);
  return fromWallTime({ ...w, hour: 0, minute: 0, second: 0 }, tz);
}

/** Same wall-clock time `days` days later (DST-safe). */
export function addDays(ms: number, days: number, tz: string) {
  const w = wallTime(ms, tz);
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return fromWallTime({ ...w, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, tz);
}

/** 0 = Sunday … 6 = Saturday, in `tz`. */
export function weekday(ms: number, tz: string) {
  const w = wallTime(ms, tz);
  return new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
}

/** Midnight of the first day of the week containing `ms`. */
export function startOfWeek(ms: number, tz: string, weekStart = 1) {
  return addDays(startOfDay(ms, tz), -((weekday(ms, tz) - weekStart + 7) % 7), tz);
}

/** Midnight of the 1st of the month containing `ms`. */
export function startOfMonth(ms: number, tz: string) {
  const w = wallTime(ms, tz);
  return fromWallTime({ ...w, day: 1, hour: 0, minute: 0, second: 0 }, tz);
}

/** Minutes since midnight in `tz` (for placing blocks in the grid). */
export function minuteOfDay(ms: number, tz: string) {
  const w = wallTime(ms, tz);
  return w.hour * 60 + w.minute;
}

/** "CET", "GMT+5:30" … */
export function zoneAbbr(ms: number, tz: string, locale = "en-US") {
  const part = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" })
    .formatToParts(ms)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

export const sameDay = (a: number, b: number, tz: string) => startOfDay(a, tz) === startOfDay(b, tz);

/** An ISO 8601 instant; a date-time without an offset ("2026-11-17T15:00") is the wall clock in `tz`. */
export function parseInZone(s: string, tz: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(s.trim());
  if (!m) return Date.parse(s);
  return fromWallTime({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: +(m[6] ?? 0) }, tz);
}

export { DAY };
