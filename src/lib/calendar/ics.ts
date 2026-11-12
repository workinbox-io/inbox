/**
 * iCalendar in and out (RFC 5545, iTIP methods for invitations), on ical.js. Used by invitations (REQUEST,
 * CANCEL, REPLY), the subscription feed and .ics import.
 */
import ICAL from "ical.js";
import { fromWallTime, isTimeZone, wallTime } from "./time";

export type IcsMethod = "REQUEST" | "CANCEL" | "REPLY" | "PUBLISH";
export type PartStat = "needs-action" | "accepted" | "declined" | "tentative";

export interface IcsPerson {
  email: string;
  name?: string;
}

export interface IcsAttendee extends IcsPerson {
  status: PartStat;
  optional?: boolean;
}

export interface IcsEvent {
  uid: string;
  sequence: number;
  title: string;
  description: string;
  location: string;
  url: string;
  start: number;
  end: number;
  allDay: boolean;
  /** IANA zone of the wall clock; the parser's `defaultTz` when the file had none it could name. */
  timezone: string;
  rrule: string | null;
  exdates: number[];
  /** Set on an override of one occurrence: that occurrence's original start. */
  recurrenceId: number | null;
  status: "confirmed" | "tentative" | "cancelled";
  busy: boolean;
  organizer: IcsPerson | null;
  attendees: IcsAttendee[];
}

const PRODID = "-//Work Inbox//Calendar//EN";

const PARTSTAT: Record<string, PartStat> = {
  "NEEDS-ACTION": "needs-action",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  TENTATIVE: "tentative",
};

const mailto = (value: unknown) =>
  String(value ?? "")
    .replace(/^mailto:/i, "")
    .trim()
    .toLowerCase();

// ---------- out ----------

function utcTime(ms: number) {
  return ICAL.Time.fromJSDate(new Date(ms), true);
}

function wall(ms: number, tz: string, date = false) {
  const w = wallTime(ms, tz);
  return ICAL.Time.fromData(date ? { year: w.year, month: w.month, day: w.day, isDate: true } : { ...w });
}

/** DTSTART-like property: dates for all-day, the zone's wall clock for series (DST-correct), UTC otherwise. */
function timeProp(name: string, ms: number, e: IcsEvent) {
  const prop = new ICAL.Property(name);
  if (e.allDay) prop.setValue(wall(ms, e.timezone, true));
  else if (e.rrule || e.recurrenceId !== null) {
    // shortcut: TZID without a VTIMEZONE block; Google, Apple and Outlook resolve IANA names. Add VTIMEZONEs if a client complains.
    prop.setParameter("tzid", e.timezone);
    prop.setValue(wall(ms, e.timezone));
  } else prop.setValue(utcTime(ms));
  return prop;
}

function person(name: "organizer" | "attendee", p: IcsPerson) {
  const prop = new ICAL.Property(name);
  prop.setValue(`mailto:${p.email}`);
  if (p.name) prop.setParameter("cn", p.name);
  return prop;
}

function vevent(e: IcsEvent, method: IcsMethod | undefined) {
  const c = new ICAL.Component("vevent");
  c.addPropertyWithValue("uid", e.uid);
  c.addPropertyWithValue("dtstamp", utcTime(Date.now()));
  c.addPropertyWithValue("sequence", e.sequence);
  c.addProperty(timeProp("dtstart", e.start, e));
  c.addProperty(timeProp("dtend", e.end, e));
  if (e.recurrenceId !== null) c.addProperty(timeProp("recurrence-id", e.recurrenceId, e));
  if (e.rrule) c.addPropertyWithValue("rrule", ICAL.Recur.fromString(e.rrule.replace(/^RRULE:/i, "")));
  for (const x of e.exdates) c.addProperty(timeProp("exdate", x, e));
  if (e.title) c.addPropertyWithValue("summary", e.title);
  if (e.description && method !== "REPLY") c.addPropertyWithValue("description", e.description);
  if (e.location) c.addPropertyWithValue("location", e.location);
  if (e.url) c.addPropertyWithValue("url", e.url);
  c.addPropertyWithValue("status", method === "CANCEL" ? "CANCELLED" : e.status.toUpperCase());
  c.addPropertyWithValue("transp", e.busy ? "OPAQUE" : "TRANSPARENT");
  if (e.organizer) c.addProperty(person("organizer", e.organizer));
  for (const a of e.attendees) {
    const prop = person("attendee", a);
    prop.setParameter("partstat", a.status.toUpperCase());
    prop.setParameter("role", a.optional ? "OPT-PARTICIPANT" : "REQ-PARTICIPANT");
    if (method === "REQUEST" && a.status === "needs-action") prop.setParameter("rsvp", "TRUE");
    c.addProperty(prop);
  }
  return c;
}

/** A VCALENDAR with the events (a series' master and its overrides share a UID and go together). */
export function toIcs(events: IcsEvent[], method?: IcsMethod, name?: string): string {
  const cal = new ICAL.Component("vcalendar");
  cal.addPropertyWithValue("prodid", PRODID);
  cal.addPropertyWithValue("version", "2.0");
  cal.addPropertyWithValue("calscale", "GREGORIAN");
  if (method) cal.addPropertyWithValue("method", method);
  if (name) cal.addPropertyWithValue("x-wr-calname", name);
  for (const e of events) cal.addSubcomponent(vevent(e, method));
  return cal.toString().replace(/\r?\n/g, "\r\n") + "\r\n";
}

