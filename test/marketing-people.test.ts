import { expect, it } from "vitest";
import { personReferences } from "../src/lib/marketing-people";

it("recognizes example people without changing text or shared mailboxes", () => {
  for (const text of ["anna@ ben@ chris@ → 3 inboxes", "anna and ben are editing", "marta@brightloop.io → saved", "reply to marta → draft → Send", "add people anna ben chris"]) {
    const parts = personReferences(text);
    expect(parts.map(p => p.label).join("")).toBe(text);
    expect(parts.filter(p => p.seed).length).toBeGreaterThan(0);
  }
  expect(personReferences("support@ banana ben@example.org" ).filter(p => p.seed)).toEqual([
    { label: "ben@example.org", seed: "ben@acme.com" },
  ]);
  expect(personReferences("Anna")[0]!.seed).toBe(personReferences("anna@")[0]!.seed);
  expect(personReferences("anna@ ben@ chris@").filter(p => p.seed)).toHaveLength(3);
  expect(personReferences("marta@brightloop.io")).toEqual([{ label: "marta@brightloop.io", seed: "marta@brightloop.io" }]);
});
