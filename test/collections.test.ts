import { describe, expect, it } from "vitest";
import { cleanValues, COLLECTION_TEMPLATES, commentAudience, defaultValues, CollectionError, fieldStyle, isClosed, mergeValues, normalizeFields, priorityLevel, sameValue, statusFieldOf, statusKind, TEMPLATE_IDS } from "@/lib/collections/fields";
import { dueState, isDueField, NONE, positionBetween, spreadPositions } from "@/lib/collections/board";
import { compareRecords, defaultView, matchesView, normalizeView } from "@/lib/collections/view-config";
import { cycleDaysLeft, cycleOf, cycleRange, nextRun, slaHours, slaState } from "@/lib/collections/settings";
import { formatId, parseId, prefixFrom } from "@/lib/collections/ids";
import { CREATED, diffRecord, MERGE_MS, mergesInto } from "@/lib/collections/activity";
import { parseLink } from "@/lib/collections/links";
import { mentionedPeople } from "@/lib/collections/description";

describe("normalizeFields", () => {
  it("makes ids from names and keeps existing ones", () => {
    const fields = normalizeFields([
      { id: "status", name: "State", type: "select", options: ["A", " B ", "A"] },
      { name: "Serial number", type: "text" },
      { name: "Status", type: "text" },
      { name: "Zażółć", type: "number" },
    ]);
    expect(fields.map((f) => f.id)).toEqual(["status", "serial_number", "status_2", "zazolc"]);
    expect(fields[0]!.options).toEqual(["A", "B"]);
  });
  it("rejects duplicate names and empty selects", () => {
    expect(() => normalizeFields([{ name: "A", type: "text" }, { name: "a", type: "number" }])).toThrow(CollectionError);
    expect(() => normalizeFields([{ name: "Stage", type: "select", options: [] }])).toThrow(/choice/);
  });
  it("accepts every template", () => {
    for (const id of TEMPLATE_IDS) expect(normalizeFields(COLLECTION_TEMPLATES[id].fields).length).toBeGreaterThan(2);
  });
});

describe("values", () => {
  const fields = normalizeFields(COLLECTION_TEMPLATES.crm.fields);
  it("checks and converts values, by id or name", () => {
    expect(cleanValues(fields, { stage: "won", Value: "1 200".replace(" ", ""), "close date": "2026-12-01T10:00", Contact: "A@B.CO" })).toEqual({
      stage: "Won",
      value: 1200,
      close_date: "2026-12-01",
      contact: "a@b.co",
    });
  });
  it("rejects bad values and unknown fields", () => {
    expect(() => cleanValues(fields, { stage: "Maybe" })).toThrow(/one of/);
    expect(() => cleanValues(fields, { value: "lots" })).toThrow(CollectionError);
    expect(() => cleanValues(fields, { close_date: "2026-13-45" })).toThrow(CollectionError);
    expect(() => cleanValues(fields, { colour: "red" })).toThrow(/No field/);
  });
  it("merges a patch: null clears, gone fields drop", () => {
    const merged = mergeValues(fields, { stage: "Lead", company: "Acme", removed: "x" }, { company: null, value: 5 });
    expect(merged).toEqual({ stage: "Lead", value: 5 });
  });
});

describe("csv", async () => {
  const { csvToRows, recordsToCsv } = await import("@/lib/collections/csv");
  const { parseCsv } = await import("@/lib/csv");
  const fields = normalizeFields(COLLECTION_TEMPLATES.equipment.fields);
  it("maps columns by name, semicolons included, and reports unknown ones", () => {
    const table = parseCsv("Nazwa;status;Serial number;Colour\nMacBook Pro;In use;C02X;silver\n;In stock;;\nDell monitor;;;black\n");
    expect(csvToRows(fields, table)).toEqual({
      rows: [
        { title: "MacBook Pro", values: { status: "In use", serial_number: "C02X" } },
        { title: "Dell monitor", values: {} },
      ],
      unknown: ["Colour"],
    });
  });
  it("round-trips an export", () => {
    const csv = recordsToCsv(fields, [{ title: 'Phone, "work"', values: { status: "In use", assigned_to: "u1" } }], [{ id: "u1", email: "anna@acme.test" }]);
    expect(csv.split("\r\n")[0]).toBe("Name,Status,Type,Serial number,Assigned to,Purchased");
    expect(csvToRows(fields, parseCsv(csv)).rows).toEqual([{ title: 'Phone, "work"', values: { status: "In use", assigned_to: "anna@acme.test" } }]);
  });
});

