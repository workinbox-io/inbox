import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { scheduledTime, quotaDay, uniqueRecipients, validateIdempotencyKey, quotaPredicates, quotaArgs, deliverySummary, sendingCaps, reputationPause, NEW_ORG_CAPS, HOSTED_CAPS, NO_CAPS, type SendingCaps } from "../src/lib/mail/outbox-policy";

const now = Date.UTC(2026, 10, 9, 23, 59, 55);
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE organization(id TEXT PRIMARY KEY); CREATE TABLE mailboxes(id TEXT PRIMARY KEY); INSERT INTO organization VALUES ('org'),('other'); INSERT INTO mailboxes VALUES ('box'),('box2'),('other-box');");
  db.exec(readFileSync(new URL("../migrations/0007_outbox.sql", import.meta.url), "utf8"));
  return db;
}
function insert(db: DatabaseSync, id: string, n: number, box = "box", org = "org", day = "2026-11-10", caps?: SendingCaps) {
  return db.prepare(`INSERT INTO mail_outbox(id,org_id,mailbox_id,idempotency_key,fingerprint,payload,send_at,quota_day,recipient_count,created_at,updated_at)
    SELECT ?,?,?,?,'digest','{}',?,?,?,?,? WHERE ${quotaPredicates} ON CONFLICT(org_id,idempotency_key) DO NOTHING`).run(id, org, box, id, now, day, n, now, now, ...quotaArgs(org, box, day, id, n, caps)).changes;
}

describe("sending reputation", () => {
  const day = 86_400_000;
  it("caps new unpaid hosted orgs for two weeks, then at the hosted ceiling; self-hosted is uncapped", () => {
    expect(sendingCaps({ hosted: true, orgCreatedAt: now - day, paid: false }, now)).toMatchObject(NEW_ORG_CAPS);
    expect(sendingCaps({ hosted: true, orgCreatedAt: now - day, paid: true }, now)).toMatchObject({ ...HOSTED_CAPS, newUntil: null });
    expect(sendingCaps({ hosted: true, orgCreatedAt: now - 15 * day, paid: false }, now)).toMatchObject(HOSTED_CAPS);
    expect(sendingCaps({ hosted: false, orgCreatedAt: now, paid: false }, now)).toBe(NO_CAPS);
  });
  it("the cap wins over a higher limit the org set itself", () => {
    const db = database();
    db.prepare("INSERT INTO mail_send_limits(org_id,scope_id,daily_recipients) VALUES ('org','org',100000)").run();
    const caps = { ...NEW_ORG_CAPS, newUntil: now };
    expect(insert(db, "a", 50, "box", "org", "2026-11-10", caps)).toBe(1);
    expect(insert(db, "b", 1, "box", "org", "2026-11-10", caps)).toBe(0);
    expect(insert(db, "c", 150, "box2", "org", "2026-11-10", caps)).toBe(0);
    expect(insert(db, "d", 50, "box2", "org", "2026-11-10", caps)).toBe(1);
  });
  it("pauses on many bounces or complaints, not on a handful", () => {
    expect(reputationPause({ sent: 40, bounced: 9, complained: 2 })).toBeNull();
    expect(reputationPause({ sent: 100, bounced: 10, complained: 0 })).toBe("bounces");
    expect(reputationPause({ sent: 1000, bounced: 30, complained: 0 })).toBeNull();
    expect(reputationPause({ sent: 1000, bounced: 0, complained: 3 })).toBe("complaints");
    expect(reputationPause({ sent: 5000, bounced: 0, complained: 3 })).toBeNull();
  });
});

describe("durable mail scheduling", () => {
  it("gives ten seconds to undo and reserves the delivery day's UTC quota", () => {
    expect(scheduledTime(undefined, now)).toBe(now + 10_000);
    expect(quotaDay(scheduledTime(undefined, now))).toBe("2026-11-10");
    expect(scheduledTime(now + 20_000, now)).toBe(now + 20_000);
    expect(() => scheduledTime(now - 1, now)).toThrow();
    expect(() => scheduledTime(now + 367 * 86_400_000, now)).toThrow();
    expect(() => scheduledTime(NaN, now)).toThrow();
  });
  it("counts distinct recipients and validates idempotency keys", () => {
    expect(uniqueRecipients("Anna@EXAMPLE.com", ["anna@example.com", "b@example.com"])).toEqual(["anna@example.com", "b@example.com"]);
    expect(validateIdempotencyKey("request-1")).toBe("request-1");
    expect(() => validateIdempotencyKey(" ")).toThrow();
    expect(() => validateIdempotencyKey("a".repeat(201))).toThrow();
  });
  it("atomically limits reservations, replays idempotently, and releases cancelled quota", () => {
    const db = database();
    expect(insert(db, "a", 499)).toBe(1);
    expect(insert(db, "b", 2)).toBe(0);
    expect(insert(db, "b", 1)).toBe(1);
    expect(insert(db, "b", 1)).toBe(0);
    db.prepare("UPDATE mail_outbox SET status='cancelled' WHERE id='a'").run();
    expect(insert(db, "c", 499)).toBe(1);
    expect(insert(db, "next-day", 500, "box", "org", "2026-11-11")).toBe(1);
    db.close();
  });
  it("enforces org limits across mailboxes and isolates organizations", () => {
    const db = database();
    db.prepare("INSERT INTO mail_send_limits VALUES ('org','org',3)").run();
    expect(insert(db, "a", 2)).toBe(1);
    expect(insert(db, "b", 2, "box2")).toBe(0);
    expect(insert(db, "c", 1, "box2")).toBe(1);
    expect(insert(db, "d", 500, "other-box", "other")).toBe(1);
    db.close();
  });
  it("cancellation cannot race a claimed send; uncertain jobs still consume quota", () => {
    const db = database();
    insert(db, "a", 500);
    db.prepare("UPDATE mail_outbox SET status='sending' WHERE id='a' AND status='pending'").run();
    expect(db.prepare("UPDATE mail_outbox SET status='cancelled' WHERE id='a' AND status='pending'").run().changes).toBe(0);
    db.prepare("UPDATE mail_outbox SET status='uncertain' WHERE id='a'").run();
    expect(insert(db, "b", 1)).toBe(0);
    db.prepare("UPDATE mail_outbox SET status='failed' WHERE id='a'").run();
    expect(insert(db, "b", 1)).toBe(1);
    db.close();
  });
});

describe("delivery receipts", () => {
  const event = (type: string, at: number, recipient = "a@example.com") => ({ type, recipient, occurredAt: new Date(at) });
  it("advances a deferred receipt to delivered even when events arrive out of order", () => {
    expect(deliverySummary([event("delivered", 2), event("deferred", 1)])).toBe("delivered");
  });
  it("keeps complaints and permanent bounces visible", () => {
    expect(deliverySummary([event("complained", 1), event("delivered", 2)])).toBe("complained");
    expect(deliverySummary([event("bounced", 1), event("delivered", 2)])).toBe("bounced");
  });
  it("aggregates recipient failures and repeated events deterministically", () => {
    const receipts = [event("delivered", 2), event("failed", 2, "b@example.com"), event("failed", 2, "b@example.com")];
    expect(deliverySummary(receipts)).toBe("failed");
    expect(deliverySummary(receipts.reverse())).toBe("failed");
  });
});
