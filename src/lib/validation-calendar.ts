/** Request bodies of the calendar API (/api/app/calendar, /api/v1/calendar, MCP). */
import { z } from "zod";
import { isTimeZone } from "@/lib/calendar/time";

const ms = z.coerce.number().int().min(0).max(8_640_000_000_000);
const tz = z.string().max(64).refine(isTimeZone, "Unknown time zone");
const rrule = z
  .string()
  .trim()
  .max(500)
  .regex(/^(RRULE:)?FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,+\-:]+)*$/, "Invalid repeat rule");

export const COLORS = ["blue", "green", "orange", "red", "purple", "pink", "teal", "yellow", "gray"] as const;

export const eventListSchema = z.object({
  from: ms,
  to: ms,
  /** Comma-separated calendar ids to show (default: all visible). */
  calendars: z.string().max(4000).optional(),
  /** Comma-separated user ids whose calendars are overlaid. */
  people: z.string().max(4000).optional(),
});

export const attendeeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(254),
  name: z.string().trim().max(200).optional(),
  optional: z.boolean().optional(),
});

const fields = {
  calendarId: z.string().min(1).max(100),
  title: z.string().trim().max(500),
  description: z.string().max(20_000),
  location: z.string().trim().max(500),
  url: z.union([z.literal(""), z.string().trim().url().max(2000)]),
  start: ms,
  end: ms,
  allDay: z.boolean(),
  timezone: tz,
  rrule: rrule.nullable(),
  busy: z.boolean(),
  status: z.enum(["confirmed", "tentative", "cancelled"]),
  reminders: z.array(z.number().int().min(0).max(40_320)).max(5),
  attendees: z.array(attendeeSchema).max(200),
};

export const eventSchema = z
  .object(fields)
  .partial()
  .required({ start: true, end: true })
  .refine((v) => v.end >= v.start, { message: "The event ends before it starts" });

export const eventUpdateSchema = z
  .object({
    ...fields,
    /** Which part of a series: this occurrence (needs `occurrence`), it and the following ones, or all. */
    scope: z.enum(["this", "following", "all"]),
    /** The occurrence's original start (ms). */
    occurrence: ms,
  })
  .partial()
  .refine((v) => v.start === undefined || v.end === undefined || v.end >= v.start, { message: "The event ends before it starts" });

export const eventDeleteSchema = z.object({
  scope: z.enum(["this", "following", "all"]).default("all"),
  occurrence: ms.optional(),
});

export const rsvpSchema = z.object({ status: z.enum(["accepted", "declined", "tentative"]) });

export const calendarSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  color: z.enum(COLORS).default("blue"),
  /** Subscribe: an .ics address (Google's "Secret address in iCal format"); webcal:// is read as https://. */
  url: z
    .string()
    .trim()
    .max(2000)
    .transform((u) => u.replace(/^webcals?:\/\//i, "https://"))
    .pipe(z.string().url("Enter the calendar's address").startsWith("https://", "The address must start with https://"))
    // Google's sharing link (…/calendar/u/0?cid=…) carries no key; only /calendar/ical/… addresses are feeds.
    .refine((u) => !/^https:\/\/calendar\.google\.com\//i.test(u) || /\/calendar\/ical\//i.test(u), {
      message: "That's Google's sharing link, not a feed. In Google Calendar's settings open the calendar, scroll to \"Integrate calendar\" and copy \"Secret address in iCal format\".",
    })
    .optional(),
});

export const calendarUpdateSchema = calendarSchema.omit({ url: true }).partial();

export const prefsSchema = z.object({
  hourCycle: z.enum(["h12", "h23"]),
  timezones: z.array(tz).min(1).max(3),
  weekStart: z.union([z.literal(0), z.literal(1), z.literal(6)]),
  workStart: z.number().int().min(0).max(1440),
  workEnd: z.number().int().min(0).max(1440),
  defaultReminder: z.number().int().min(0).max(40_320).nullable(),
}).partial();

export type EventInput = z.output<typeof eventSchema>;
export type EventUpdate = z.output<typeof eventUpdateSchema>;
export type EventDelete = z.output<typeof eventDeleteSchema>;
export type CalendarPrefsInput = z.output<typeof prefsSchema>;
