import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ sqlite: undefined as DatabaseSync | undefined }));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/server/api", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message) } } }));
vi.mock("@/db", async () => {
 const { DatabaseSync } = await import("node:sqlite");
 const { drizzle } = await import("drizzle-orm/sqlite-proxy");
 const operators = await import("drizzle-orm");
 const schema = await import("@/db/schema");
 const sql = new DatabaseSync(":memory:");
 state.sqlite = sql;
 sql.exec(`
 PRAGMA foreign_keys=ON;
 CREATE TABLE api_keys(id TEXT PRIMARY KEY, org_id TEXT);
 CREATE TABLE mail_signature_brands(org_id TEXT PRIMARY KEY, company TEXT DEFAULT '', website TEXT DEFAULT '', logo_url TEXT DEFAULT '', color TEXT DEFAULT '', updated_at INTEGER);
 CREATE TABLE mailboxes(id TEXT PRIMARY KEY, org_id TEXT, domain_id TEXT, address TEXT, kind TEXT, user_id TEXT, display_name TEXT DEFAULT '', signature TEXT DEFAULT '', signature_card TEXT, uid_validity INTEGER DEFAULT 1, uid_next INTEGER DEFAULT 1, modseq INTEGER DEFAULT 1, created_at INTEGER DEFAULT 1, updated_at INTEGER DEFAULT 1, quota_bytes INTEGER, used_bytes INTEGER DEFAULT 0);
 CREATE TABLE mailbox_access(mailbox_id TEXT,user_id TEXT);
 CREATE TABLE mail_api_access(api_key_id TEXT REFERENCES api_keys(id) ON DELETE CASCADE, mailbox_id TEXT REFERENCES mailboxes(id) ON DELETE CASCADE, PRIMARY KEY(api_key_id,mailbox_id));
 `);
 const { getTableConfig } = await import("drizzle-orm/sqlite-core");
 for (const table of [schema.mailThreads, schema.mailMessages, schema.mailOutbox, schema.mailLabels, schema.mailThreadLabels]) {
   const config = getTableConfig(table);
   sql.exec('CREATE TABLE "' + config.name + '" (' + config.columns.map(c => '"' + c.name + '" ' + c.getSQLType()).join(",") + ')');
 }
 const db = drizzle(async (query, params, method) => {
  const stmt = sql.prepare(query);
  if (method === "run") { stmt.run(...params); return { rows: [] } }
  stmt.setReturnArrays(true);
  return { rows: stmt.all(...params) as unknown as unknown[][] };
 });
 return { ...operators, ...schema, db };
});
import { prepareMailSend, getThread, listThreads, unreadCounts, wakeDueSnoozed } from "@/lib/server/mail/store";
import { mailSendSchema } from "@/lib/validation-mail";
import { resolveApiKeyMailboxes, viewerMailboxes, resolveMailboxes } from "@/lib/server/mail/access";
beforeEach(() => {
 state.sqlite!.exec(`
 DELETE FROM mail_messages; DELETE FROM mail_threads; DELETE FROM mail_api_access; DELETE FROM mailbox_access; DELETE FROM mailboxes; DELETE FROM api_keys;
 INSERT INTO api_keys VALUES ('key','org'),('other-key','other-org');
 INSERT INTO mailboxes(id,org_id,address,kind,user_id) VALUES
 ('own','org','anna@example.com','personal','anna'),
 ('private','org','boss@example.com','personal','boss'),
 ('shared','org','support@example.com','shared',NULL),
 ('foreign','other-org','other@example.net','shared',NULL);
 `);
});
describe("mail API grants against SQLite", () => {
 it("gives an admin-role API key no implicit access without grants", async () => {
  expect(await viewerMailboxes({ orgId: "org", apiKeyId: "key", userId: "", role: "admin" })).toEqual([]);
 });
 it("returns only explicitly granted personal and shared mailboxes", async () => {
  state.sqlite!.exec("INSERT INTO mail_api_access VALUES ('key','own'),('key','shared')");
  const boxes = await resolveApiKeyMailboxes("org", "key");
  expect(boxes.map(b => b.id).sort()).toEqual(["own","shared"]);
  expect(boxes.some(b => b.id === "private")).toBe(false);
 });
 it("rejects cross-org grants even when malformed rows exist", async () => {
  state.sqlite!.exec("INSERT INTO mail_api_access VALUES ('key','foreign'),('other-key','own')");
  expect(await resolveApiKeyMailboxes("org", "key")).toEqual([]);
  expect(await resolveApiKeyMailboxes("org", "other-key")).toEqual([]);
  expect(await resolveApiKeyMailboxes("other-org", "key")).toEqual([]);
 });
 it("cuts access immediately after grant revocation or key deletion", async () => {
  state.sqlite!.exec("INSERT INTO mail_api_access VALUES ('key','shared')");
  expect(await resolveApiKeyMailboxes("org", "key")).toHaveLength(1);
  state.sqlite!.exec("DELETE FROM mail_api_access WHERE api_key_id='key'");
  expect(await resolveApiKeyMailboxes("org", "key")).toEqual([]);
  state.sqlite!.exec("INSERT INTO mail_api_access VALUES ('key','shared'); DELETE FROM api_keys WHERE id='key'");
  expect(await resolveApiKeyMailboxes("org", "key")).toEqual([]);
  expect(state.sqlite!.prepare("SELECT count(*) AS n FROM mail_api_access").get()).toEqual({ n: 0 });
 });
 it("returns 404 for a mailbox outside the explicit grants", async () => {
  state.sqlite!.exec("INSERT INTO mail_api_access VALUES ('key','shared')");
  await expect(resolveMailboxes({ orgId:"org", apiKeyId:"key", userId:"", role:"owner" }, ["boss@example.com"])).rejects.toThrow("Not found");
 });
 it("keeps session member access separate from API grants", async () => {
  state.sqlite!.exec("INSERT INTO mailbox_access VALUES ('shared','anna')");
  const member = await viewerMailboxes({ orgId: "org", userId: "anna", role: "member" });
  expect(member.map(b => b.id).sort()).toEqual(["own","shared"]);
  expect(await resolveApiKeyMailboxes("org", "key")).toEqual([]);
 });
});

