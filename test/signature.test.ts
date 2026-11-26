import { describe, expect, it } from "vitest";
import { EMPTY_BRAND, EMPTY_CARD, cleanBrand, renderSignature, websiteUrl } from "../src/lib/mail/signature";

const card = { name: "Anna Kowalska", role: "Head of Support", phone: "+48 600 100 200", note: "", email: "anna@acme.com" };
const brand = { company: "Acme", website: "acme.com", logoUrl: "/api/files/attachments/org1/abcdefghijklmnop/logo.png", color: "#E5484D", layout: "left" as const, footer: "Acme sp. z o.o., KRS 0000123456" };

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
    expect(sig.html.indexOf("<img")).toBeLessThan(sig.html.indexOf("Anna Kowalska"));
    expect(sig.html).toMatch(/<\/a><\/td><\/tr><tr><td><a href="mailto:/);
  });
  it("shows the person's photo instead of the org's logo", () => {
    const photo = "/api/files/attachments/org1/qrstuvwxyzabcdefgh/me.jpg";
    const sig = renderSignature({ ...card, photoUrl: photo }, brand, "https://workinbox.io")!;
    expect(sig.html).toContain(`src="https://workinbox.io${photo}"`);
    expect(sig.html).not.toContain("logo.png");
    expect(sig.html).toContain("border-radius:20px");
    expect(renderSignature({ ...card, photoUrl: "https://evil.example/me.jpg" }, brand, "https://workinbox.io")!.html).toContain("logo.png");
    const square = renderSignature({ ...card, photoUrl: photo, photoRound: false }, brand, "https://workinbox.io")!.html;
    expect(square).toContain('width="64"');
    expect(square).not.toContain("background:");
    expect(square).not.toContain(`width="40"`);
  });
  it("puts the logo to the left by default and above when configured", () => {
    const left = renderSignature(card, brand, "")!.html;
    const above = renderSignature(card, { ...brand, layout: "above" }, "")!.html;
    expect(left).toMatch(/<img[^>]+><\/td><td valign="top"><table/);
    expect(above).toMatch(/<img[^>]+><\/td><\/tr><tr><td style="font-weight:600">Anna/);
  });
  it("escapes values and keeps note lines", () => {
    const sig = renderSignature({ ...EMPTY_CARD, name: '<b>"x"</b>', note: "line 1\nline 2" }, EMPTY_BRAND, "https://a.b")!;
    expect(sig.html).toContain("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    expect(sig.html).toContain("line 1<br>line 2");
    expect(sig.html).not.toContain("<img");

  });
  it("uses the default footer style without a brand rule", () => {
    const sig = renderSignature(card, { ...EMPTY_BRAND, footer: "Acme" }, "")!;
    expect(sig.html).toContain("font-size:13px;line-height:1.5;color:#595959;text-align:left");
    expect(sig.html).toContain('<td style="padding-top:8px">Acme</td>');
    expect(sig.html).not.toContain("border-top");
  });
  it("drops invalid brand values and renders nothing when empty", () => {
    expect(cleanBrand({ color: "red", website: "javascript:alert(1)", logoUrl: "https://evil.example/x.png" })).toEqual({ company: "", website: "", logoUrl: "", color: "", layout: "left", footer: "" });
    expect(websiteUrl("http://acme.com/team")).toBe("http://acme.com/team");
    expect(websiteUrl("localhost")).toBe("");
    expect(renderSignature(EMPTY_CARD, { ...EMPTY_BRAND, color: "#000000" }, "https://a.b")).toBeNull();
    expect(renderSignature(EMPTY_CARD, { ...EMPTY_BRAND, company: "Acme" }, "https://a.b")!.text).toBe("Acme");
    expect(renderSignature(EMPTY_CARD, { ...EMPTY_BRAND, footer: "Confidential" }, "https://a.b")!.text).toBe("Confidential");
  });
});
