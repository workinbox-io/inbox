import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

function fixture() {
 const db = new DatabaseSync(":memory:");
 db.exec(`
 CREATE TABLE user(id TEXT PRIMARY KEY, name TEXT, email TEXT);
 CREATE TABLE invitation(id TEXT PRIMARY KEY, organization_id TEXT, email TEXT, status TEXT, expires_at INTEGER);
 CREATE TABLE mail_domains(id TEXT PRIMARY KEY, org_id TEXT, status TEXT);
 CREATE TABLE member(id TEXT PRIMARY KEY, organization_id TEXT, user_id TEXT);
 CREATE TABLE mailboxes(id TEXT PRIMARY KEY, org_id TEXT, domain_id TEXT, address TEXT UNIQUE, kind TEXT, user_id TEXT, display_name TEXT, signature TEXT, uid_validity INTEGER, uid_next INTEGER, modseq INTEGER, created_at INTEGER, updated_at INTEGER);
 CREATE TABLE mail_aliases(id TEXT PRIMARY KEY, address TEXT);
 CREATE TABLE mailbox_access(mailbox_id TEXT, user_id TEXT);
 INSERT INTO user VALUES ('u', 'Anna', 'anna@gmail.com');
 INSERT INTO mail_domains VALUES ('d','org','active');
 `);
 db.exec(readFileSync(new URL("../migrations/0006_accounts.sql", import.meta.url), "utf8"));
 return db;
}
function invite(db: DatabaseSync, id = "i", status = "pending", expires = Date.now() + 3600_000) {
 db.prepare("INSERT INTO invitation VALUES (?, 'org', 'anna@gmail.com', ?, ?, 'anna@example.com', 'd', 0)").run(id, status, expires);
}
describe("mail account lifecycle migration", () => {
 it("reserves addresses across invitations, mailboxes and aliases", () => {
  const db = fixture(); invite(db);
  expect(() => invite(db, "other")).toThrow("unavailable");
  expect(() => db.exec("INSERT INTO mailboxes(id,address) VALUES ('b','anna@example.com')")).toThrow("reserved");
  expect(() => db.exec("INSERT INTO mail_aliases VALUES ('a','anna@example.com')")).toThrow("reserved");
  db.close();
 });
 it("releases expired and cancelled reservations", () => {
  const db = fixture(); invite(db, "old", "pending", 1); invite(db, "new");
  db.exec("UPDATE invitation SET status='canceled' WHERE id='new'");
  expect(() => invite(db, "third")).not.toThrow();
  db.close();
 });
 it("atomically provisions an accepted invitation and preserves mail on removal", () => {
  const db = fixture(); invite(db);
  db.exec("UPDATE invitation SET status='accepted'; INSERT INTO member VALUES ('m','org','u')");
  expect(db.prepare("SELECT address, kind, user_id FROM mailboxes").get()).toEqual({ address: "anna@example.com", kind: "personal", user_id: "u" });
  db.exec("INSERT INTO mailbox_access SELECT id,'u' FROM mailboxes; DELETE FROM member WHERE id='m'");
  expect(db.prepare("SELECT kind,user_id,modseq FROM mailboxes").get()).toEqual({ kind: "shared", user_id: null, modseq: 2 });
  expect(db.prepare("SELECT count(*) AS n FROM mailbox_access").get()).toEqual({ n: 0 });
  db.close();
 });
 it("does not recreate an old accepted mailbox after the member rejoins", () => {
  const db = fixture(); invite(db);
  db.exec("UPDATE invitation SET status='accepted'; INSERT INTO member VALUES ('m','org','u'); DELETE FROM member; DELETE FROM mailboxes; INSERT INTO member VALUES ('m2','org','u')");
  expect(db.prepare("SELECT count(*) AS n FROM mailboxes").get()).toEqual({ n: 0 });
  db.close();
 });
 it("rolls back membership if the domain becomes inactive during acceptance", () => {
  const db = fixture(); invite(db);
  db.exec("UPDATE invitation SET status='accepted'; UPDATE mail_domains SET status='failing'");
  expect(() => db.exec("INSERT INTO member VALUES ('m','org','u')")).toThrow("no longer active");
  expect(db.prepare("SELECT count(*) AS n FROM member").get()).toEqual({ n: 0 });
  db.close();
 });
 it("preserves personal mailboxes when the user is deleted directly", () => {
  const db = fixture(); invite(db);
  db.exec("UPDATE invitation SET status='accepted'; INSERT INTO member VALUES ('m','org','u'); DELETE FROM user WHERE id='u'");
  expect(db.prepare("SELECT kind,user_id FROM mailboxes").get()).toEqual({ kind: "shared", user_id: null });
  db.close();
 });
 it("does not revoke shared access in other organizations", () => {
  const db = fixture();
  db.exec("INSERT INTO member VALUES ('m','org','u'); INSERT INTO mailboxes(id,org_id) VALUES ('other','other-org'); INSERT INTO mailbox_access VALUES ('other','u'); DELETE FROM member WHERE id='m'");
  expect(db.prepare("SELECT count(*) AS n FROM mailbox_access").get()).toEqual({ n: 1 });
  db.close();
 });
});
