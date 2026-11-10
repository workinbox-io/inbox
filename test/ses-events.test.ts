import { describe, expect, it } from "vitest";
import { bareAddress, fromHeader, fromSesEvent, rawHeaders } from "../src/lib/mail/ses-events";

describe("SES events", () => {
  it("maps deliveries and bounces to per-recipient events", () => {
    const mail = { messageId: "m1", source: "Anna <anna@acme.com>", timestamp: "2026-11-10T10:00:00Z", destination: ["b@x.com", "c@y.com"] };
    const delivered = fromSesEvent({ eventType: "Delivery", mail, delivery: { timestamp: "2026-11-10T10:00:05Z", recipients: ["b@x.com"] } });
    expect(delivered).toEqual([
      {
        type: "cf.email.sending.message.delivered",
        source: { domain: "acme.com" },
        payload: { eventId: "ses:m1:delivered:b@x.com", messageId: "m1", sender: "anna@acme.com", recipient: "b@x.com" },
        metadata: { eventTimestamp: "2026-11-10T10:00:05Z" },
      },
    ]);
    const bounced = fromSesEvent({ eventType: "Bounce", mail, bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "c@y.com" }] } });
    expect(bounced[0]!.payload).toMatchObject({ recipient: "c@y.com", bounce: { type: "hard" } });
    expect(fromSesEvent({ eventType: "Reject", mail })).toHaveLength(2);
    expect(fromSesEvent({ eventType: "Send", mail })).toEqual([]);
  });
  it("formats sender headers", () => {
    expect(bareAddress("ANNA@acme.com")).toBe("anna@acme.com");
    expect(fromHeader("Anna", "anna@acme.com")).toBe('"Anna" <anna@acme.com>');
    expect(fromHeader("Łucja", "l@acme.com")).toBe("=?UTF-8?B?xYF1Y2ph?= <l@acme.com>");
    expect(fromHeader("", "l@acme.com")).toBe("l@acme.com");
  });
  it("reads a raw message's headers", () => {
    const raw = new TextEncoder().encode("Subject: Hello\r\n there\r\nX-SES-Spam-Verdict: FAIL\r\nBad Header\r\n\r\nBody: not a header\r\n").buffer;
    const h = rawHeaders(raw);
    expect(h.get("subject")).toBe("Hello there");
    expect(h.get("x-ses-spam-verdict")).toBe("FAIL");
    expect(h.get("body")).toBeNull();
  });
});
