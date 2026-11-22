/**
 * A collection's settings beyond its fields (collections.settings): cycles (sprints of 1–8 weeks counted from a start
 * date), triage (records from viewers, API keys and AI apps wait for someone to accept them), an SLA per priority, and
 * record templates. Plus the dates of repeating records. Pure, tested in test/collections.test.ts.
 */
import { z } from "zod";
import type { RecordValues } from "./fields";

export const REPEAT_UNITS = ["day", "week", "month"] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

export type RecordTemplate = { id: string; name: string; title: string; values: RecordValues; description?: unknown[] | null };
export type Cycles = { weeks: number; start: string };
export type Sla = { field: string; hours: Record<string, number> };

export type CollectionSettings = {
  cycles?: Cycles | null;
  triage?: boolean;
  sla?: Sla | null;
  templates?: RecordTemplate[];
};

export const MAX_TEMPLATES = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

export const templateSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  name: z.string().trim().min(1, "Name the template").max(80),
  title: z.string().trim().max(300).default(""),
  values: z.record(z.string(), z.unknown()).default({}),
  description: z.array(z.unknown()).nullable().optional(),
});

export const settingsSchema = z.object({
  cycles: z.object({ weeks: z.number().int().min(1).max(8), start: z.string().regex(DATE, "Pick the first cycle's start date") }).nullable().optional(),
  triage: z.boolean().optional(),
  sla: z.object({ field: z.string().min(1).max(32), hours: z.record(z.string().max(60), z.number().positive().max(24 * 365)) }).nullable().optional(),
  templates: z.array(templateSchema).max(MAX_TEMPLATES).optional(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Today as `YYYY-MM-DD` in the viewer's (or the server's, UTC) calendar. */
export function today(now = new Date(), local = true) {
  if (!local) return now.toISOString().slice(0, 10);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The cycle a day falls in (1 = the one starting on `start`); 0 before the first. */
export function cycleOf(c: Cycles, iso: string) {
  const diff = dayOf(iso) - dayOf(c.start);
  return diff < 0 ? 0 : Math.floor(diff / (c.weeks * 7 * DAY)) + 1;
}

/** First and last day of cycle `n`. */
export function cycleRange(c: Cycles, n: number) {
  const start = dayOf(c.start) + (n - 1) * c.weeks * 7 * DAY;
  return { start: isoDay(start), end: isoDay(start + (c.weeks * 7 - 1) * DAY) };
}

/** Days left in the cycle `iso` falls in, counting `iso` itself. */
export function cycleDaysLeft(c: Cycles, iso: string) {
  return Math.round((dayOf(cycleRange(c, cycleOf(c, iso)).end) - dayOf(iso)) / DAY) + 1;
}

/** Hours the SLA gives a record with this value of its field; null = no SLA. */
export const slaHours = (sla: Sla | null | undefined, values: RecordValues) => {
  const v = sla ? values[sla.field] : undefined;
  return typeof v === "string" && sla!.hours[v] ? sla!.hours[v]! : null;
};

/** Where an open record stands: due at `dueAt`; "soon" in its last quarter (or last 2 hours), then "breached". */
export function slaState(createdAt: number, hours: number, now: number) {
  const dueAt = createdAt + hours * 3_600_000;
  const left = dueAt - now;
  return { dueAt, left, state: left <= 0 ? ("breached" as const) : left < Math.max(hours * 900_000, 2 * 3_600_000) ? ("soon" as const) : ("ok" as const) };
}

/** "3d", "5h", "20m" for the time left (or over). */
export function shortSpan(ms: number) {
  const m = Math.abs(ms) / 60_000;
  return m >= 1440 ? `${Math.round(m / 1440)}d` : m >= 60 ? `${Math.round(m / 60)}h` : `${Math.max(1, Math.round(m))}m`;
}

/** The run after `at` (a UTC midnight): `every` days, weeks or months on; months keep the day, or the month's last. */
export function nextRun(at: number, every: number, unit: RepeatUnit) {
  const d = new Date(at);
  if (unit === "day") return at + every * DAY;
  if (unit === "week") return at + every * 7 * DAY;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + every, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last));
}

/** A UTC midnight from `YYYY-MM-DD`. */
export const dayMs = dayOf;