// ---------- in ----------

interface Instant {
  ms: number;
  date: boolean;
  tz: string | null;
}

function instant(prop: ICAL.Property, defaultTz: string): Instant {
  const t = prop.getFirstValue() as ICAL.Time;
  const tzid = prop.getParameter("tzid") as string | undefined;
  const w = { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second };
  if (t.isDate) return { ms: fromWallTime({ ...w, hour: 0, minute: 0, second: 0 }, defaultTz), date: true, tz: null };
  if (t.zone === ICAL.Timezone.utcTimezone) return { ms: t.toUnixTime() * 1000, date: false, tz: null };
  if (tzid && isTimeZone(tzid)) return { ms: fromWallTime(w, tzid), date: false, tz: tzid };
  // A VTIMEZONE from the file (Outlook's "Central European Standard Time"…), registered by parseIcs.
  if (tzid && ICAL.TimezoneService.has(tzid)) {
    t.zone = ICAL.TimezoneService.get(tzid)!;
    return { ms: t.toUnixTime() * 1000, date: false, tz: null };
  }
  return { ms: fromWallTime(w, defaultTz), date: false, tz: null };
}

function readEvent(c: ICAL.Component, defaultTz: string): IcsEvent | null {
  const uid = String(c.getFirstPropertyValue("uid") ?? "").trim();
  const startProp = c.getFirstProperty("dtstart");
  if (!uid || !startProp) return null;
  const start = instant(startProp, defaultTz);
  // shortcut: a series in a non-IANA zone repeats in the reader's zone, off by an hour across a DST change it doesn't share.
  const timezone = start.tz ?? defaultTz;
  let end = start.ms + (start.date ? 86_400_000 : 0);
  const endProp = c.getFirstProperty("dtend");
  const duration = c.getFirstPropertyValue("duration") as ICAL.Duration | null;
  if (endProp) end = instant(endProp, defaultTz).ms;
  else if (duration) end = start.ms + duration.toSeconds() * 1000;
  const recurId = c.getFirstProperty("recurrence-id");
  const rrule = c.getFirstPropertyValue("rrule") as ICAL.Recur | null;
  const exdates = c
    .getAllProperties("exdate")
    .flatMap((p) => p.getValues().map((v) => {
      const one = new ICAL.Property("exdate");
      const tzid = p.getParameter("tzid");
      if (tzid) one.setParameter("tzid", tzid as string);
      one.setValue(v as ICAL.Time);
      return instant(one, timezone).ms;
    }));
  const status = String(c.getFirstPropertyValue("status") ?? "CONFIRMED").toLowerCase();
  const organizer = c.getFirstProperty("organizer");
  return {
    uid,
    sequence: Number(c.getFirstPropertyValue("sequence") ?? 0) || 0,
    title: String(c.getFirstPropertyValue("summary") ?? ""),
    description: String(c.getFirstPropertyValue("description") ?? ""),
    location: String(c.getFirstPropertyValue("location") ?? ""),
    url: String(c.getFirstPropertyValue("url") ?? ""),
    start: start.ms,
    end: Math.max(end, start.ms),
    allDay: start.date,
    timezone,
    rrule: rrule ? rrule.toString() : null,
    exdates,
    recurrenceId: recurId ? instant(recurId, timezone).ms : null,
    status: status === "cancelled" || status === "tentative" ? status : "confirmed",
    busy: String(c.getFirstPropertyValue("transp") ?? "OPAQUE").toUpperCase() !== "TRANSPARENT",
    organizer: organizer
      ? { email: mailto(organizer.getFirstValue()), name: (organizer.getParameter("cn") as string) || undefined }
      : null,
    attendees: c.getAllProperties("attendee").map((p) => ({
      email: mailto(p.getFirstValue()),
      name: (p.getParameter("cn") as string) || undefined,
      status: PARTSTAT[String(p.getParameter("partstat") ?? "NEEDS-ACTION").toUpperCase()] ?? "needs-action",
      optional: String(p.getParameter("role") ?? "").toUpperCase() === "OPT-PARTICIPANT",
    })),
  };
}

/** Events of an .ics file (all VCALENDARs in it). Throws on text that isn't iCalendar. */
export function parseIcs(text: string, defaultTz = "UTC"): { method: IcsMethod | null; events: IcsEvent[] } {
  const parsed = ICAL.parse(text);
  const roots = (Array.isArray(parsed[0]) ? parsed : [parsed]) as unknown[];
  let method: IcsMethod | null = null;
  const events: IcsEvent[] = [];
  for (const root of roots) {
    const cal = new ICAL.Component(root as unknown[]);
    for (const tz of cal.getAllSubcomponents("vtimezone")) {
      const id = String(tz.getFirstPropertyValue("tzid") ?? "");
      if (id && !isTimeZone(id) && !ICAL.TimezoneService.has(id)) ICAL.TimezoneService.register(tz);
    }
    const m = String(cal.getFirstPropertyValue("method") ?? "").toUpperCase();
    if (m === "REQUEST" || m === "CANCEL" || m === "REPLY" || m === "PUBLISH") method = m;
    for (const c of cal.getAllSubcomponents("vevent")) {
      const e = readEvent(c, defaultTz);
      if (e) events.push(e);
    }
  }
  return { method, events };
}
