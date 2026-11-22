import { addDays, fromWallTime, startOfDay, wallTime, weekday } from "./time";

const WEEKDAYS = [
  ["sunday", "niedziela", "niedzielę"],
  ["monday", "poniedziałek"],
  ["tuesday", "wtorek"],
  ["wednesday", "środa", "środę"],
  ["thursday", "czwartek"],
  ["friday", "piątek"],
  ["saturday", "sobota", "sobotę"],
];

/** shortcut: common English/Polish date phrases only; extend the grammar when more phrasing is needed. */
export function parseQuickEvent(input: string, tz: string, now = Date.now()) {
  if (input.length > 500) return null;
  let title = input.trim();
  const take = (pattern: RegExp) => {
    const match = pattern.exec(title);
    if (match) title = title.slice(0, match.index) + " " + title.slice(match.index + match[0].length);
    return match;
  };
  let day = startOfDay(now, tz);
  let dated = false;
  const date = take(/(?:^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/);
  if (date) {
    const year = Number(date[1]), month = Number(date[2]), d = Number(date[3]);
    day = fromWallTime({ year, month, day: d, hour: 0, minute: 0, second: 0 }, tz);
    const w = wallTime(day, tz);
    if (w.year !== year || w.month !== month || w.day !== d) return null;
    dated = true;
  } else {
    const relative = take(/(?:^|\s)(today|tomorrow|day after tomorrow|dzisiaj|dziś|jutro|pojutrze)(?=\s|$)/i);
    if (relative) {
      const word = relative[1]!.toLowerCase();
      day = addDays(day, /^(day after tomorrow|pojutrze)$/.test(word) ? 2 : /^(tomorrow|jutro)$/.test(word) ? 1 : 0, tz);
      dated = true;
    } else {
      const names = WEEKDAYS.flat().join("|");
      const named = take(new RegExp(`(?:^|\\s)(?:(?:on|next|w|we)\\s+)?(${names})(?=\\s|$)`, "i"));
      if (named) {
        const target = WEEKDAYS.findIndex((words) => words.includes(named[1]!.toLowerCase()));
        day = addDays(day, (target - weekday(day, tz) + 7) % 7 || 7, tz);
        dated = true;
      }
    }
  }
  const duration = take(/(?:^|\s)(?:for|przez|na)\s+(\d+)\s*(minutes?|mins?|min|m|hours?|hrs?|h|godzinę|godziny|godzin|godz)(?=\s|$)/i);
  const minutes = duration ? Number(duration[1]) * (/^(h|godz)/i.test(duration[2]!) ? 60 : 1) : 60;
  if (minutes < 1 || minutes > 1440) return null;
  const allDay = take(/(?:^|\s)(all[- ]day|cały dzień)(?=\s|$)/i);
  const time = take(/(?:^|\s)(?:(?:at|o)\s+)?(\d{1,2})(?::(\d{2}))\s*(am|pm)?(?=\s|$)|(?:^|\s)(?:(?:at|o)\s+)(\d{1,2})\s*(am|pm)?(?=\s|$)|(?:^|\s)(\d{1,2})\s*(am|pm)(?=\s|$)/i);
  if ((!dated && !time) || (allDay && time) || (duration && !time)) return null;
  let start = day;
  if (time) {
    let hour = Number(time[1] ?? time[4] ?? time[6]);
    const minute = Number(time[2] ?? 0);
    const period = (time[3] ?? time[5] ?? time[7])?.toLowerCase();
    if (minute > 59 || hour > (period ? 12 : 23) || (period && hour < 1)) return null;
    if (period) hour = hour % 12 + (period === "pm" ? 12 : 0);
    start = fromWallTime({ ...wallTime(day, tz), hour, minute, second: 0 }, tz);
    if (!dated && start < now) start = addDays(start, 1, tz);
  }
  title = title.replace(/\s+/g, " ").trim();
  // Don't turn an unsupported time range or a second date into an all-day event.
  if (!title || /\d:\d|\d\s*(?:am|pm)\b|\d{4}-\d{2}-\d{2}/i.test(title)) return null;
  return { title, start, end: time ? start + minutes * 60_000 : addDays(start, 1, tz), allDay: !time };
}
