/** Common free time: slots of `duration` inside working hours (weekdays, in `tz`) that miss every busy block. */
import { mergeSlots, type Slot } from "./availability";
import { addDays, fromWallTime, startOfDay, wallTime, weekday } from "./time";

export interface FreeTimeQuery {
  busy: Slot[];
  from: number;
  to: number;
  /** Minutes. */
  duration: number;
  tz: string;
  /** Minutes from midnight. */
  workStart: number;
  workEnd: number;
  /** Candidate starts are aligned to this many minutes. */
  step?: number;
  limit?: number;
}

const MIN = 60_000;

export function findFreeSlots(q: FreeTimeQuery): Slot[] {
  const step = (q.step ?? 30) * MIN;
  const length = q.duration * MIN;
  const busy = mergeSlots(q.busy);
  const out: Slot[] = [];
  for (let day = startOfDay(q.from, q.tz); day < q.to && out.length < (q.limit ?? 10); day = addDays(day, 1, q.tz)) {
    const wd = weekday(day, q.tz);
    if (wd === 0 || wd === 6) continue;
    const w = wallTime(day, q.tz);
    const at = (m: number) => fromWallTime({ ...w, hour: Math.floor(m / 60), minute: m % 60, second: 0 }, q.tz);
    const open = Math.max(at(q.workStart), q.from);
    const close = Math.min(at(q.workEnd), q.to);
    // First aligned start at or after `open`, measured from the working day's start.
    let start = at(q.workStart) + Math.ceil(Math.max(0, open - at(q.workStart)) / step) * step;
    while (start + length <= close && out.length < (q.limit ?? 10)) {
      const clash = busy.find((b) => b.start < start + length && b.end > start);
      if (!clash) {
        out.push({ start, end: start + length });
        start += step;
      } else start = at(q.workStart) + Math.ceil((clash.end - at(q.workStart)) / step) * step;
    }
  }
  return out;
}
