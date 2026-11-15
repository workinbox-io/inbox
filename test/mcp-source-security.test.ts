import { DatabaseSync } from "node:sqlite";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sqlite: undefined as DatabaseSync | undefined, files: new Map<string, { size: number; httpMetadata?: { contentType: string } }>() }));
vi.mock("cloudflare:workers", () => ({ env: { FILES: { head: vi.fn(async (key: string) => state.files.get(key) ?? null) } } }));
vi.mock("@/lib/server/api", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock("@/lib/server/drive/access", () => ({ requireItem: vi.fn() }));
vi.mock("@/lib/server/calendar/access", () => ({ requireEvent: vi.fn(), requireCalendar: vi.fn(), personalCalendar: vi.fn(), visibleCalendars: vi.fn() }));
vi.mock("@/lib/server/calendar/invites", () => ({ notifyAttendees: vi.fn(), sendReply: vi.fn() }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/sqlite-proxy");
  const operators = await import("drizzle-orm"); const schema = await import("@/db/schema");
  const { getTableConfig } = await import("drizzle-orm/sqlite-core");
  const sqlite = new DatabaseSync(":memory:"); state.sqlite = sqlite;
  for (const table of [schema.mailMessages, schema.mailThreads, schema.mailLabels, schema.mailThreadLabels, schema.mailboxes, schema.calendarEvents, schema.calendarAttendees, schema.user, schema.member]) {
    const config = getTableConfig(table);
    sqlite.exec(`CREATE TABLE "${config.name}" (${config.columns.map(c => `"${c.name}" ${c.getSQLType()}`).join(",")})`);
  }
  sqlite.exec('CREATE VIRTUAL TABLE mail_messages_fts USING fts5(text, subject, from_email, from_name, "to", cc)');
  const db = drizzle(async (query, params, method) => {
    const stmt = sqlite.prepare(query);
    if (method === "run") { stmt.run(...params); return { rows: [] }; }
    stmt.setReturnArrays(true); return { rows: stmt.all(...params) as unknown as unknown[][] };
  });
  return { ...operators, ...schema, db };
});
import { listThreads } from "@/lib/server/mail/store";
import { checkDraftFiles, sourceFile } from "@/lib/server/mail/draft-files";
import { hasExternalParticipants, updateEvent, deleteEvent } from "@/lib/server/calendar/events";
import { requireEvent } from "@/lib/server/calendar/access";
import { notifyAttendees } from "@/lib/server/calendar/invites";
import { requireItem } from "@/lib/server/drive/access";
import type { DraftOwner } from "@/lib/server/mail/drafts";
const owner: DraftOwner = { orgId: "org", userId: "me", boxes: [{ id: "own" }] as DraftOwner["boxes"] };
const viewer = { orgId: "org", userId: "me", role: "member" as const };
const file = { url: "/api/files/attachments/org/abcdefghijklmnop/file.txt", filename: "file.txt", mediaType: "text/plain" };
beforeEach(() => {
  vi.clearAllMocks(); state.files.clear();
  state.sqlite!.exec('DELETE FROM mail_messages; DELETE FROM calendar_events; DELETE FROM calendar_attendees; DELETE FROM mailboxes; DELETE FROM "user"; DELETE FROM member;');
  state.sqlite!.prepare("INSERT INTO mail_messages(id,mailbox_id,files) VALUES ('message','own',?)").run(JSON.stringify([file]));
  state.files.set("attachments/org/abcdefghijklmnop/file.txt", { size: 8, httpMetadata: { contentType: "text/plain" } });
});
it("authorizes message sources through the caller's mailbox, checks availability and limits, preserves references", async () => {
  const source = { messageId: "message", attachmentIndex: 0 };
  expect(await sourceFile(owner, source)).toMatchObject({ key: "attachments/org/abcdefghijklmnop/file.txt" });
  const checked = await checkDraftFiles(owner, [{ ...file, source }]);
  expect(checked).toEqual([{ ...file, source }]);
  await expect(sourceFile({ ...owner, boxes: [{ id: "other" }] as DraftOwner["boxes"] }, source)).rejects.toMatchObject({ status: 404 });
  await expect(sourceFile(owner, { ...source, attachmentIndex: 1 })).rejects.toMatchObject({ status: 404 });
  await expect(checkDraftFiles(owner, Array(6).fill(file))).rejects.toMatchObject({ status: 422 });
  state.files.set("attachments/org/abcdefghijklmnop/file.txt", { size: 10 * 1024 * 1024 + 1 });
  await expect(checkDraftFiles(owner, [file])).rejects.toMatchObject({ status: 413 });
  state.files.clear(); await expect(checkDraftFiles(owner, [{ ...file, source }])).rejects.toMatchObject({ status: 422 });
});
it("rechecks revoked Drive access and deleted Drive sources on save/send", async () => {
  const source = { driveId: "drive-file" };
  vi.mocked(requireItem).mockRejectedValueOnce({ status: 404 });
  await expect(checkDraftFiles(owner, [{ ...file, source }])).rejects.toMatchObject({ status: 404 });
  vi.mocked(requireItem).mockResolvedValue({ item: { kind: "file", r2Key: "drive/org/file", name: "file.txt", mediaType: "text/plain" } } as never);
  await expect(checkDraftFiles(owner, [{ ...file, source }])).rejects.toMatchObject({ status: 422 });
  expect(requireItem).toHaveBeenLastCalledWith(viewer, source.driveId);
});
it("inspects organizers and attendees in exceptions and refuses mutations before any write or notification", async () => {
  state.sqlite!.exec(`INSERT INTO calendar_events(id,parent_id,organizer_email,title) VALUES ('master',NULL,'me@example.test','Original'),('exception','master','me@example.test','Exception');
    INSERT INTO mailboxes(id,org_id,kind,address,user_id) VALUES ('own','org','personal','me@example.test','me');
    INSERT INTO calendar_attendees(event_id,email) VALUES ('exception','outside@example.net');`);
  vi.mocked(requireEvent).mockResolvedValue({ event: { id: "exception", parentId: "master" }, role: "owner" } as never);
  expect(await hasExternalParticipants(viewer, "exception")).toBe(true);
  for (const scope of ["this", "following", "all"] as const) {
    await expect(updateEvent(viewer, "exception", { title: "Changed", scope, occurrence: 1000 }, true)).rejects.toMatchObject({ status: 409 });
    await expect(deleteEvent(viewer, "exception", { scope, occurrence: 1000 }, true)).rejects.toMatchObject({ status: 409 });
  }
  expect(state.sqlite!.prepare("SELECT title FROM calendar_events WHERE id='master'").get()?.title).toBe("Original");
  expect(notifyAttendees).not.toHaveBeenCalled();
  state.sqlite!.exec("DELETE FROM calendar_attendees; UPDATE calendar_events SET organizer_email='outside@example.net' WHERE id='exception'");
  expect(await hasExternalParticipants(viewer, "exception")).toBe(true);
  state.sqlite!.exec("UPDATE calendar_events SET organizer_email='me@example.test'");
  expect(await hasExternalParticipants(viewer, "exception")).toBe(false);
});

it("restricts explicit mail search folders while preserving the application's broad search", async () => {
  const sql = state.sqlite!;
  sql.exec("DELETE FROM mail_messages; DELETE FROM mail_threads; DELETE FROM mail_messages_fts;");
  for (const [id, direction, archivedAt, trashedAt, box] of [
    ["inbox", "in", null, null, "own"], ["sent", "out", null, null, "own"],
    ["archive", "in", 1000, null, "own"], ["trash", "in", null, 1000, "own"],
    ["private", "in", null, null, "someone-else"],
  ] as const) {
    sql.prepare("INSERT INTO mail_threads(id,mailbox_id,last_message_at,spam,archived_at,trashed_at) VALUES(?,?,2000,0,?,?)").run(id, box, archivedAt, trashedAt);
    const inserted = sql.prepare("INSERT INTO mail_messages(id,thread_id,mailbox_id,direction,text,files,created_at) VALUES(?,?,?,?,?,'[]',2000)").run(id, id, box, direction, "query");
    sql.prepare("INSERT INTO mail_messages_fts(rowid,text) VALUES (?, 'query')").run(inserted.lastInsertRowid);
  }
  const ids = async (folder: "inbox" | "sent" | "archived" | "trash", q: string, strictFolder = true) =>
    (await listThreads({ boxes: owner.boxes, folder, q, strictFolder })).threads.map(t => t.id).sort();
  expect(await ids("sent", "query")).toEqual(["sent"]);
  expect(await ids("archived", "query")).toEqual(["archive"]);
  expect(await ids("trash", "query")).toEqual(["trash"]);
  expect(await ids("inbox", "query", false)).toEqual(["archive", "inbox", "sent"]);
  expect(await ids("inbox", "")).toEqual(["inbox"]);
});
