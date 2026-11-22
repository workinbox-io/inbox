import { describe, expect, it } from "vitest";
import { bannerSeed, hashSeed } from "../src/components/contacts/pixel-banner";

describe("contact banner", () => {
  it("is shared by a company's domain", () => {
    expect(bannerSeed("anna@Acme.com")).toBe("acme.com");
    expect(hashSeed(bannerSeed("anna@acme.com"))).toBe(hashSeed(bannerSeed("bob@acme.com")));
  });

  it("is personal on free mail", () => {
    expect(bannerSeed("Anna@gmail.com")).toBe("anna@gmail.com");
    expect(hashSeed(bannerSeed("anna@gmail.com"))).not.toBe(hashSeed(bannerSeed("bob@gmail.com")));
  });
});
