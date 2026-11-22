import { describe, expect, it } from "vitest";
import { bareAddress, bounceable, fromHeader, fromSesEvent, parseS3List, rawHeaders, recoveredEnvelope } from "../src/lib/mail/ses-events";

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

describe("lost SES mail", () => {
  it("recovers the envelope from SES's headers", () => {
    const h = new Headers({
      "return-path": "<bob@x.com>",
      received: "from mx.x.com by inbound-smtp.eu-west-1.amazonaws.com with SMTP id abc for hidden@acme.test; Tue, 10 Nov 2026",
      to: '"Anna" <Anna@acme.test>, out@gmail.com',
      cc: "team@acme.test",
    });
    expect(recoveredEnvelope(h)).toEqual({ from: "bob@x.com", recipients: ["hidden@acme.test", "anna@acme.test", "out@gmail.com", "team@acme.test"] });
  });

  it("bounces only to verified, human senders", () => {
    const ok = { "authentication-results": "amazonses.com; spf=pass smtp.mailfrom=x.com; dkim=fail" };
    expect(bounceable("bob@x.com", new Headers(ok))).toBe(true);
    expect(bounceable("bob@x.com", new Headers({ "authentication-results": "amazonses.com; spf=fail; dkim=none" }))).toBe(false);
    expect(bounceable("", new Headers(ok))).toBe(false);
    expect(bounceable("MAILER-DAEMON@x.com", new Headers(ok))).toBe(false);
    expect(bounceable("bob@x.com", new Headers({ ...ok, "auto-submitted": "auto-replied" }))).toBe(false);
    expect(bounceable("bob@x.com", new Headers({ ...ok, "auto-submitted": "no" }))).toBe(true);
    expect(bounceable("bob@x.com", new Headers({ ...ok, "list-id": "<news.x.com>" }))).toBe(false);
    expect(bounceable("bob@x.com", new Headers({ ...ok, "x-ses-spam-verdict": "FAIL" }))).toBe(false);
  });

  it("keeps SES's own verdicts, not a sender's copies further down", () => {
    const eml = [
      "Authentication-Results: amazonses.com; spf=fail; dkim=fail",
      "X-SES-Spam-Verdict: FAIL",
      "X-SES-Virus-Verdict: FAIL",
      "From: x@evil.com",
      "Authentication-Results: evil.com; spf=pass; dkim=pass",
      "X-SES-Virus-Verdict: PASS",
      "X-SES-Spam-Verdict: PASS",
      "Received: a",
      "Received: b",
      "",
      "body",
    ].join("\r\n");
    const h = rawHeaders(new TextEncoder().encode(eml).buffer as ArrayBuffer);
    expect(h.get("x-ses-virus-verdict")).toBe("FAIL");
    expect(h.get("x-ses-spam-verdict")).toBe("FAIL");
    expect(h.get("authentication-results")).toBe("amazonses.com; spf=fail; dkim=fail");
    expect(bounceable("x@evil.com", h)).toBe(false);
    expect(h.get("received")).toBe("a, b");
  });

  it("parses an S3 listing", () => {
    const xml = `<ListBucketResult><Contents><Key>mail/a&amp;b</Key><LastModified>2026-11-10T10:00:00.000Z</LastModified></Contents>
      <Contents><Key>mail/c</Key><LastModified>2026-11-10T11:00:00.000Z</LastModified></Contents><NextContinuationToken>t+1</NextContinuationToken></ListBucketResult>`;
    expect(parseS3List(xml)).toEqual({
      objects: [{ key: "mail/a&b", lastModified: Date.parse("2026-11-10T10:00:00Z") }, { key: "mail/c", lastModified: Date.parse("2026-11-10T11:00:00Z") }],
      next: "t+1",
    });
    expect(parseS3List("<ListBucketResult></ListBucketResult>")).toEqual({ objects: [], next: undefined });
  });
});
