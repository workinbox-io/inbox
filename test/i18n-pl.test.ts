import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { extractKeys, neededKeys } from "@/lib/i18n/keys";
import { appLocale, t, tp } from "@/lib/i18n/panel";
import { placeholders } from "@/lib/i18n/t";
import { panelDictionary, withLocale } from "@/lib/server/i18n";

describe("key extraction", () => {
  it("finds t() texts and tp() plural forms", () => {
    const src = `t("Save") + x.t("no") + t("Hi {name}", { name }) + msg("Threads") + tp(n, { one: "{n} file", other: "{n} files" })`;
    expect(extractKeys(src)).toEqual([
      { key: "Save", plural: false },
      { key: "Hi {name}", plural: false },
      { key: "Threads", plural: false },
      { key: "{n} files", plural: true },
    ]);
    expect(neededKeys(extractKeys(src), "pl")).toEqual(["Save", "Hi {name}", "Threads", "{n} files|one", "{n} files|few", "{n} files|many", "{n} files|other"]);
  });
});

describe("Polish dashboard", () => {
  const pl = panelDictionary("pl");

  it("translates inside withLocale", () => {
    expect(withLocale("pl", () => [appLocale(), t("Settings")])).toEqual(["pl", pl["Settings"] ?? "Settings"]);
    expect(withLocale("pl", () => tp(5, { one: "{n} file", other: "{n} files" }))).toBe(pl["{n} files|many"] ? pl["{n} files|many"]!.replace("{n}", "5") : "5 files");
  });

  it("keeps every placeholder of the English text", () => {
    const bad = Object.entries(pl).filter(([en, tr]) => placeholders(en.replace(/\|[a-z]+$/, "")).join() !== placeholders(tr).join() && !en.endsWith("|one"));
    expect(bad).toEqual([]);
  });

  it("has a translation for every text in the code", () => {
    const out = execFileSync("node", ["scripts/i18n-missing.ts", "pl"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    expect(JSON.parse(out)).toEqual({});
  });
});
