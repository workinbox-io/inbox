import { describe, expect, it } from "vitest";
import { availabilityText, mergeSlots } from "../src/lib/calendar/availability";
import { parseIcs, toIcs, type IcsEvent } from "../src/lib/calendar/ics";
import { layoutDay } from "../src/lib/calendar/layout";
import { expand, seriesEnd, splitRule, type Series } from "../src/lib/calendar/recurrence";
import { addDays, fromWallTime, startOfWeek, wallTime } from "../src/lib/calendar/time";

const WAW = "Europe/Warsaw";
const at = (s: string) => Date.parse(s);
const hm = (ms: number, tz = WAW) => {
  const w = wallTime(ms, tz);
  return `${w.month}/${w.day} ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
};

describe("time", () => {
  it("converts wall clock both ways across DST", () => {
    expect(fromWallTime({ year: 2026, month: 3, day: 28, hour: 9, minute: 0, second: 0 }, WAW)).toBe(at("2026-03-28T08:00:00Z"));
    expect(fromWallTime({ year: 2026, month: 3, day: 30, hour: 9, minute: 0, second: 0 }, WAW)).toBe(at("2026-03-30T07:00:00Z"));
    // 02:30 doesn't exist on the spring change: moves forward.
    expect(hm(fromWallTime({ year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 }, WAW))).toBe("3/29 03:30");
    // 02:30 exists twice in autumn: the earlier one.
    expect(fromWallTime({ year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 }, WAW)).toBe(at("2026-10-25T00:30:00Z"));
  });

  it("adds days on the wall clock and finds week starts", () => {
    expect(hm(addDays(at("2026-03-28T08:00:00Z"), 2, WAW))).toBe("3/30 09:00");
    expect(startOfWeek(at("2026-11-12T12:00:00Z"), WAW, 1)).toBe(at("2026-11-08T23:00:00Z"));
    expect(startOfWeek(at("2026-11-12T12:00:00Z"), "UTC", 0)).toBe(at("2026-11-08T00:00:00Z"));
  });
});

describe("recurrence", () => {
  const weekly: Series = {
    startsAt: at("2026-03-16T08:00:00Z"), // Mon 09:00 Warsaw (CET)
    endsAt: at("2026-03-16T09:00:00Z"),
    timezone: WAW,
    allDay: false,
    rrule: "FREQ=WEEKLY;COUNT=4",
    exdates: [],
  };

  it("keeps the wall clock across DST", () => {
    const occ = expand(weekly, at("2026-03-01T00:00:00Z"), at("2026-05-01T00:00:00Z"));
    expect(occ.map((o) => hm(o.start))).toEqual(["3/16 09:00", "3/23 09:00", "3/30 09:00", "4/6 09:00"]);
    expect(occ[2].end - occ[2].start).toBe(3_600_000);
  });

  it("skips exdates and overridden occurrences, clips to the range", () => {
    const series = { ...weekly, exdates: [at("2026-03-23T08:00:00Z")] };
    const occ = expand(series, at("2026-03-20T00:00:00Z"), at("2026-05-01T00:00:00Z"), [at("2026-03-30T07:00:00Z")]);
    expect(occ.map((o) => hm(o.start))).toEqual(["4/6 09:00"]);
  });

  it("honours UTC UNTIL and endless rules", () => {
    const until = { ...weekly, rrule: "FREQ=DAILY;UNTIL=20260318T080000Z" };
    expect(expand(until, 0, Infinity).length).toBe(3);
    expect(seriesEnd(until)).toBe(at("2026-03-18T08:00:00Z"));
    expect(seriesEnd({ ...weekly, rrule: "FREQ=DAILY" })).toBeNull();
    expect(seriesEnd(weekly)).toBe(at("2026-04-06T07:00:00Z"));
    expect(expand({ ...weekly, rrule: "FREQ=DAILY" }, at("2027-01-01T00:00:00Z"), at("2027-01-03T00:00:00Z")).length).toBe(2);
  });

  it("splits a series for 'this and following'", () => {
    const { before, after } = splitRule(weekly, at("2026-03-30T07:00:00Z"));
    expect(expand({ ...weekly, rrule: before }, 0, Infinity).map((o) => hm(o.start))).toEqual(["3/16 09:00", "3/23 09:00"]);
    expect(after).toContain("COUNT=2");
  });

  it("expands all-day series by date", () => {
    const day: Series = { ...weekly, allDay: true, startsAt: at("2026-03-15T23:00:00Z"), endsAt: at("2026-03-16T23:00:00Z"), rrule: "FREQ=DAILY;COUNT=3" };
    expect(expand(day, 0, Infinity).map((o) => hm(o.start))).toEqual(["3/16 00:00", "3/17 00:00", "3/18 00:00"]);
  });
});

describe("layout", () => {
  it("puts overlapping blocks side by side", () => {
    const placed = layoutDay([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 30, end: 90 },
      { id: "c", start: 60, end: 120 },
      { id: "d", start: 200, end: 260 },
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(by.a).toEqual({ id: "a", col: 0, cols: 2 });
    expect(by.b).toEqual({ id: "b", col: 1, cols: 2 });
    expect(by.c).toEqual({ id: "c", col: 0, cols: 2 });
    expect(by.d).toEqual({ id: "d", col: 0, cols: 1 });
  });
});

describe("availability", () => {
  it("merges slots and writes one line per day", () => {
    const slots = [
      { start: at("2026-11-17T09:30:00Z"), end: at("2026-11-17T10:00:00Z") },
      { start: at("2026-11-17T09:00:00Z"), end: at("2026-11-17T09:30:00Z") },
      { start: at("2026-11-17T13:00:00Z"), end: at("2026-11-17T14:00:00Z") },
      { start: at("2026-11-18T08:00:00Z"), end: at("2026-11-18T09:00:00Z") },
    ];
    expect(mergeSlots(slots).length).toBe(3);
    expect(availabilityText(slots, WAW)).toBe("Tue, Nov 17 · 10:00 AM–11:00 AM, 2:00 PM–3:00 PM GMT+1\nWed, Nov 18 · 9:00 AM–10:00 AM GMT+1");
    expect(availabilityText(slots, "America/New_York").split("\n")[0]).toBe("Tue, Nov 17 · 4:00 AM–5:00 AM, 8:00 AM–9:00 AM EST");
  });
});

describe("ics", () => {
  const event: IcsEvent = {
    uid: "abc@workinbox.io",
    sequence: 1,
    title: "Planning, Q1; review",
    description: "Line one\nLine two",
    location: "Room 1",
    url: "https://meet.example.com/x",
    start: at("2026-03-16T08:00:00Z"),
    end: at("2026-03-16T09:00:00Z"),
    allDay: false,
    timezone: WAW,
    rrule: "FREQ=WEEKLY;COUNT=4",
    exdates: [at("2026-03-23T08:00:00Z")],
    recurrenceId: null,
    status: "confirmed",
    busy: true,
    organizer: { email: "anna@acme.test", name: "Anna" },
    attendees: [{ email: "bob@example.com", name: "Bob", status: "needs-action" }],
  };

  it("round-trips", () => {
    const text = toIcs([event], "REQUEST");
    expect(text).toContain("METHOD:REQUEST");
    expect(text).toContain("DTSTART;TZID=Europe/Warsaw:20260316T090000");
    expect(text).toContain("RSVP=TRUE");
    const back = parseIcs(text, "UTC");
    expect(back.method).toBe("REQUEST");
    expect(back.events[0]).toMatchObject({ ...event, attendees: [{ email: "bob@example.com", name: "Bob", status: "needs-action", optional: false }] });
  });

  it("reads a Google invitation", () => {
    const gmail = [
      "BEGIN:VCALENDAR",
      "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
      "VERSION:2.0",
      "METHOD:REQUEST",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Warsaw",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "TZNAME:CET",
      "DTSTART:19701025T030000",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "DTSTART;TZID=Europe/Warsaw:20261117T150000",
      "DTEND;TZID=Europe/Warsaw:20261117T153000",
      "DTSTAMP:20261112T100000Z",
      "ORGANIZER;CN=Jan Kowalski:mailto:jan@gmail.com",
      "UID:7kukuqrfedlm2f9t6vnrhq@google.com",
      "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=",
      " TRUE;CN=anna@acme.test;X-NUM-GUESTS=0:mailto:anna@acme.test",
      "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE",
      " ;CN=Jan Kowalski;X-NUM-GUESTS=0:mailto:jan@gmail.com",
      "SEQUENCE:0",
      "STATUS:CONFIRMED",
      "SUMMARY:Demo",
      "TRANSP:OPAQUE",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const { method, events } = parseIcs(gmail);
    expect(method).toBe("REQUEST");
    expect(events[0]).toMatchObject({
      uid: "7kukuqrfedlm2f9t6vnrhq@google.com",
      start: at("2026-11-17T14:00:00Z"),
      end: at("2026-11-17T14:30:00Z"),
      timezone: WAW,
      organizer: { email: "jan@gmail.com", name: "Jan Kowalski" },
    });
    expect(events[0].attendees.map((a) => a.status)).toEqual(["needs-action", "accepted"]);
  });

  it("reads an Outlook invitation with a Windows zone and all-day events", () => {
    const outlook = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "PRODID:Microsoft Exchange Server 2010",
      "VERSION:2.0",
      "BEGIN:VTIMEZONE",
      "TZID:Central European Standard Time",
      "BEGIN:STANDARD",
      "DTSTART:16010101T030000",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10",
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      "DTSTART:16010101T020000",
      "TZOFFSETFROM:+0100",
      "TZOFFSETTO:+0200",
      "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3",
      "END:DAYLIGHT",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "ORGANIZER;CN=Ola:mailto:ola@contoso.com",
      "UID:040000008200E00074C5B7101A82E008",
      "SUMMARY;LANGUAGE=pl-PL:Spotkanie",
      "DTSTART;TZID=Central European Standard Time:20261117T150000",
      "DTEND;TZID=Central European Standard Time:20261117T160000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:allday-1",
      "DTSTART;VALUE=DATE:20261120",
      "DTEND;VALUE=DATE:20261121",
      "SUMMARY:Off",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const { events } = parseIcs(outlook, WAW);
    expect(events[0]).toMatchObject({ start: at("2026-11-17T14:00:00Z"), end: at("2026-11-17T15:00:00Z"), title: "Spotkanie" });
    expect(events[1]).toMatchObject({ allDay: true, start: at("2026-11-19T23:00:00Z"), end: at("2026-11-20T23:00:00Z"), busy: false });
  });
});