describe("inferFields", async () => {
  const { inferFields } = await import("@/lib/collections/csv");
  const { parseCsv } = await import("@/lib/csv");
  it("types columns from their values", () => {
    const csv = [
      "Produkt;SKU;Ilość;Status;Dostawa;Opiekun;Kontakt;Strona;Aktywny;Uwagi",
      "Kabel USB-C;00123;12;Low;01.12.2026;Diana Nowak;a@b.co;https://x.io;tak;krótki",
      "Ładowarka;00124;1 200;In stock;2026-12-03;diana@acme.test;c@d.co;https://y.io;nie;",
      "Monitor;00125;3,5;Low;;;;;tak;27 cali",
      "Mysz;00126;40;In stock;;;;;nie;bezprzewodowa",
    ].join("\n");
    const { fields } = inferFields(parseCsv(csv), [{ name: "Diana Nowak", email: "diana@acme.test" }]);
    expect(fields.map((f) => `${f.name}:${f.type}`)).toEqual([
      "SKU:text", "Ilość:number", "Status:select", "Dostawa:date", "Opiekun:person", "Kontakt:email", "Strona:url", "Aktywny:checkbox", "Uwagi:text",
    ]);
    expect(fields.find((f) => f.name === "Status")!.options).toEqual(["Low", "In stock"]);
  });
  it("accepts what it inferred", () => {
    const fields = normalizeFields(inferFields(parseCsv("Name,When,Done\nA,01.02.2026,yes\nB,2026-03-04,no\n")).fields);
    expect(cleanValues(fields, { when: "01.02.2026", done: "yes" })).toEqual({ when: "2026-02-01", done: true });
    expect(cleanValues(normalizeFields([{ name: "Qty", type: "number" }]), { qty: "1 200,5" })).toEqual({ qty: 1200.5 });
  });
});

describe("automations", async () => {
  const { fires, triggerText, recordRows } = await import("@/lib/collections/automations");
  const fields = normalizeFields(COLLECTION_TEMPLATES.inventory.fields);
  it("fires on new records and on changes to a value", () => {
    expect(fires({ on: "created" }, null, {})).toBe(true);
    expect(fires({ on: "created" }, {}, {})).toBe(false);
    const low = { on: "changed", field: "status", value: "Low" } as const;
    expect(fires(low, { status: "In stock" }, { status: "Low" })).toBe(true);
    expect(fires(low, { status: "Low" }, { status: "Low", quantity: 3 })).toBe(false);
    expect(fires(low, null, { status: "Low" })).toBe(false);
    expect(fires({ on: "changed", field: "quantity", value: null }, { quantity: 4 }, { quantity: 3 })).toBe(true);
    expect(fires({ on: "changed", field: "done", value: "true" }, { done: false }, { done: true })).toBe(true);
  });
  it("reads as a sentence and rows", () => {
    expect(triggerText({ on: "changed", field: "status", value: "Low" }, fields)).toBe("When Status changes to Low");
    expect(recordRows(fields, { status: "Low", quantity: 3 }, [])).toEqual([{ label: "Status", value: "Low" }, { label: "Quantity", value: "3" }]);
  });
});

describe("commentAudience", () => {
  it("mentions win over comment notices, skips the author and people without access", () => {
    const out = commentAudience({ mentioned: ["b", "x", "a"], assignees: ["b", "c"], creator: "d", commenters: ["a", "e", "e"], author: "a", canView: (id) => id !== "x" });
    expect(out).toEqual({ mention: ["b"], comment: ["c", "d", "e"] });
  });
  it("adds followers and leaves out people who muted the record", () => {
    const out = commentAudience({ mentioned: [], assignees: ["c"], creator: "d", commenters: [], author: "a", canView: () => true, subscribed: ["f", "a"], muted: ["c"] });
    expect(out).toEqual({ mention: [], comment: ["d", "f"] });
  });
});

describe("board", () => {
  it("drops between neighbours", () => {
    expect(positionBetween(undefined, undefined)).toBe(0);
    expect(positionBetween(undefined, 5)).toBe(4);
    expect(positionBetween(5, undefined)).toBe(6);
    expect(positionBetween(1, 2)).toBe(1.5);
  });
  it("marks due dates", () => {
    expect(dueState("2026-11-16", "2026-11-17")).toBe("overdue");
    expect(dueState("2026-11-19", "2026-11-17")).toBe("soon");
    expect(dueState("2026-11-20", "2026-11-17")).toBeNull();
    expect(isDueField({ id: "due", name: "Due", type: "date" })).toBe(true);
    expect(isDueField({ id: "p", name: "Purchased", type: "date" })).toBe(false);
  });
});

