/** Free slots picked in the grid, as text to paste into an e-mail ("Tue, Nov 14 · 10:00–11:30 CET"). */
import { startOfDay, zoneAbbr } from "./time";

export interface Slot {
  start: number;
  end: number;
}

/** Sorted, with touching or overlapping slots joined. */
export function mergeSlots(slots: Slot[]): Slot[] {
  const out: Slot[] = [];
  for (const s of [...slots].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** One line per day in `tz`, its slots comma-separated, the zone named once per line. */
export function availabilityText(slots: Slot[], tz: string, locale = "en-US"): string {
  const day = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const time = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const days = new Map<number, Slot[]>();
  for (const s of mergeSlots(slots)) {
    const key = startOfDay(s.start, tz);
    days.set(key, [...(days.get(key) ?? []), s]);
  }
  return [...days.values()]
    .map((list) => {
      const ranges = list.map((s) => `${time.format(s.start)}–${time.format(s.end)}`).join(", ");
      return `${day.format(list[0].start)} · ${ranges} ${zoneAbbr(list[0].start, tz, locale)}`;
    })
    .join("\n");
}
