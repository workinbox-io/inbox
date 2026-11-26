import { describe, expect, it } from "vitest";
import { decodeMentions, encodeMentions, plainChat, tokenize } from "../src/lib/chat/format";
import { docToHtml, docToText } from "../src/lib/mail/doc-render";
import { encodePicked, parseRef, parseRefs, refHref, refToken, replaceRef, sanitizeRefs } from "../src/lib/mentions";

const O = "https://workinbox.io";

describe("ref tokens", () => {
  it("round-trips and cleans titles", () => {
    const tok = refToken({ kind: "file", id: "abc-1", title: "Q3 <report>|final\n" });
    expect(tok).toBe("<@file:abc-1|Q3 report final>");
    expect(parseRef(tok)).toEqual({ kind: "file", id: "abc-1", title: "Q3 report final" });
    const ev = refToken({ kind: "event", id: "e1~1700000000000", title: "Standup", url: `${O}/s/tok` });
    expect(parseRef(ev)).toEqual({ kind: "event", id: "e1~1700000000000", title: "Standup", url: `${O}/s/tok` });
  });

  it("keeps only our own links", () => {
    const text = `see <@file:a|A|https://evil.example/x> and <@note:b|B|${O}/n/tok>`;
    expect(parseRefs(sanitizeRefs(text, O))).toEqual([
      { kind: "file", id: "a", title: "A" },
      { kind: "note", id: "b", title: "B", url: `${O}/n/tok` },
    ]);
  });

  it("encodes what was picked, longest label first, and swaps a ref for its linked version", () => {
    const out = encodePicked("hi @Q3 report final and @Q3 report", [
      { label: "Q3 report", token: "<@file:1|Q3 report>" },
      { label: "Q3 report final", token: "<@file:2|Q3 report final>" },
    ]);
    expect(out).toBe("hi <@file:2|Q3 report final> and <@file:1|Q3 report>");
    expect(replaceRef(out, { kind: "file", id: "1", title: "Q3 report", url: `${O}/s/x` })).toContain(`<@file:1|Q3 report|${O}/s/x>`);
    expect(refHref({ kind: "note", id: "n1", title: "N" })).toBe("/app/open/note/n1");
  });
});

describe("chat with refs", () => {
  it("tokenizes refs next to people and survives an edit", () => {
    const text = "<@u1> see <@file:f1|Plan.pdf>";
    expect(tokenize(text).map((t) => t.type)).toEqual(["mention", "text", "ref"]);
    expect(plainChat(text, () => "Anna")).toBe("@Anna see @Plan.pdf");
    const edit = decodeMentions(text, () => "Anna");
    expect(edit).toBe("@Anna see @Plan.pdf");
    expect(encodeMentions(edit, [{ id: "u1", name: "Anna" }], [{ kind: "file", id: "f1", title: "Plan.pdf" }])).toBe(text);
  });
});

describe("doc render", () => {
  const doc = [
    { type: "p", children: [{ text: "Hi <b>", bold: true }, { type: "a", url: "javascript:alert(1)", children: [{ text: "x" }] }] },
    { type: "p", listStyleType: "decimal", indent: 1, children: [{ text: "one" }] },
    { type: "p", listStyleType: "decimal", indent: 1, children: [{ text: "two" }] },
    { type: "p", children: [{ type: "mention", key: "file:f1", value: "Plan.pdf", url: `${O}/s/tok`, children: [{ text: "" }] }] },
    { type: "p", children: [{ type: "mention", key: "note:n1", value: "Notes", url: "https://evil.example", children: [{ text: "" }] }] },
    { type: "script", children: [{ text: "<script>" }] },
  ];

  it("escapes, drops unsafe links and links mentions", () => {
    const html = docToHtml(doc, O);
    expect(html).toContain("<strong>Hi &lt;b&gt;</strong>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
    expect(html).toContain("1. one");
    expect(html).toContain("2. two");
    expect(html).toContain(`href="${O}/s/tok"`);
    expect(html).toContain(`href="${O}/app/open/note/n1"`);
    expect(html).not.toContain("evil.example");
  });

  it("writes the text part", () => {
    expect(docToText(doc, O)).toBe(`Hi <b>x\n1. one\n2. two\nPlan.pdf <${O}/s/tok>\nNotes <${O}/app/open/note/n1>\n<script>`);
  });
});

describe("doc refs", () => {
  it("finds mentions and puts links on them", async () => {
    const { docRefs, withRefUrls } = await import("../src/lib/mail/doc-render");
    const doc = [{ type: "p", children: [{ text: "a" }, { type: "mention", key: "file:f1", value: "Plan.pdf", children: [{ text: "" }] }, { type: "mention", key: "person:u1", value: "Anna", children: [{ text: "" }] }] }];
    expect(docRefs(doc)).toEqual([{ kind: "file", id: "f1", title: "Plan.pdf" }]);
    const linked = withRefUrls(doc, [{ kind: "file", id: "f1", title: "Plan.pdf", url: `${O}/s/t` }]);
    expect(docRefs(linked)[0]!.url).toBe(`${O}/s/t`);
    expect(docToText(linked, O)).toBe(`aPlan.pdf <${O}/s/t>@Anna`);
  });
});
