import PostalMime from "postal-mime";
import { describe, expect, it } from "vitest";
import { buildEml } from "../src/lib/mail/mime";

const pdf = new Uint8Array(5000).map((_, i) => i % 256);

describe("buildEml", () => {
  it("round-trips through a parser: headers, both bodies, attachments", async () => {
    const eml = buildEml({
      from: { email: "anna@acme.test", name: 'Anna "Ania" Żółć' },
      to: "bob@x.test",
      cc: "c@x.test, d@x.test",
      subject: "Oferta na Q1 – zażółć gęślą jaźń ".repeat(4).trim(),
      date: new Date("2026-11-10T14:32:00Z"),
      messageId: "<abc@acme.test>",
      inReplyTo: "<prev@x.test>",
      references: "<first@x.test> <prev@x.test>",
      text: "Cześć,\nw załączniku.",
      html: "<p>Cześć, <b>w załączniku</b>.</p>",
      attachments: [
        { filename: "umowa.pdf", mediaType: "application/pdf", content: pdf },
        { filename: "zdjęcie (1).png", mediaType: "image/png", content: new Uint8Array([1, 2, 3]) },
      ],
    });
    expect(/^[\x00-\x7f]*$/.test(eml)).toBe(true);
    expect(eml.split("\r\n").every((l) => l.length <= 998)).toBe(true);
    const p = await PostalMime.parse(eml);
    expect(p.from).toMatchObject({ address: "anna@acme.test", name: 'Anna "Ania" Żółć' });
    expect(p.to?.map((a) => a.address)).toEqual(["bob@x.test"]);
    expect(p.cc?.map((a) => a.address)).toEqual(["c@x.test", "d@x.test"]);
    expect(p.subject).toBe("Oferta na Q1 – zażółć gęślą jaźń ".repeat(4).trim());
    expect(p.messageId).toBe("<abc@acme.test>");
    expect(p.inReplyTo).toBe("<prev@x.test>");
    expect(new Date(p.date!).toISOString()).toBe("2026-11-10T14:32:00.000Z");
    expect(p.text?.trim()).toBe("Cześć,\nw załączniku.");
    expect(p.html).toContain("<b>w załączniku</b>");
    expect(p.attachments.map((a) => [a.filename, a.mimeType])).toEqual([["umowa.pdf", "application/pdf"], ["zdjęcie (1).png", "image/png"]]);
    expect(new Uint8Array(p.attachments[0].content as ArrayBuffer)).toEqual(pdf);
  });

  it("plain text only, header injection stripped", async () => {
    const eml = buildEml({ from: { email: "a@x.test" }, to: "b@x.test", subject: "Hi\r\nBcc: evil@x.test", date: new Date(0), text: "hello" });
    expect(eml).not.toMatch(/^Bcc:/m);
    const p = await PostalMime.parse(eml);
    expect(p.subject).toBe("Hi Bcc: evil@x.test");
    expect(p.text?.trim()).toBe("hello");
    expect(p.html).toBeUndefined();
  });
});
