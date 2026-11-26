import { describe,it,expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { matchesMailFilter } from "../src/lib/mail/filters";
import { filterInput } from "../src/lib/validation-mail-filters";
import { parseQuery } from "../src/lib/mail/rules";
function database(){
 const db=new DatabaseSync(":memory:");
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE mailboxes(id text PRIMARY KEY); INSERT INTO mailboxes VALUES ('box'),('other');
 CREATE TABLE mail_threads(id text PRIMARY KEY, mailbox_id text REFERENCES mailboxes(id),trashed_at integer);
 CREATE TABLE mail_messages(id text PRIMARY KEY,mailbox_id text NOT NULL REFERENCES mailboxes(id),thread_id text REFERENCES mail_threads(id) ON DELETE CASCADE,size integer,text text,html text,files text,created_at integer);
 INSERT INTO mail_threads VALUES('thread','box',NULL);
 INSERT INTO mail_messages VALUES('old','box','thread',10,'żółć','<b>abc</b>','[{"size":20}]',0);`);
 db.exec(readFileSync(new URL("../migrations/0008_storage_filters.sql",import.meta.url),"utf8"));return db;
}
const message={from:"Anna@Example.com",to:"team@work.test",subject:"Invoice Q4",text:"Please review",hasAttachment:true};
describe("mail filters",()=>{
 it("matches every condition literally and case insensitively",()=>{
  expect(matchesMailFilter([{field:"from",value:"ANNA@"},{field:"attachment",value:"true"}],message)).toBe(true);
  expect(matchesMailFilter([{field:"subject",value:"invoice"},{field:"attachment",value:"false"}],message)).toBe(false);
  expect(matchesMailFilter([{field:"subject",value:".*"}],message)).toBe(false);
  expect(matchesMailFilter([],message)).toBe(false);
 });
 it("requires conditions, actions, and supported attachment values",()=>{
  expect(filterInput.safeParse({mailboxId:crypto.randomUUID(),name:"Test",conditions:[],actions:{archive:true}}).success).toBe(false);
  expect(filterInput.safeParse({mailboxId:crypto.randomUUID(),name:"Test",conditions:[{field:"attachment",value:"yes"}],actions:{archive:true}}).success).toBe(false);
  expect(parseQuery('label:"Invoices 2026" from:anna').labels).toEqual(["invoices 2026"]);
 });
});
describe("mail storage ledger",()=>{
 it("backfills actual UTF-8 text and attachment bytes",()=>{const db=database();expect(db.prepare("SELECT used_bytes FROM mail_storage_usage WHERE mailbox_id='box'").get()?.used_bytes).toBe(10+8+10+20);db.close()});
 it("rejects quota overflow atomically, replays identical reservations without counting twice",()=>{
  const db=database();db.exec("UPDATE mail_storage_usage SET quota_bytes=100 WHERE mailbox_id='box'");
  const reserve=db.prepare("INSERT INTO mail_storage_reservations VALUES (?,'box',?,0) ON CONFLICT DO NOTHING");
  expect(reserve.run('new',40).changes).toBe(1);expect(reserve.run('new',40).changes).toBe(0);
  expect(()=>reserve.run('overflow',13)).toThrow("Mailbox storage quota exceeded");
  expect(db.prepare("SELECT used_bytes FROM mail_storage_usage WHERE mailbox_id='box'").get()?.used_bytes).toBe(88);
  expect(db.prepare("SELECT count(*) AS n FROM mail_storage_reservations WHERE id='overflow'").get()?.n).toBe(0);db.close();
 });
 it("keeps bytes in trash and releases on permanent deletion only",()=>{
  const db=database();db.exec("UPDATE mail_threads SET trashed_at=1 WHERE id='thread'");expect(db.prepare("SELECT used_bytes FROM mail_storage_usage WHERE mailbox_id='box'").get()?.used_bytes).toBe(48);
  db.exec("DELETE FROM mail_threads WHERE id='thread'");expect(db.prepare("SELECT used_bytes FROM mail_storage_usage WHERE mailbox_id='box'").get()?.used_bytes).toBe(0);db.close();
 });
 it("guards backfill accounting against repeat execution, retaining legacy mail over quota",()=>{
  const db=database();db.exec("UPDATE mail_storage_usage SET quota_bytes=1 WHERE mailbox_id='box'");
  const batch=()=>db.exec("BEGIN; UPDATE mail_storage_reservations SET bytes=bytes+20 WHERE id='old' AND EXISTS(SELECT 1 FROM mail_messages WHERE id='old' AND storage_version=0); UPDATE mail_messages SET storage_version=1 WHERE id='old' AND storage_version=0; COMMIT;");
  batch();batch();expect(db.prepare("SELECT used_bytes FROM mail_storage_usage WHERE mailbox_id='box'").get()?.used_bytes).toBe(68);
  expect(()=>db.exec("UPDATE mail_storage_reservations SET bytes=bytes+1 WHERE id='old'")).toThrow("Mailbox storage quota exceeded");db.close();
 });
 it("isolates label membership by foreign keys and deletes labels with their mailbox",()=>{const db=database();db.exec("INSERT INTO mail_labels VALUES('label','box','Invoices',0); INSERT INTO mail_thread_labels VALUES('thread','label')");expect(()=>db.exec("INSERT INTO mail_labels VALUES('dupe','box','invoices',0)")).toThrow();db.exec("DELETE FROM mail_labels WHERE id='label'");expect(db.prepare("SELECT count(*) AS n FROM mail_thread_labels").get()?.n).toBe(0);db.close()});
});