describe("spreadPositions", () => {
  it("spreads several cards between neighbours", () => {
    expect(spreadPositions(0, 4, 3)).toEqual([1, 2, 3]);
    expect(spreadPositions(undefined, 10, 2)).toEqual([8, 9]);
    expect(spreadPositions(5, undefined, 2)).toEqual([6, 7]);
    expect(spreadPositions(undefined, undefined, 2)).toEqual([0, 1]);
  });
});

describe("view config", () => {
  const fields = normalizeFields([
    { id: "status", name: "Status", type: "select", options: ["A", "B"] },
    { id: "owner", name: "Owner", type: "person" },
    { id: "due", name: "Due", type: "date" },
  ]);
  it("defaults to the first choice field and drops unknown ones", () => {
    expect(defaultView(fields).group).toBe("status");
    const v = normalizeView({ layout: "board", group: "gone", lanes: "owner", order: "nope", props: ["due", "gone"], filters: { status: ["A"], due: ["x"] } }, fields);
    expect(v).toMatchObject({ layout: "board", group: "status", lanes: "owner", order: "manual", props: ["due"], filters: [{ field: "status", op: "is", value: ["A"] }] });
    expect(normalizeView({ layout: "timeline", start: "due", end: "due" }, fields)).toMatchObject({ layout: "timeline", start: "due", end: null });
    expect(normalizeView({ layout: "calendar" }, normalizeFields([{ name: "S", type: "select", options: ["x"] }])).layout).toBe("list");
    expect(normalizeView({ group: "owner", lanes: "owner" }, fields).lanes).toBeNull();
    expect(normalizeView("junk", fields)).toEqual(defaultView(fields));
  });
  it("orders records", () => {
    const r = (title: string, position: number, due?: string, updatedAt = "2026-01-01") => ({ title, position, values: (due ? { due } : {}) as Record<string, string>, createdAt: updatedAt, updatedAt });
    const list = [r("b", 2, "2026-02-01", "2026-01-02"), r("a", 1, undefined, "2026-01-03"), r("c", 3, "2026-01-01", "2026-01-01")];
    expect([...list].sort(compareRecords("manual", 1, fields)).map((x) => x.title)).toEqual(["a", "b", "c"]);
    expect([...list].sort(compareRecords("updated", 1, fields)).map((x) => x.title)).toEqual(["a", "b", "c"]);
    expect([...list].sort(compareRecords("due", 1, fields)).map((x) => x.title)).toEqual(["c", "b", "a"]);
    expect([...list].sort(compareRecords("title", -1, fields)).map((x) => x.title)).toEqual(["c", "b", "a"]);
    const tie = [r("b", 1, "2026-01-01"), r("a", 1, "2026-01-01")];
    expect([...tie].sort(compareRecords("due", 1, fields, [], { order: "title", dir: 1 })).map((x) => x.title)).toEqual(["a", "b"]);
  });
  it("filters with operators and hides closed records", () => {
    const fs = normalizeFields([
      { id: "status", name: "Status", type: "select", options: ["To do", "Done"] },
      { id: "labels", name: "Labels", type: "multiselect", options: ["Bug", "UI"] },
      { id: "due", name: "Due", type: "date" },
      { id: "n", name: "Points", type: "number" },
      { id: "notes", name: "Notes", type: "text" },
    ]);
    const view = (filters: unknown[], closed = true) => normalizeView({ filters, closed }, fs);
    const rec = { status: "To do", labels: ["Bug"], due: "2026-11-10", n: 3, notes: "Call Ola" };
    const ok = (filters: unknown[], values: Record<string, unknown> = rec, closed = true) => matchesView(fs, view(filters, closed), values as never, "2026-11-17");
    expect(ok([{ field: "labels", op: "is", value: ["UI", "Bug"] }])).toBe(true);
    expect(ok([{ field: "labels", op: "not", value: ["Bug"] }])).toBe(false);
    expect(ok([{ field: "labels", op: "is", value: [NONE] }], {})).toBe(true);
    expect(ok([{ field: "due", op: "overdue" }])).toBe(true);
    expect(ok([{ field: "due", op: "after", value: "2026-11-12" }])).toBe(false);
    expect(ok([{ field: "n", op: "gt", value: 2 }, { field: "notes", op: "contains", value: "ola" }])).toBe(true);
    expect(ok([{ field: "notes", op: "empty" }])).toBe(false);
    expect(ok([], { status: "Done" }, false)).toBe(false);
    expect(view([{ field: "n", op: "is", value: ["x"] }]).filters).toEqual([]);
  });
});

