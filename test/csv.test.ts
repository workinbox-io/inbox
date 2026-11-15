import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads quotes, doubled quotes and newlines in quotes", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"two\nlines",3')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "3"],
    ]);
  });
  it("picks semicolons when the header uses them", () => {
    expect(parseCsv("name;amount\nAnna;1,5\n")).toEqual([
      ["name", "amount"],
      ["Anna", "1,5"],
    ]);
  });
  it("stops at maxRows", () => {
    expect(parseCsv("1\n2\n3\n4", 2)).toEqual([["1"], ["2"]]);
  });
});
