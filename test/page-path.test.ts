import { describe, expect, it } from "vitest";
import { pagePath } from "../src/lib/page-path";

describe("pagePath", () => {
  it("serves prerendered files at their clean paths", () => {
    expect(pagePath("/index.html")).toBe("/");
    expect(pagePath("/pricing.html")).toBe("/pricing");
    expect(pagePath("/vs/zoho-mail.html")).toBe("/vs/zoho-mail");
    expect(pagePath("/docs/index.html")).toBe("/docs");
  });
  it("leaves server-rendered paths alone, without a trailing slash", () => {
    expect(pagePath("/")).toBe("/");
    expect(pagePath("/signup")).toBe("/signup");
    expect(pagePath("/pricing/")).toBe("/pricing");
  });
});