describe("API mail identities and read behavior", () => {
 it("cannot send as a mailbox outside the key's grants", async () => {
  state.sqlite!.exec("INSERT INTO mail_api_access VALUES ('key','shared')");
  const boxes = await resolveApiKeyMailboxes("org","key");
  await expect(prepareMailSend({ mailbox: "boss@example.com", to: "a@example.net", text:"Hello", subject:"Test" }, boxes, "")).rejects.toThrow("Pick a mailbox");
 });
 it("derives sender and reply address from the granted mailbox, ignoring spoofed fields", async () => {
  state.sqlite!.exec("INSERT INTO mail_api_access VALUES ('key','shared')");
  const boxes = await resolveApiKeyMailboxes("org","key");
  const input = mailSendSchema.parse({ mailbox:"support@example.com", fromEmail:"boss@example.com", replyTo:"attacker@example.net", to:"a@example.net", subject:"Test", text:"Hello" });
  const { payload } = await prepareMailSend(input, boxes, "");
  expect(payload.email.fromEmail).toBe("support@example.com");
  expect(payload.email.replyTo).toBe("support@example.com");
 });
 it("does not mark public reads read or expose ungranted threads", async () => {
  state.sqlite!.exec(`INSERT INTO mail_api_access VALUES ('key','shared');
   INSERT INTO mail_threads(id,org_id,mailbox_id,subject,contact_email,unread,modseq,last_message_at) VALUES ('t','org','shared','Test','a@example.net',1,123,1),('private-t','org','private','Private','boss@example.com',1,124,1)`);
  const boxes = await resolveApiKeyMailboxes("org","key");
  const result = await getThread("t",boxes,{markRead:false});
  expect(result.thread.unread).toBe(true);
  expect(state.sqlite!.prepare("SELECT unread,modseq FROM mail_threads WHERE id='t'").get()).toEqual({unread:1,modseq:123});
  await expect(getThread("private-t",boxes,{markRead:false})).rejects.toThrow("Not found");
 });
 it("search and counts do not wake snoozes; the background task does", async () => {
  state.sqlite!.exec("INSERT INTO mail_api_access VALUES ('key','shared'); INSERT INTO mail_threads(id,org_id,mailbox_id,subject,contact_email,unread,spam,starred,modseq,last_message_at,snoozed_until) VALUES ('due','org','shared','Test','a@example.net',0,0,0,123,1,1)");
  const boxes = await resolveApiKeyMailboxes("org","key");
  await listThreads({boxes,folder:"snoozed"});
  await unreadCounts(boxes);
  expect(state.sqlite!.prepare("SELECT unread,snoozed_until FROM mail_threads WHERE id='due'").get()).toEqual({unread:0,snoozed_until:1});
  await wakeDueSnoozed();
  expect(state.sqlite!.prepare("SELECT unread,snoozed_until FROM mail_threads WHERE id='due'").get()).toEqual({unread:1,snoozed_until:null});
 });
 it("cannot forward messages from an ungranted mailbox", async () => {
  state.sqlite!.exec(`INSERT INTO mail_api_access VALUES ('key','shared');
   INSERT INTO mail_messages(id,org_id,mailbox_id,thread_id) VALUES ('secret','org','private','private-t')`);
  const boxes = await resolveApiKeyMailboxes("org","key");
  await expect(prepareMailSend({mailbox:"support@example.com",to:"a@example.net",text:"",forwardOf:"secret"},boxes,"")).rejects.toThrow("Not found");
 });
});
