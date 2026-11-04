import { describe, expect, it } from "vitest";
import { localizedPath, pickLocale, stripLocale } from "@/lib/i18n/locales";
import { fill, plural, placeholders } from "@/lib/i18n/t";
import { appLocale, t, tp } from "@/lib/i18n/panel";
import { withLocale } from "@/lib/server/i18n";

describe("dashboard i18n core (English only until a product adds languages)", () => {
  it("returns the English text, without a key's context", () => {
    expect(t("Save changes")).toBe("Save changes");
    expect(t("mail|Inbox")).toBe("Inbox");
    expect(t("{n} items", { n: 3 })).toBe("3 items");
    expect(withLocale("en", () => [t("Settings"), appLocale()])).toEqual(["Settings", "en"]);
  });

  it("picks English plural forms", () => {
    expect(tp(1, { one: "{n} item", other: "{n} items" })).toBe("1 item");
    expect(tp(4, { one: "{n} item", other: "{n} items" })).toBe("4 items");
    expect(plural("pl", { one: "{n} plik", few: "{n} pliki", many: "{n} plików", other: "{n} pliku" }, 5)).toBe("5 plików");
  });

  it("fills placeholders and lists them", () => {
    expect(fill("Hi {name}, {x}", { name: "Ola" })).toBe("Hi Ola, {x}");
    expect(placeholders("{b} {a} {b}")).toEqual(["a", "b"]);
  });

  it("keeps English unprefixed and ignores unknown languages", () => {
    expect(localizedPath("en", "/pricing")).toBe("/pricing");
    expect(stripLocale("/pricing")).toEqual({ locale: "en", path: "/pricing" });
    expect(pickLocale("en-US,en;q=0.9")).toBe("en");
    expect(pickLocale("ja")).toBeNull();
  });
});
