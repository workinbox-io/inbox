import { describe, expect, it } from "vitest";
import { EMPTY_BRAND, EMPTY_CARD, cleanBrand, renderSignature, websiteUrl } from "../src/lib/mail/signature";

const card = { name: "Anna Kowalska", role: "Head of Support", phone: "+48 600 100 200", note: "" };
const brand = { company: "Acme", website: "acme.com", logoUrl: "/api/files/attachments/org1/abcdefghijklmnop/logo.png", color: "#E5484D" };

describe("signature", () => {
  it("renders text and HTML with the brand", () => {
    const sig = renderSignature(card, brand, "https://workinbox.io")!;
    expect(sig.text).toBe("Anna Kowalska\nHead of Support · Acme\n+48 600 100 200\nacme.com");
    expect(sig.html).toContain('src="https://workinbox.io/api/files/attachments/org1/abcdefghijklmnop/logo.png"');
    expect(sig.html).toContain('href="https://acme.com/"');
    expect(sig.html).toContain('href="tel:+48600100200"');
    expect(sig.html).toContain("color:#e5484d");
  });
  it("escapes values and keeps note lines", () => {
    const sig = renderSignature({ ...EMPTY_CARD, name: '<b>"x"</b>', note: "line 1\nline 2" }, EMPTY_BRAND, "https://a.b")!;
    expect(sig.html).toContain("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    expect(sig.html).toContain("line 1<br>line 2");
    expect(sig.html).not.toContain("<img");
  });
  it("drops invalid brand values and renders nothing when empty", () => {
    expect(cleanBrand({ color: "red", website: "javascript:alert(1)", logoUrl: "https://evil.example/x.png" })).toEqual({ company: "", website: "", logoUrl: "", color: "" });
    expect(websiteUrl("http://acme.com/team")).toBe("http://acme.com/team");
    expect(websiteUrl("localhost")).toBe("");
    expect(renderSignature(EMPTY_CARD, { ...EMPTY_BRAND, color: "#000000" }, "https://a.b")).toBeNull();
    expect(renderSignature(EMPTY_CARD, { ...EMPTY_BRAND, company: "Acme" }, "https://a.b")!.text).toBe("Acme");
  });
});
