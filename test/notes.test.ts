import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { canManageNote, noteRole, plainText, titleFrom, type NoteAccessFacts } from "../src/lib/notes/access";
import { markdownToValue, valueToMarkdown } from "../src/lib/notes/plate";
import { signTicket, verifyTicket, type NoteTicket } from "../src/lib/notes/ticket";
import { readDoc, seedDoc } from "../src/lib/notes/ydoc";

const note = (over: Partial<NoteAccessFacts> = {}): NoteAccessFacts => ({ ownerId: "anna", sharing: "private", teamRole: "edit", ...over });
const member = { userId: "bob", manager: false };
const admin = { userId: "ceo", manager: true };
const apiKey = { userId: "", manager: true };

describe("noteRole", () => {
  it("gives the owner everything", () => {
    expect(noteRole(note(), { userId: "anna", manager: false })).toBe("owner");
  });

  it("keeps private notes from everyone else, admins included", () => {
    expect(noteRole(note(), member)).toBeNull();
    expect(noteRole(note(), admin)).toBeNull();
    expect(noteRole(note(), member, "edit")).toBeNull();
    expect(noteRole(note(), apiKey)).toBeNull();
  });

  it("uses the grant for people notes", () => {
    expect(noteRole(note({ sharing: "people" }), member)).toBeNull();
    expect(noteRole(note({ sharing: "people" }), member, "view")).toBe("view");
    expect(noteRole(note({ sharing: "people" }), member, "edit")).toBe("edit");
    expect(noteRole(note({ sharing: "people" }), admin)).toBeNull();
  });

  it("gives the team role on team notes, raised by a grant", () => {
    expect(noteRole(note({ sharing: "team", teamRole: "view" }), member)).toBe("view");
    expect(noteRole(note({ sharing: "team", teamRole: "view" }), member, "edit")).toBe("edit");
    expect(noteRole(note({ sharing: "team", teamRole: "edit" }), member, "view")).toBe("edit");
    expect(noteRole(note({ sharing: "team", teamRole: "edit" }), apiKey, "view")).toBe("edit");
  });

  it("lets managers run team notes without an owner", () => {
    expect(noteRole(note({ ownerId: null, sharing: "team", teamRole: "view" }), admin)).toBe("owner");
    expect(noteRole(note({ ownerId: null, sharing: "team", teamRole: "view" }), member)).toBe("view");
  });

  it("lets managers and admin keys manage team notes only", () => {
    const team = note({ sharing: "team" });
    expect(canManageNote(team, admin, noteRole(team, admin))).toBe(true);
    expect(canManageNote(team, member, noteRole(team, member))).toBe(false);
    expect(canManageNote(note({ sharing: "people" }), admin, null)).toBe(false);
    expect(canManageNote(team, apiKey, noteRole(team, apiKey))).toBe(true);
    expect(canManageNote(team, { userId: "", manager: false }, "edit")).toBe(false);
  });
});

describe("plainText and titleFrom", () => {
  it("joins blocks and table cells into lines", () => {
    const value = [
      { type: "h1", children: [{ text: "Plan" }] },
      { type: "p", children: [{ text: "See " }, { type: "a", url: "https://x.y", children: [{ text: "link" }] }, { text: "." }] },
      { type: "table", children: [{ type: "tr", children: [{ type: "td", children: [{ type: "p", children: [{ text: "A1" }] }] }] }] },
    ];
    expect(plainText(value)).toBe("Plan\nSee link.\nA1");
  });

  it("titles from the first line", () => {
    expect(titleFrom("\n  Kickoff  \nrest")).toBe("Kickoff");
    expect(titleFrom("")).toBe("Untitled");
    expect(titleFrom("x".repeat(100))).toHaveLength(80);
  });
});

describe("markdown", () => {
  it("round-trips the common blocks", () => {
    const md = "# Plan\n\nSome **bold** and a [link](https://example.com).\n\n* one\n* two\n\n> quote";
    const value = markdownToValue(md);
    expect(value[0]).toMatchObject({ type: "h1" });
    const back = valueToMarkdown(value);
    expect(back).toContain("# Plan");
    expect(back).toContain("**bold**");
    expect(back).toContain("[link](https://example.com)");
    expect(back).toContain("> quote");
  });

  it("gives an empty paragraph for empty input", () => {
    expect(markdownToValue("  ")).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });
});

describe("ydoc", () => {
  it("seeds and reads back a value and title", () => {
    const doc = new Y.Doc();
    seedDoc(doc, [{ type: "p", children: [{ text: "Hello" }] }], "Title");
    const out = readDoc(doc);
    expect(out.value).toEqual([{ type: "p", children: [{ text: "Hello" }] }]);
    expect(out.title).toBe("Title");
    // A copy through an update keeps it.
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    expect(readDoc(other).value).toEqual(out.value);
  });
});

describe("tickets", () => {
  const base: NoteTicket = { noteId: "n1", orgId: "o", userId: "u", name: "Ann", color: "red", canEdit: true, exp: Date.now() + 60_000 };

  it("verifies a fresh ticket for the same note", async () => {
    const t = await signTicket(base, "s3cret");
    expect(await verifyTicket(t, "n1", "s3cret")).toMatchObject({ userId: "u", canEdit: true });
  });

  it("rejects another note, another secret, expiry and tampering", async () => {
    const t = await signTicket(base, "s3cret");
    expect(await verifyTicket(t, "n2", "s3cret")).toBeNull();
    expect(await verifyTicket(t, "n1", "other")).toBeNull();
    expect(await verifyTicket(t, "n1", "s3cret", base.exp + 1)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ ...base, canEdit: false })).replace(/=+$/, "");
    expect(await verifyTicket(`${forged}.${sig}`, "n1", "s3cret")).toBeNull();
    expect(await verifyTicket(`${body}`, "n1", "s3cret")).toBeNull();
  });
});
