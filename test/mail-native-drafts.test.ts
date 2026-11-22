import { expect, it } from "vitest";
import PostalMime from "postal-mime";
import { draftEml, draftFields } from "@/lib/mail/draft-eml";
import { draftKeyOfRaw, draftMessageId } from "@/lib/mail/draft-key";

const key = "d-0b7c3f0e-2a4d-4c1e-9a55-3f1d2c4b5a6e";
const eml = draftEml(key, { from: { email: "anna@acme.test", name: "Anna" }, to: "bob@x.test, Cy@x.test", cc: "", subject: "Zażółć", date: new Date(0), text: "Hello\nthere" });

it("round-trips a draft through its .eml", async () => {
  expect(draftKeyOfRaw(eml)).toBe(key);
  const parsed = await PostalMime.parse(eml);
  expect(parsed.messageId).toBe(draftMessageId(key));
  expect(draftFields(parsed)).toEqual({ mode: "new", to: ["bob@x.test", "cy@x.test"], cc: [], subject: "Zażółć", text: "Hello\nthere" });
});

it("finds the key by Message-ID when an app dropped the header, and ignores foreign ids", () => {
  expect(draftKeyOfRaw(`Message-ID:\r\n <wi-draft-${key}@workinbox.invalid>\r\nSubject: x\r\n\r\nbody`)).toBe(key);
  expect(draftKeyOfRaw("Message-ID: <wi-draft-../../x@workinbox.invalid>\r\n\r\n")).toBeNull();
  expect(draftKeyOfRaw("Subject: x\r\n\r\nX-Workinbox-Draft: new")).toBeNull();
});

it("keeps only the new part of a reply written in a mail app", async () => {
  const parsed = await PostalMime.parse("From: a@x.test\r\nTo: b@x.test\r\nIn-Reply-To: <m@x.test>\r\nSubject: Re: hi\r\n\r\nThanks!\r\n\r\nOn Mon, Bob wrote:\r\n> hi\r\n");
  expect(draftFields(parsed)).toMatchObject({ mode: "reply", text: "Thanks!" });
});
