import { describe, expect, it } from "vitest";
import { hexHue, isLookupDomain, pickProfile, siteHints } from "../src/lib/contacts/banner";

describe("banner profile", () => {
  it("trusts confident answers only", () => {
    expect(pickProfile({ industry: { choice: "airline", confidence: 0.9 }, color: { choice: "blue", confidence: 0.7 } })).toEqual({ theme: "airline", color: { hue: 215, sat: 0.6 }, accent: null });
    expect(pickProfile({ industry: { choice: "bank", confidence: 0.2 }, color: { choice: "red", confidence: 0.32 } })).toEqual({ theme: null, color: null, accent: null });
    expect(pickProfile({ industry: { choice: "made-up", confidence: 1 } })).toEqual({ theme: null, color: null, accent: null });
    expect(pickProfile(null)).toEqual({ theme: null, color: null, accent: null });
  });

  it("adds a second colour only when it's sure and different", () => {
    const ikea = { industry: { choice: "retail", confidence: 1 }, color: { choice: "blue", confidence: 0.8 } };
    expect(pickProfile({ ...ikea, color2: { choice: "yellow", confidence: 0.7 } }).accent).toEqual({ hue: 45, sat: 0.7 });
    expect(pickProfile({ ...ikea, color2: { choice: "yellow", confidence: 0.3 } }).accent).toBeNull();
    expect(pickProfile({ ...ikea, color2: { choice: "none", confidence: 0.9 } }).accent).toBeNull();
    expect(pickProfile({ ...ikea, color2: { choice: "gray", confidence: 0.9 } }).accent).toBeNull();
    // Same family as the first colour: nothing new.
    expect(pickProfile({ ...ikea, color2: { choice: "blue", confidence: 0.9 } }).accent).toBeNull();
    // No first colour, no second.
    expect(pickProfile({ industry: ikea.industry, color2: { choice: "yellow", confidence: 0.9 } }).accent).toBeNull();
  });

  it("prefers the site's own theme-color", () => {
    expect(pickProfile({ color: { choice: "blue", confidence: 0.9 } }, "#ffcc00")!.color!.hue).toBe(48);
    // Greys and white say nothing: the guess stays.
    expect(pickProfile({ color: { choice: "blue", confidence: 0.9 } }, "#ffffff")!.color).toEqual({ hue: 215, sat: 0.6 });
  });

  it("reads hex colours", () => {
    expect(hexHue("#f00")).toEqual({ hue: 0, sat: 0.75 });
    expect(hexHue("#1a73e8")!.hue).toBe(214);
    expect(hexHue("#777777")).toBeNull();
    expect(hexHue("red")).toBeNull();
  });

  it("looks up real hostnames only", () => {
    expect(isLookupDomain("acme.com")).toBe(true);
    expect(isLookupDomain("mail.acme.co.uk")).toBe(true);
    expect(isLookupDomain("localhost")).toBe(false);
    expect(isLookupDomain("10.0.0.1")).toBe(false);
    expect(isLookupDomain("acme.com/evil")).toBe(false);
  });

  it("reads the homepage head", () => {
    const html = `<html><head><title>LOT Polish Airlines &amp; more</title><meta content="Fly with us" name="description"><meta name="theme-color" content="#0b2c63"></head>`;
    expect(siteHints(html)).toEqual({ title: "LOT Polish Airlines & more", description: "Fly with us", themeColor: "#0b2c63" });
    expect(siteHints("<p>nothing</p>")).toEqual({ title: undefined, description: undefined, themeColor: undefined });
  });
});
