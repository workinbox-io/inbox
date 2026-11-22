import { describe, expect, it } from "vitest";
import * as EN from "@/lib/server/demo/content";
import * as PL from "@/lib/server/demo/content-pl";
import { pdf } from "@/lib/server/demo/files";
import { demoBlocked, isDemoAddress, isDemoSlug } from "@/lib/demo";

describe.each([["en", EN], ["pl", PL]] as const)("demo content (%s)", (_, C) => {
  it("references only things it defines", () => {
    expect(C.NOTES.map((n) => n.title)).toContain(C.CLIENT_NOTE);
    expect(C.FOLDERS).toContain(C.SHARED_FOLDER);
    expect(C.FOLDERS).toContain(C.PROJECT_FOLDER);
    for (const [, folder] of C.FILES) if (folder) expect(C.FOLDERS).toContain(folder);
    expect(C.FILES.map(([name]) => name)).toEqual(expect.arrayContaining([C.BRIEF_FILE, C.CONTRACT_FILE]));
    for (const e of C.EVENTS) if (e.by) expect(C.PEOPLE).toHaveProperty(e.by);
    for (const [, , who] of C.TASK_ROWS) expect(C.PEOPLE).toHaveProperty(who);
    expect(C.EVENTS.filter((e) => e.notes)).toHaveLength(1);
    expect(C.CHANNEL).toMatch(/^[a-z0-9-]+$/);
    expect(C.MAIL.map((m) => m.subject)).toContain(C.DRAFTS.support.thread);
    expect(C.MAIL.filter((m) => m.label).every((m) => C.LABELS.includes(m.label!))).toBe(true);
    expect(C.NOTES.filter((n) => n.folder).map((n) => n.folder)).toHaveLength(1);
    const tasks = C.TASK_ROWS.map(([title]) => title);
    for (const t of [C.COPY_TASK, ...C.BLOCKED]) expect(tasks).toContain(t);
    expect(C.CHAT.signed).toContain("{note}");
    expect(C.CHAT.brief).toContain("{file}");
  });

  it("fills collection fields in their order with their choices", () => {
    const check = (fields: typeof C.TASK_FIELDS, rows: unknown[][]) => {
      for (const row of rows) row.slice(1).forEach((v, i) => {
        const f = fields[i]!;
        if (f.type === "select" && v !== null) expect(f.options).toContain(v);
        if (f.type === "multiselect") for (const o of v as string[]) expect(f.options).toContain(o);
      });
    };
    check(C.TASK_FIELDS, C.TASK_ROWS);
    check(C.TASK_FIELDS, C.SUBTASKS);
    check(C.DEAL_FIELDS, C.DEAL_ROWS);
    check(C.RENTAL_FIELDS, C.RENTAL_ROWS);
  });

  it("has one owner, and the visitor is a member", () => {
    expect(Object.values(C.PEOPLE).filter((p) => p.role === "owner")).toHaveLength(1);
    expect(C.PEOPLE.anna.role).toBe("member");
  });

  it("gives every file and attachment a body", () => {
    for (const [name] of C.FILES) expect(C.fileBody(name).bytes.byteLength).toBeGreaterThan(20);
    for (const m of C.MAIL) if (m.attach) expect(C.fileBody(m.attach).type).toBe("application/pdf");
  });
});

describe("demo stories", () => {
  it("tell the same story in every language", () => {
    const shape = (C: typeof EN) => ({
      mail: C.MAIL.map((m) => [m.to, m.ago, !!m.reply, !!m.attach, !!m.label]),
      notes: C.NOTES.length, files: C.FILES.length, folders: C.FOLDERS.length, contacts: C.CONTACTS.length, events: C.EVENTS.map((e) => [e.day, e.by]),
      tasks: C.TASK_ROWS.map((r) => [r[2], r[3]]), deals: C.DEAL_ROWS.length, rentals: C.RENTAL_ROWS.map((r) => r[3]),
      fields: [C.TASK_FIELDS, C.DEAL_FIELDS, C.RENTAL_FIELDS].map((fs) => fs.map((f) => [f.type, f.style, f.options?.length])),
      chat: Object.keys(C.CHAT), comments: C.TASK_COMMENTS.map(([who]) => who),
    });
    expect(shape(PL)).toEqual(shape(EN));
  });

  it("makes PDFs whose xref points at their objects", () => {
    const text = new TextDecoder().decode(pdf("Title (draft)", ["a line"]));
    const start = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const first = Number(text.match(/xref\n0 \d+\n.*\n(\d{10})/)![1]);
    expect(text.slice(first, first + 7)).toBe("1 0 obj");
    expect(text).toContain("(Title \\(draft\\))");
  });

  it("writes Polish letters as their base letters in PDFs", () => {
    expect(new TextDecoder().decode(pdf("Księga znaku", ["Podpisała Łucja"]))).toContain("(Ksiega znaku)");
  });
});

describe("demo guard", () => {
  it("knows demo orgs and addresses", () => {
    expect(isDemoSlug("demo-1234abcd")).toBe(true);
    expect(isDemoSlug("team-1234abcd")).toBe(false);
    expect(isDemoSlug(null)).toBe(false);
    expect(isDemoAddress("anna@acme-ab12cd.example")).toBe(true);
    expect(isDemoAddress("anna@example.com")).toBe(false);
  });

  it("blocks risky writes, never reads", () => {
    expect(demoBlocked("POST", "/api/app/api-keys")).toBe(true);
    expect(demoBlocked("POST", "/api/app/mail/native/device")).toBe(true);
    expect(demoBlocked("POST", "/api/app/drive/items/abc/links")).toBe(true);
    expect(demoBlocked("DELETE", "/api/app/org")).toBe(true);
    // A verification mail to any address, or a filter that forwards: real mail out of the demo.
    expect(demoBlocked("POST", "/api/app/mail/forward-targets")).toBe(true);
    expect(demoBlocked("POST", "/api/app/mail/filters")).toBe(true);
    expect(demoBlocked("PATCH", "/api/app/mail/filters/abc")).toBe(true);
    expect(demoBlocked("GET", "/api/app/api-keys")).toBe(false);
    expect(demoBlocked("POST", "/api/app/chat/messages")).toBe(false);
    expect(demoBlocked("POST", "/api/app/organization-x")).toBe(false);
  });
});
