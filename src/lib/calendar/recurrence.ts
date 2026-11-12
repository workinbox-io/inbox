/**
 * Recurring series: ical.js iterates the RRULE in the series' wall clock (floating time), and each occurrence
 * is placed in its zone through Intl, so 09:00 stays 09:00 across DST changes. UNTIL is checked here, because
 * ical.js would compare a UTC UNTIL with floating times.
 */
import ICAL from "ical.js";
import { fromWallTime, wallTime } from "./time";

export interface Series {
  startsAt: number;
  endsAt: number;
  timezone: string;
  allDay: boolean;
  rrule: string | null;
  exdates: number[];
}

export interface Occurrence {
  start: number;
  end: number;
  /** The occurrence's start as the rule placed it: identifies it for overrides and EXDATE. */
  originalStart: number;
}

/** The most occurrences one series yields per call (a daily rule over ~3 years). */
export const MAX_OCCURRENCES = 1000;

function untilMs(recur: ICAL.Recur, tz: string): number | null {
  const u = recur.until;
  if (!u) return null;
  if (u.isDate) return fromWallTime({ year: u.year, month: u.month, day: u.day, hour: 23, minute: 59, second: 59 }, tz);
  if (u.zone === ICAL.Timezone.utcTimezone) return u.toUnixTime() * 1000;
  return fromWallTime({ year: u.year, month: u.month, day: u.day, hour: u.hour, minute: u.minute, second: u.second }, tz);
}

/** Occurrence starts of a series, in order, until `to` (exclusive) or the rule ends. */
function* starts(series: Series, to = Infinity): Generator<number> {
  if (!series.rrule) {
    if (series.startsAt < to) yield series.startsAt;
    return;
  }
  const recur = ICAL.Recur.fromString(series.rrule.replace(/^RRULE:/i, ""));
  const until = untilMs(recur, series.timezone);
  recur.until = null;
  const w = wallTime(series.startsAt, series.timezone);
  const dtstart = ICAL.Time.fromData(
    series.allDay
      ? { year: w.year, month: w.month, day: w.day, isDate: true }
      : { year: w.year, month: w.month, day: w.day, hour: w.hour, minute: w.minute, second: w.second },
  );
  const it = recur.iterator(dtstart);
  // Rules can be sparse (yearly on Feb 29); cap the iterations, not only the yield.
  for (let i = 0, next = it.next(); next && i < 50 * MAX_OCCURRENCES; i++, next = it.next()) {
    const at = fromWallTime(
      { year: next.year, month: next.month, day: next.day, hour: next.hour, minute: next.minute, second: next.second },
      series.timezone,
    );
    if (at >= to || (until !== null && at > until)) return;
    yield at;
  }
}

/**
 * Occurrences overlapping [from, to). `replaced` are the original starts of overrides (shown as their own rows);
 * they are left out like EXDATEs.
 */
export function expand(series: Series, from: number, to: number, replaced: number[] = []): Occurrence[] {
  const length = series.endsAt - series.startsAt;
  const skip = new Set([...series.exdates, ...replaced]);
  const out: Occurrence[] = [];
  for (const start of starts(series, to)) {
    if (start + length <= from || skip.has(start)) continue;
    out.push({ start, end: start + length, originalStart: start });
    if (out.length >= MAX_OCCURRENCES) break;
  }
  return out;
}

/** The last occurrence's start, or null when the series never ends (stored as `recur_until`). */
export function seriesEnd(series: Series): number | null {
  if (!series.rrule) return series.startsAt;
  const recur = ICAL.Recur.fromString(series.rrule.replace(/^RRULE:/i, ""));
  if (!recur.until && !recur.count) return null;
  let last = series.startsAt;
  let n = 0;
  for (const s of starts(series)) {
    last = s;
    // shortcut: a bounded rule with more than this many occurrences is treated as endless, fine for range queries.
    if (++n > 50 * MAX_OCCURRENCES) return null;
  }
  return last;
}

/**
 * "This and following" from occurrence `at`: the old series stops just before it, the new one starts there.
 * COUNT is shared out between the two.
 */
export function splitRule(series: Series, at: number): { before: string; after: string } {
  const rule = series.rrule!.replace(/^RRULE:/i, "");
  const recur = ICAL.Recur.fromString(rule);
  const kept = [...starts(series, at)].length;
  const before = ICAL.Recur.fromString(rule);
  before.count = null;
  before.until = ICAL.Time.fromJSDate(new Date(at - 1000), true);
  const after = ICAL.Recur.fromString(rule);
  if (recur.count) after.count = Math.max(1, recur.count - kept);
  return { before: before.toString(), after: after.toString() };
}
