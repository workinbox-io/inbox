import PostalMime from "postal-mime";
import { describe, expect, it } from "vitest";
import { parseIcs, toIcs, type IcsEvent } from "../src/lib/calendar/ics";
import { inviteBody, inviteSubject, whenText } from "../src/lib/calendar/invite-text";
import { buildEml } from "../src/lib/mail/mime";

const event: IcsEvent = {
  uid: "e1@workinbox.io",
  sequence: 0,
  title: "Demo",
  description: "Agenda",
  location: "Room 1",
  url: "https://meet.example.com/x",
  start: Date.parse("2026-11-17T14:00:00Z"),
  end: Date.parse("2026-11-17T14:30:00Z"),
  allDay: false,
  timezone: "Europe/Warsaw",
  rrule: null,
  exdates: [],
  recurrenceId: null,
  status: "confirmed",
  busy: true,
  organizer: { email: "anna@acme.test" },
  attendees: [{ email: "bob@example.com", status: "needs-action" }],
};

describe("invitation mail", () => {
  it("puts text/calendar inside multipart/alternative and parsers expose it", async () => {
    const ics = toIcs([event], "REQUEST");
    const eml = buildEml({
      from: { email: "anna@acme.test", name: "Anna" },
      to: "bob@example.com",
      subject: inviteSubject("new", event),
      date: new Date("2026-11-12T10:00:00Z"),
      text: inviteBody("new", event),
      html: "<p>Demo</p>",
      replyTo: "anna@acme.test",
      calendar: { method: "REQUEST", ics },
    });
    const alt = eml.match(/multipart\/alternative; boundary="([^"]+)"/)![1];
    const parts = eml.split(`--${alt}`);
    expect(parts.some((p) => p.includes("Content-Type: text/calendar; method=REQUEST; charset=utf-8"))).toBe(true);
    expect(eml).toContain("Reply-To: anna@acme.test");
    const parsed = await PostalMime.parse(eml);
    const cal = parsed.attachments.find((a) => a.mimeType === "text/calendar");
    expect(cal).toBeTruthy();
    const content = typeof cal!.content === "string" ? cal!.content : new TextDecoder().decode(cal!.content);
    expect(parseIcs(content).events[0].uid).toBe("e1@workinbox.io");
  });

  it("writes subjects and bodies in the event's zone", () => {
    expect(whenText(event)).toBe("Tue, Nov 17, 2026 3:00 PM – 3:30 PM (GMT+1)");
    expect(inviteSubject("update", event)).toBe("Updated invitation: Demo @ Tue, Nov 17, 2026 3:00 PM – 3:30 PM (GMT+1)");
    expect(inviteBody("new", event)).toBe("Demo\nWhen: Tue, Nov 17, 2026 3:00 PM – 3:30 PM (GMT+1)\nWhere: Room 1\nJoin: https://meet.example.com/x\n\nAgenda");
    const day = { ...event, allDay: true, start: Date.parse("2026-11-19T23:00:00Z"), end: Date.parse("2026-11-21T23:00:00Z") };
    expect(whenText(day)).toBe("Fri, Nov 20, 2026 – Sat, Nov 21, 2026");
    expect(inviteBody("declined", event, "Bob")).toContain("Bob declined");
  });

  it("reads a Gmail REPLY", () => {
    const reply = [
      "BEGIN:VCALENDAR",
      "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
      "VERSION:2.0",
      "CALSCALE:GREGORIAN",
      "METHOD:REPLY",
      "BEGIN:VEVENT",
      "DTSTART:20261117T140000Z",
      "DTEND:20261117T143000Z",
      "DTSTAMP:20261112T101500Z",
      "ORGANIZER:mailto:anna@acme.test",
      "UID:e1@workinbox.io",
      "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Bob Smi",
      " th;X-NUM-GUESTS=0:mailto:Bob@Example.com",
      "SEQUENCE:0",
      "STATUS:CONFIRMED",
      "SUMMARY:Demo",
      "TRANSP:OPAQUE",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const { method, events } = parseIcs(reply);
    expect(method).toBe("REPLY");
    expect(events[0].attendees).toEqual([{ email: "bob@example.com", name: "Bob Smith", status: "accepted", optional: false }]);
  });

  it("writes a REPLY with only the answering attendee", () => {
    const ics = toIcs([{ ...event, attendees: [{ email: "bob@example.com", status: "declined" }] }], "REPLY");
    expect(ics).toContain("METHOD:REPLY");
    expect(ics).toContain("PARTSTAT=DECLINED");
    expect(ics).not.toContain("DESCRIPTION");
  });

  it("cancels one occurrence with RECURRENCE-ID", () => {
    const occ = Date.parse("2026-11-24T14:00:00Z");
    const ics = toIcs([{ ...event, start: occ, end: occ + 1_800_000, recurrenceId: occ }], "CANCEL");
    expect(ics).toContain("RECURRENCE-ID;TZID=Europe/Warsaw:20261124T150000");
    expect(ics).toContain("STATUS:CANCELLED");
  });
});
