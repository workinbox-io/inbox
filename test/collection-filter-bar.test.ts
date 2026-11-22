import { describe, expect, it } from "vitest"
import { createFilterQuery, createFilterRule } from "../src/components/reui/filters/filters-query"
import { toRules } from "../src/components/collections/filter-menu"

const rule = (id: string, field: string, operator: string, value?: unknown) => createFilterRule({ id, path: [field], operator, value })

describe("collection filter bar ↔ rules", () => {
  it("keeps complete chips and drops ones still waiting for a value", () => {
    const q = createFilterQuery([
      rule("a", "status", "is", ["Done"]),
      rule("b", "status", "not", []),
      rule("c", "due", "before", "2026-11-20"),
      rule("d", "due", "after", undefined),
      rule("e", "points", "gt", 3),
      rule("f", "notes", "contains", "  hi "),
      rule("g", "notes", "contains", " "),
      rule("h", "done", "checked"),
      rule("i", "x", "bogus", "1"),
    ])
    expect(toRules(q)).toEqual([
      { field: "status", op: "is", value: ["Done"] },
      { field: "due", op: "before", value: "2026-11-20" },
      { field: "points", op: "gt", value: 3 },
      { field: "notes", op: "contains", value: "hi" },
      { field: "done", op: "checked" },
    ])
  })
})
