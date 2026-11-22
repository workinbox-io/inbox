import { describe, expect, it } from "vitest";
import { EMPTY_BRAND, EMPTY_CARD, cleanBrand, renderSignature, websiteUrl } from "../src/lib/mail/signature";

const card = { name: "Anna Kowalska", role: "Head of Support", phone: "+48 600 100 200", note: "", email: "anna@acme.com" };
const brand = { company: "Acme", website: "acme.com", logoUrl: "/api/files/attachments/org1/abcdefghijklmnop/logo.png", color: "#E5484D", footer: "Acme sp. z o.o., KRS 0000123456" };

describe("signature", () => {
  it("renders text and HTML with the brand", () => {
    const sig = renderSignature(card, brand, "https://workinbox.io")!;
    expect(sig.text).toBe("Anna Kowalska\nHead of Support · Acme\n+48 600 100 200\nanna@acme.com\nacme.com\n\nAcme sp. z o.o., KRS 0000123456");
    expect(sig.html).toContain('href="mailto:anna@acme.com"');
    expect(sig.html).toContain("KRS 0000123456");
    expect(sig.html).toContain('src="https://workinbox.io/api/files/attachments/org1/abcdefghijklmnop/logo.png"');
    expect(sig.html).toContain('href="https://acme.com/"');
    expect(sig.html).toContain('href="tel:+48600100200"');
    expect(sig.html).toContain("width:32px;border-top:1px solid #e5484d");
    expect(sig.html).not.toContain('bgcolor=');
  });
  it("shows the person's photo instead of the org's logo", () => {
    const photo = "/api/files/attachments/org1/qrstuvwxyzabcdefgh/me.jpg";
    const sig = renderSignature({ ...card, photoUrl: photo }, brand, "https://workinbox.io")!;
    expect(sig.html).toContain(`src="https://workinbox.io${photo}"`);
    expect(sig.html).not.toContain("logo.png");
    expect(sig.html).toContain("border-radius:20px");
    expect(renderSignature({ ...card, photoUrl: "https://evil.example/me.jpg" }, brand, "https://workinbox.io")!.html).toContain("logo.png");
    const square = renderSignature({ ...card, photoUrl: photo, photoRound: false }, brand, "https://workinbox.io")!.html;
    expect(square).toContain("max-height:40px;max-width:180px;padding:4px;background:#ffffff");
    expect(square).not.toContain(`width="40"`);
  });
  it("escapes values and keeps note lines", () => {
    const sig = renderSignature({ ...EMPTY_CARD, name: '<b>"x"</b>', note: "line 1\nline 2" }, EMPTY_BRAND, "https://a.b")!;
    expect(sig.html).toContain("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    expect(sig.html).toContain("line 1<br>line 2");
    expect(sig.html).not.toContain("<img");

  });
  it("drops invalid brand values and renders nothing when empty", () => {
    expect(cleanBrand({ color: "red", website: "javascript:alert(1)", logoUrl: "https://evil.example/x.png" })).toEqual({ company: "", website: "", logoUrl: "", color: "", footer: "" });
    expect(websiteUrl("http://acme.com/team")).toBe("http://acme.com/team");
    expect(websiteUrl("localhost")).toBe("");
    expect(renderSignature(EMPTY_CARD, { ...EMPTY_BRAND, color: "#000000" }, "https://a.b")).toBeNull();
    expect(renderSignature(EMPTY_CARD, { ...EMPTY_BRAND, company: "Acme" }, "https://a.b")!.text).toBe("Acme");
    expect(renderSignature(EMPTY_CARD, { ...EMPTY_BRAND, footer: "Confidential" }, "https://a.b")!.text).toBe("Confidential");
  });
});
