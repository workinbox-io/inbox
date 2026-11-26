/** Free slots picked in the grid, as text to paste into an e-mail ("Tue, Nov 14 · 10:00–11:30 CET"). */
import { formatTime, sameDay, startOfDay, zoneAbbr, type HourCycle } from "./time";

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

/** Keep only the parts of the selection outside busy events (including private busy blocks). */
export function availableSlots(slots: Slot[], events: (Slot & { busy: boolean; status: string; myStatus: string | null })[]): Slot[] {
  const busy = mergeSlots(events.filter((e) => e.busy && e.status !== "cancelled" && e.myStatus !== "declined"));
  return mergeSlots(slots).flatMap((slot) => {
    const free: Slot[] = [];
    let start = slot.start;
    for (const block of busy) {
      if (block.end <= start) continue;
      if (block.start >= slot.end) break;
      if (block.start > start) free.push({ start, end: block.start });
      start = Math.max(start, block.end);
      if (start >= slot.end) break;
    }
    if (start < slot.end) free.push({ start, end: slot.end });
    return free;
  });
}

/** One line per day in `tz`, its slots comma-separated, the zone named once per line. */
export function availabilityText(slots: Slot[], tz: string, locale = "en-US", hourCycle?: HourCycle): string {
  const day = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const time = (ms: number) => formatTime(ms, tz, locale, hourCycle);
  const days = new Map<number, Slot[]>();
  for (const s of mergeSlots(slots)) {
    const key = startOfDay(s.start, tz);
    days.set(key, [...(days.get(key) ?? []), s]);
  }
  return [...days.values()]
    .map((list) => {
      const ranges = list.map((s) => `${time(s.start)}–${sameDay(s.start, s.end, tz) ? "" : day.format(s.end) + " "}${time(s.end)}`).join(", ");
      return `${day.format(list[0].start)} · ${ranges} ${zoneAbbr(list[0].start, tz, locale)}`;
    })
    .join("\n");
}