describe("status, priority and new field types", () => {
  const status = { id: "s", name: "Status", type: "select" as const, options: ["Backlog", "To do", "Doing", "Review", "Done", "Cancelled"] };
  it("reads a workflow from the choices", () => {
    expect(fieldStyle(status)).toBe("status");
    expect(["Backlog", "To do", "Doing", "Done", "Cancelled"].map((o) => statusKind(status, o))).toEqual(["backlog", "unstarted", "started", "done", "canceled"]);
    const plain = { id: "s", name: "Stage", type: "select" as const, options: ["Lead", "Proposal", "Signed"] };
    expect(statusKind(plain, "Signed")).toBe("done");
    expect(isClosed([status], { s: "Cancelled" })).toBe(true);
    expect(isClosed([status], { s: "Review" })).toBe(false);
    expect(statusFieldOf([{ ...status, style: "plain" }])).toBeUndefined();
  });
  it("ranks priorities by name or place", () => {
    const p = { id: "p", name: "Priority", type: "select" as const, options: ["Urgent", "High", "Medium", "Low"] };
    expect(fieldStyle(p)).toBe("priority");
    expect(p.options.map((o) => priorityLevel(p, o))).toEqual([4, 3, 2, 1]);
    expect(priorityLevel({ ...p, options: ["A", "B", "C"] }, "A")).toBe(4);
    expect(priorityLevel(p, undefined)).toBe(0);
  });
  it("checks multiselect, relation and file values", () => {
    const fs = normalizeFields([
      { id: "l", name: "Labels", type: "multiselect", options: ["Bug", "UI", "API"] },
      { id: "r", name: "Project", type: "relation", target: "c1" },
      { id: "f", name: "Contract", type: "file" },
    ]);
    expect(cleanValues(fs, { Labels: "api, bug" })).toEqual({ l: ["Bug", "API"] });
    expect(cleanValues(fs, { l: [] })).toEqual({ l: null });
    expect(() => cleanValues(fs, { l: ["Nope"] })).toThrow(CollectionError);
    expect(cleanValues(fs, { r: "rec_1", f: "/api/files/attachments/o/x/a.pdf" })).toEqual({ r: "rec_1", f: "/api/files/attachments/o/x/a.pdf" });
    expect(() => cleanValues(fs, { f: "https://evil.example/a.pdf" })).toThrow(CollectionError);
    expect(() => normalizeFields([{ name: "Project", type: "relation" }])).toThrow(CollectionError);
    expect(sameValue(["a"], ["a"])).toBe(true);
    expect(diffRecord({ title: "x", values: { l: ["Bug"] } }, { title: "x", values: { l: ["Bug"] } })).toEqual([]);
  });
});

describe("cycles, SLA and repeats", () => {
  const cycles = { weeks: 2, start: "2026-11-02" };
  it("numbers cycles from the start date", () => {
    expect(cycleOf(cycles, "2026-11-01")).toBe(0);
    expect(cycleOf(cycles, "2026-11-02")).toBe(1);
    expect(cycleOf(cycles, "2026-11-16")).toBe(2);
    expect(cycleRange(cycles, 2)).toEqual({ start: "2026-11-16", end: "2026-11-29" });
    expect(cycleDaysLeft(cycles, "2026-11-17")).toBe(13);
  });
  it("times an SLA by the record's priority", () => {
    const sla = { field: "p", hours: { Urgent: 4 } };
    expect(slaHours(sla, { p: "Urgent" })).toBe(4);
    expect(slaHours(sla, { p: "Low" })).toBeNull();
    const h = 3_600_000;
    expect(slaState(0, 4, h).state).toBe("ok");
    expect(slaState(0, 4, 3 * h).state).toBe("soon");
    expect(slaState(0, 4, 5 * h).state).toBe("breached");
  });
  it("steps repeating records, keeping the day of the month", () => {
    const d = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    expect(nextRun(d("2026-01-31"), 1, "month")).toBe(d("2026-02-28"));
    expect(nextRun(d("2026-01-15"), 2, "week")).toBe(d("2026-01-29"));
    expect(nextRun(d("2026-01-15"), 3, "day")).toBe(d("2026-01-18"));
  });
});

describe("record ids", () => {
  it("makes prefixes and parses ids", () => {
    expect(prefixFrom("Tasks")).toBe("TAS");
    expect(prefixFrom("Office equipment")).toBe("OE");
    expect(prefixFrom("Zażółć gęślą")).toBe("ZG");
    expect(prefixFrom("Łódź")).toBe("LOD");
    expect(prefixFrom("—")).toBe("REC");
    expect(formatId("TAS", 12)).toBe("TAS-12");
    expect(formatId("TAS", 0)).toBeNull();
    expect(parseId(" tas-12 ")).toEqual({ prefix: "TAS", number: 12 });
    expect(parseId("hello")).toBeNull();
  });
});

