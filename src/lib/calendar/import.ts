/** .ics import: a file's events grouped into series (master + its overrides by UID), standalone overrides dropped. */
import type { IcsEvent } from "./ics";

export const MAX_IMPORT_EVENTS = 5000;

export interface ImportSeries {
  master: IcsEvent;
  overrides: IcsEvent[];
}

export function groupSeries(events: IcsEvent[]): ImportSeries[] {
  const byUid = new Map<string, ImportSeries>();
  for (const e of events) if (e.recurrenceId === null && !byUid.has(e.uid)) byUid.set(e.uid, { master: e, overrides: [] });
  // An override whose master isn't in the file (an exported single occurrence) is kept as a single event.
  for (const e of events) {
    if (e.recurrenceId === null) continue;
    const series = byUid.get(e.uid);
    if (series?.master.rrule) series.overrides.push(e);
    else if (!series) byUid.set(e.uid, { master: { ...e, recurrenceId: null }, overrides: [] });
  }
  return [...byUid.values()];
}
