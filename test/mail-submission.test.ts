import { expect, it } from "vitest";
import { sameSubmission, withoutBlindHeaders } from "../src/lib/mail/submission";

it("removes folded blind headers and preserves binary MIME bytes", () => {
  const body = Uint8Array.of(0, 255, 128, 13, 10);
  const header = new TextEncoder().encode("From: a@example.test\r\nBcc: secret@example.test\r\n\tsecond@example.test\r\nResent-Bcc: other@example.test\r\nSubject: hello\r\n\r\n");
  const raw = new Uint8Array([...header, ...body]);
  const expected = new Uint8Array([...new TextEncoder().encode("From: a@example.test\r\nSubject: hello\r\n\r\n"), ...body]);
  expect(withoutBlindHeaders(raw)).toEqual(expected);
  expect(withoutBlindHeaders(expected)).toBe(expected);
  expect(sameSubmission(raw, expected)).toBe(true);
  expect(() => withoutBlindHeaders(new TextEncoder().encode("broken\r\n\r\n"))).toThrow("Malformed");
  expect(() => withoutBlindHeaders(new TextEncoder().encode("Bcc : secret@example.test\r\n\r\nbody"))).toThrow("Malformed");
  expect(() => withoutBlindHeaders(new Uint8Array(256 * 1024))).toThrow("headers");
});