describe("activity", () => {
  it("diffs title and values", () => {
    expect(diffRecord({ title: "A", values: { s: "x", p: "u1" } }, { title: "B", values: { s: "y" } })).toEqual([
      { field: "title", from: "A", to: "B" },
      { field: "s", from: "x", to: "y" },
      { field: "p", from: "u1", to: null },
    ]);
    expect(diffRecord({ title: "A", values: { s: "x" } }, { title: "A", values: { s: "x" } })).toEqual([]);
  });
  it("folds quick repeats by the same person", () => {
    expect(mergesInto({ actorId: "u", field: "s", at: 0 }, "u", "s", 60_000)).toBe(true);
    expect(mergesInto({ actorId: "u", field: "s", at: 0 }, "v", "s", 60_000)).toBe(false);
    expect(mergesInto({ actorId: "u", field: "s", at: 0 }, "u", "s", MERGE_MS + 1)).toBe(false);
    expect(mergesInto({ actorId: "u", field: CREATED, at: 0 }, "u", CREATED, 1)).toBe(false);
  });
});

describe("record links and description", () => {
  it("reads links", () => {
    expect(parseLink("https://github.com/acme/web/pull/42")).toMatchObject({ kind: "github_pr", title: "acme/web#42" });
    expect(parseLink("https://github.com/acme/web/issues/7#x")).toMatchObject({ kind: "github_issue", title: "acme/web#7" });
    expect(parseLink("https://github.com/acme/web/commit/abcdef1234567")).toMatchObject({ kind: "github_commit", title: "acme/web@abcdef1" });
    expect(parseLink("https://www.figma.com/design/AbC123/Landing-page?node-id=1")).toMatchObject({ kind: "figma", title: "Landing page" });
    expect(parseLink("https://linear.app/acme/issue/eng-12/fix")).toMatchObject({ kind: "linear", title: "ENG-12" });
    expect(parseLink("https://example.com/docs/a/")).toMatchObject({ kind: "url", title: "example.com/docs/a" });
    expect(parseLink("javascript:alert(1)")).toBeNull();
    expect(parseLink("not a url")).toBeNull();
  });
  it("finds mentioned people", () => {
    const doc = [{ type: "p", children: [{ text: "hi " }, { type: "mention", key: "person:u1", children: [{ text: "" }] }, { type: "mention", key: "note:n1", children: [{ text: "" }] }] }];
    expect(mentionedPeople(doc)).toEqual(["u1"]);
    expect(mentionedPeople(null)).toEqual([]);
  });
});

describe("defaultValues", () => {
  const ctx = { userId: "u1", today: "2026-11-17" };
  const fields = normalizeFields([
    { name: "Status", type: "select", options: ["Backlog", "In progress", "Done"] },
    { name: "Category", type: "select", options: ["A", "B"] },
  ]);
  const status = fields[0]!.id;

  it("gives a new record the first status, never another select's first choice", () => {
    expect(defaultValues(fields, {}, ctx)).toEqual({ [status]: "Backlog" });
  });

  it("keeps a value given on purpose, by id or name, even an empty one", () => {
    expect(defaultValues(fields, { [status]: "Done" }, ctx)).toEqual({});
    expect(defaultValues(fields, { Status: null }, ctx)).toEqual({});
  });

  it("does nothing without a status field or defaults", () => {
    expect(defaultValues(normalizeFields([{ name: "Category", type: "select", options: ["A"] }]), {}, ctx)).toEqual({});
  });

  it("uses each field's default, with me and today resolved", () => {
    const f = normalizeFields([
      { name: "Stage", type: "select", style: "status", options: ["Lead", "Won"], default: "won" },
      { name: "Owner", type: "person", default: "me" },
      { name: "Due", type: "date", default: "today" },
      { name: "Hours", type: "number", default: "1,5" },
      { name: "Paid", type: "checkbox", default: false },
    ]);
    expect(f[0]!.default).toBe("Won");
    expect(f[4]!.default).toBeUndefined();
    expect(defaultValues(f, {}, ctx)).toEqual({ stage: "Won", owner: "u1", due: "2026-11-17", hours: 1.5 });
    expect(defaultValues(f, {}, { ...ctx, userId: null })).not.toHaveProperty("owner");
  });

  it("refuses defaults that can't be one", () => {
    expect(() => normalizeFields([{ name: "Owner", type: "person", default: "someone" }])).toThrow(CollectionError);
    expect(() => normalizeFields([{ name: "Kind", type: "select", options: ["A"], default: "Z" }])).toThrow(CollectionError);
  });
});
