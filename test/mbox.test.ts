import { describe, expect, it } from "vitest";
import { emlToMbox, importPlacement, isMbox, splitMbox } from "../src/lib/mail/mbox";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("mbox", () => {
  const file = "From a@x Mon Jan 1 2024\nSubject: one\n\nhi\n>From the start\n\nFrom b@y Tue Jan 2 2024\nSubject: two\n\nbye\n";
  it("splits whole messages and keeps the unfinished one for the next read", () => {
    expect(isMbox(enc(file))).toBe(true);
    const partial = splitMbox(enc(file), false);
    expect(partial.messages.map(dec)).toEqual(["Subject: one\n\nhi\nFrom the start\n\n"]);
    expect(dec(enc(file).subarray(partial.consumed))).toMatch(/^From b@y/);
    const all = splitMbox(enc(file), true);
    expect(all.messages.map(dec)).toEqual(["Subject: one\n\nhi\nFrom the start\n\n", "Subject: two\n\nbye\n"]);
    expect(all.consumed).toBe(enc(file).length);
    expect(splitMbox(enc("Subject: none\n"), false)).toEqual({ messages: [], ends: [], consumed: 0 });
    expect(all.ends[0]).toBe(partial.consumed);
  });
  it("wraps .eml files so they split back into the same message", () => {
    const eml = "Subject: e\r\n\r\nFrom here on\r\n>From quoted\r\n";
    expect(isMbox(enc(eml))).toBe(false);
    const { messages } = splitMbox(emlToMbox(enc(eml)), true);
    expect(messages.map(dec)).toEqual(["Subject: e\n\nFrom here on\n>From quoted\n\n"]);
  });
  it("places Gmail messages by label", () => {
    expect(importPlacement("Inbox,Important")).toEqual({ skip: false, archived: false });
    expect(importPlacement("Archived,Sent")).toEqual({ skip: false, archived: true });
    expect(importPlacement("Spam")).toMatchObject({ skip: true });
    expect(importPlacement(null)).toEqual({ skip: false, archived: true });
  });
});
