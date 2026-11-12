/** Types and small helpers shared by the calendar's parts (grid, month, panel, rail). */
import { WORKSPACE_COLORS } from "@/components/workspace/ui"
import { addDays, formatTime, fromWallTime, startOfDay, startOfMonth, startOfWeek, wallTime, type HourCycle } from "@/lib/calendar/time"
import { appLocale, t } from "@/lib/i18n/panel"
import type { CalendarView } from "@/lib/server/calendar/calendars"
import type { EventView } from "@/lib/server/calendar/events"

export type { CalendarView, EventView }
export type ViewMode = "day" | "week" | "month" | "year"
export type Scope = "this" | "following" | "all"

export interface Prefs {
  hourCycle: HourCycle
  timezones: string[]
  weekStart: number
  workStart: number
  workEnd: number
  defaultReminder: number | null
}

/** A new event being drawn or edited before it's saved. */
export interface Draft {
  start: number
  end: number
  allDay: boolean
  /** What's typed in the panel so far, shown on the draft's rectangle. */
  title?: string
}

/** Pixels per hour in the time grid. */
export const HOUR = 48
export const SNAP = 15

export const CALENDAR_COLORS: Record<string, string> = {
  blue: "#4f8ff7",
  green: "#4caf6e",
  orange: "#f0793a",
  red: "#ef5a5a",
  purple: "#8b7cf6",
  pink: "#e66aa8",
  teal: "#2bb3a3",
  yellow: "#e6a23c",
  gray: "#9ca3af",
}

export const eventKey = (e: Pick<EventView, "id" | "occurrence">) => `${e.id}:${e.occurrence ?? ""}`

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

/** Overlaid colleagues get the workspace colours in the order they were added. */
export const personColor = (userId: string, people: string[]) =>
  WORKSPACE_COLORS[(Math.max(0, people.indexOf(userId)) + 1) % WORKSPACE_COLORS.length]!

const pad = (n: number) => String(n).padStart(2, "0")

/** "2026-11-12" for the day `ms` falls on in `tz`. */
export function dayKey(ms: number, tz: string) {
  const w = wallTime(ms, tz)
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`
}

/** Midnight in `tz` of a "YYYY-MM-DD" day, or null. */
export function parseDayKey(key: string | null | undefined, tz: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "")
  if (!m) return null
  return fromWallTime({ year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: 0, minute: 0, second: 0 }, tz)
}

/** "09:30" in `tz`. */
export function timeKey(ms: number, tz: string) {
  const w = wallTime(ms, tz)
  return `${pad(w.hour)}:${pad(w.minute)}`
}

/** The instant of day `day` (a "YYYY-MM-DD") at `time` ("HH:MM") in `tz`. */
export function joinDayTime(day: string, time: string, tz: string) {
  const d = parseDayKey(day, tz)
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (d === null || !m) return null
  return atMinute(d, +m[1]! * 60 + +m[2]!, tz)
}

/** `minutes` after midnight of `dayStart` on the wall clock (DST-safe). */
export function atMinute(dayStart: number, minutes: number, tz: string) {
  const w = wallTime(dayStart, tz)
  return fromWallTime({ ...w, hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0 }, tz)
}

/** The days shown and the range to load for a view around `date`. */
export function rangeOf(date: number, view: ViewMode, tz: string, weekStart: number) {
  if (view === "year") {
    const w = wallTime(startOfMonth(date, tz), tz)
    const from = fromWallTime({ ...w, month: 1 }, tz)
    return { days: [], from, to: fromWallTime({ ...w, year: w.year + 1, month: 1 }, tz) }
  }
  const first = view === "day" ? startOfDay(date, tz) : view === "week" ? startOfWeek(date, tz, weekStart) : startOfWeek(startOfMonth(date, tz), tz, weekStart)
  const count = view === "day" ? 1 : view === "week" ? 7 : 42
  const days = Array.from({ length: count }, (_, i) => addDays(first, i, tz))
  return { days, from: first, to: addDays(first, count, tz) }
}

/** The next period (`dir` 1) or the previous one (-1). */
export function stepDate(date: number, view: ViewMode, dir: 1 | -1, tz: string) {
  if (view === "day") return addDays(date, dir, tz)
  if (view === "week") return addDays(date, 7 * dir, tz)
  const w = wallTime(startOfMonth(date, tz), tz)
  if (view === "year") return fromWallTime({ ...w, year: w.year + dir, month: 1 }, tz)
  return fromWallTime({ ...w, month: w.month + dir, day: 1 }, tz)
}

export function fmt(ms: number, tz: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(appLocale(), { timeZone: tz, ...opts }).format(ms)
}

/** A date range in the locale's own shape ("10–16 November 2026", "27 Oct – 2 Nov 2026"). */
export function fmtRange(from: number, to: number, tz: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(appLocale(), { timeZone: tz, ...opts }).formatRange(from, to)
}

export const fmtTime = (ms: number, tz: string, hourCycle?: HourCycle) => formatTime(ms, tz, appLocale(), hourCycle)

/** Events shown in the all-day row: all-day ones and those lasting a day or more. */
export const isAllDayRow = (e: Pick<EventView, "allDay" | "start" | "end">) => e.allDay || e.end - e.start >= 86_400_000

/** Repeat presets offered in the panel, as RRULE values (weekly without BYDAY repeats on the start's weekday). */
export function repeatPresets(start: number, tz: string) {
  return [
    { value: "", label: t("Doesn't repeat") },
    { value: "FREQ=DAILY", label: t("Every day") },
    { value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: t("Every weekday") },
    { value: "FREQ=WEEKLY", label: t("Every week on {day}", { day: fmt(start, tz, { weekday: "long" }) }) },
    { value: "FREQ=MONTHLY", label: t("Every month") },
    { value: "FREQ=YEARLY", label: t("Every year") },
  ]
}

export const canEdit = (e: EventView) => e.role === "owner" || e.role === "edit"

export const LS = {
  read<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key)
      return v ? (JSON.parse(v) as T) : fallback
    } catch {
      return fallback
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Private mode: the preference just isn't kept.
    }
  },
}
