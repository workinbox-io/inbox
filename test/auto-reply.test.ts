import { describe, expect, it } from "vitest";
import { AUTO_REPLY_EVERY_MS, shouldAutoReply } from "../src/lib/mail/auto-reply";

const now = new Date("2026-11-13T10:00:00Z");
const on = { enabled: true, startsAt: null, endsAt: null, text: "Away until Monday" };
const base = { settings: on, now, sender: "ola@client.com", mailboxAddress: "anna@acme.test", headers: new Headers() };

describe("shouldAutoReply", () => {
  it("replies when on", () => expect(shouldAutoReply(base)).toBe(true));
  it("respects off, empty text and the date window", () => {
    expect(shouldAutoReply({ ...base, settings: { ...on, enabled: false } })).toBe(false);
    expect(shouldAutoReply({ ...base, settings: { ...on, text: " " } })).toBe(false);
    expect(shouldAutoReply({ ...base, settings: { ...on, startsAt: new Date(now.getTime() + 1) } })).toBe(false);
    expect(shouldAutoReply({ ...base, settings: { ...on, endsAt: now } })).toBe(false);
    expect(shouldAutoReply({ ...base, settings: { ...on, startsAt: new Date(0), endsAt: new Date(now.getTime() + 1) } })).toBe(true);
  });
  it("never answers machines, lists, itself or forwards", () => {
    for (const h of [["auto-submitted", "auto-replied"], ["precedence", "bulk"], ["list-id", "<x>"], ["list-unsubscribe", "<x>"], ["x-workinbox-forwarded", "1"]] as [string, string][])
      expect(shouldAutoReply({ ...base, headers: new Headers([h]) })).toBe(false);
    expect(shouldAutoReply({ ...base, headers: new Headers({ "auto-submitted": "no" }) })).toBe(true);
    expect(shouldAutoReply({ ...base, sender: "noreply@client.com" })).toBe(false);
    expect(shouldAutoReply({ ...base, sender: "Anna@acme.test" })).toBe(false);
  });
  it("answers a sender once every few days", () => {
    expect(shouldAutoReply({ ...base, lastSentAt: new Date(now.getTime() - 1000) })).toBe(false);
    expect(shouldAutoReply({ ...base, lastSentAt: new Date(now.getTime() - AUTO_REPLY_EVERY_MS) })).toBe(true);
  });
});
