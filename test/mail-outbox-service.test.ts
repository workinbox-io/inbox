import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sql: undefined as DatabaseSync | undefined, reservations: new Map<string, number>(), enqueue: vi.fn(), send: vi.fn(), persist: vi.fn(), authorized: true }));
vi.mock("cloudflare:workers", () => ({ env: {
  DB: { prepare: (query: string) => ({ bind: (...params: (string | number | null)[]) => ({
    first: async () => state.sql!.prepare(query).get(...params) ?? null,
    all: async () => ({ results: state.sql!.prepare(query).all(...params) }),
    run: async () => state.sql!.prepare(query).run(...params),
  }) }) },
  FILES: { delete: async () => {}, list: async () => ({ objects: [], truncated: false }) },
  // Self-hosted: no platform caps; caps and the reputation pause are covered in mail-outbox.test.ts.
  DEPLOY_MODE: "self",
} }));
vi.mock("@/lib/server/api", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message) } } }));
// Plan gating (hosted) is org.ts's job, covered elsewhere; the outbox only has to call it.
vi.mock("@/lib/server/org", () => ({ requireMailPlan: async () => {}, getSubscription: async () => null }));
vi.mock("@/lib/server/demo/guard", () => ({ refuseInDemo: async () => {} }));
vi.mock("@/lib/server/queue", () => ({ enqueue: (...args: unknown[]) => state.enqueue(...args) }));
vi.mock("@/lib/server/email", () => ({ sendNow: (...args: unknown[]) => state.send(...args) }));
vi.mock("@/lib/server/mail/storage", () => ({
  reserveStorage: async (_box: string, bytes: number, id: string) => { state.reservations.set(id, bytes) },
  releaseStorageReservation: async (id: string) => { state.reservations.delete(id) },
  storeHtml: async (_org: string, _box: string, _id: string, html: string) => ({ html, htmlKey: null }),
}));
vi.mock("@/lib/server/mail/access", () => ({
  viewerMailboxes: async () => [], resolveApiKeyMailboxes: async () => state.authorized ? [{ id: "box" }] : [],
}));
vi.mock("@/lib/server/uploads", () => ({ checkAttachments: async () => [] }));
vi.mock("@/lib/server/mail/store", () => ({
  prepareMailSend: async (input: { mailbox?: string; to: string; cc?: string[]; text: string; subject?: string }, boxes: { id: string; orgId: string; address: string }[]) => ({
    mailbox: boxes[0], payload: { email: { to: input.to, cc: input.cc ?? [], subject: input.subject ?? "Test", text: input.text, html: "<p>Test</p>", fromEmail: boxes[0].address }, files: [] },
  }),
  persistOutboxMail: (...args: unknown[]) => state.persist(...args),
}));
vi.mock("@/db", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { readFileSync } = await import("node:fs");
  const { drizzle } = await import("drizzle-orm/sqlite-proxy");
  const ops = await import("drizzle-orm");
  const schema = await import("@/db/schema");
  const sql = new DatabaseSync(":memory:"); state.sql = sql;
  sql.exec("CREATE TABLE organization(id TEXT PRIMARY KEY); CREATE TABLE mailboxes(id TEXT PRIMARY KEY,org_id TEXT,domain_id TEXT,address TEXT,kind TEXT,user_id TEXT,display_name TEXT,signature TEXT,signature_card TEXT,uid_validity INTEGER,uid_next INTEGER,modseq INTEGER,created_at INTEGER,updated_at INTEGER); CREATE TABLE mail_threads(id TEXT,mailbox_id TEXT);");
  sql.exec(readFileSync(new URL("../migrations/0007_outbox.sql", import.meta.url), "utf8"));
  const db = drizzle(async (query, params, method) => {
    const stmt = sql.prepare(query);
    if (method === "run") { stmt.run(...params); return { rows: [] } }
    stmt.setReturnArrays(true); return { rows: stmt.all(...params) as unknown as unknown[][] };
  });
  return { ...ops, ...schema, db };
});
import { cancelOutboxJob, deliverOutboxJob, getOutboxJob, queueMailSend, rescheduleOutboxJob } from "../src/lib/server/mail/outbox";
import type { Mailbox } from "../src/lib/server/mail/access";
const boxes = [{ id: "box", orgId: "org", address: "anna@example.com", kind: "shared" }] as Mailbox[];
const input = { mailbox: "anna@example.com", to: "b@example.net", text: "hello", subject: "Test" };
const options = { apiKeyId: "key", idempotencyKey: "request-1" };
beforeEach(() => {
  state.sql!.exec("DELETE FROM mail_outbox; DELETE FROM mail_send_limits; DELETE FROM mail_suppressions; DELETE FROM mailboxes; DELETE FROM organization; INSERT INTO organization VALUES ('org'); INSERT INTO mailboxes VALUES ('box','org','domain','anna@example.com','shared',NULL,'Anna','',NULL,1,1,1,1,1);");
  state.reservations.clear(); state.enqueue.mockReset(); state.send.mockReset(); state.persist.mockReset(); state.authorized = true;
  state.enqueue.mockResolvedValue(undefined);
  state.send.mockResolvedValue("provider-1"); state.persist.mockImplementation(async (_box,_payload,_provider,messageId,threadId)=>({message:{id:messageId},threadId}));
});
describe("durable outbox service", () => {
  it("accepts a durable job even when publishing to the queue fails", async () => {
    state.enqueue.mockRejectedValue(new Error("queue unavailable"));
    const job = await queueMailSend(input, boxes, "Anna", options);
    expect(job.status).toBe("pending"); expect(state.send).not.toHaveBeenCalled();
    expect((await getOutboxJob(job.id, boxes)).id).toBe(job.id);
    expect(state.reservations.size).toBe(1);
  });
  it("replays a request once and rejects a changed payload with the same key", async () => {
    const first = await queueMailSend(input, boxes, "Anna", options);
    const second = await queueMailSend(input, boxes, "Anna", options);
    expect(second.id).toBe(first.id); expect(state.reservations.size).toBe(1);
    await expect(queueMailSend({ ...input, text: "changed" }, boxes, "Anna", options)).rejects.toThrow("Idempotency key");
  });
  it("cancels before dispatch, releases storage, and never delivers cancelled mail", async () => {
    const job = await queueMailSend(input, boxes, "Anna", options);
    await cancelOutboxJob(job.id, boxes);
    expect(state.reservations.size).toBe(0);
    await deliverOutboxJob(job.id); expect(state.send).not.toHaveBeenCalled();
    await expect(getOutboxJob(job.id, [])).rejects.toThrow("Not found");
  });
  it("claims a due job once, and duplicate queue deliveries cannot resend", async () => {
    const job = await queueMailSend(input, boxes, "Anna", options);
    state.sql!.prepare("UPDATE mail_outbox SET send_at=? WHERE id=?").run(Date.now() - 1, job.id);
    await deliverOutboxJob(job.id); await deliverOutboxJob(job.id);
    expect(state.send).toHaveBeenCalledTimes(1); expect(state.persist).toHaveBeenCalledTimes(1);
    expect((await getOutboxJob(job.id, boxes)).status).toBe("sent");
    await expect(cancelOutboxJob(job.id, boxes)).rejects.toThrow("already started");
  });
  it("does not retry an ambiguous provider exception", async () => {
    const job = await queueMailSend(input, boxes, "Anna", options);
    state.sql!.prepare("UPDATE mail_outbox SET send_at=? WHERE id=?").run(Date.now() - 1, job.id);
    state.send.mockRejectedValue(new Error("network interrupted"));
    await deliverOutboxJob(job.id); await deliverOutboxJob(job.id);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect((await getOutboxJob(job.id, boxes)).status).toBe("uncertain");
    expect(state.reservations.size).toBe(1);
  });
  it("records provider acceptance before persistence and never repeats a send after persistence fails", async () => {
    const job = await queueMailSend(input, boxes, "Anna", options);
    state.sql!.prepare("UPDATE mail_outbox SET send_at=? WHERE id=?").run(Date.now() - 1, job.id);
    state.persist.mockRejectedValue(new Error("database interrupted"));
    await deliverOutboxJob(job.id); await deliverOutboxJob(job.id);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect((await getOutboxJob(job.id, boxes)).status).toBe("uncertain");
    expect(state.sql!.prepare("SELECT provider_id FROM mail_outbox WHERE id=?").get(job.id)?.provider_id).toBe("provider-1");
  });
  it("rechecks revoked API mailbox access before sending", async () => {
    const job = await queueMailSend(input, boxes, "Anna", options);
    state.sql!.prepare("UPDATE mail_outbox SET send_at=? WHERE id=?").run(Date.now() - 1, job.id);
    state.authorized = false; await deliverOutboxJob(job.id);
    expect(state.send).not.toHaveBeenCalled(); expect((await getOutboxJob(job.id, boxes)).status).toBe("failed");
    expect(state.reservations.size).toBe(0);
  });
  it("reschedules pending jobs and keeps them pending when an old queue delivery arrives", async () => {
    const job = await queueMailSend(input, boxes, "Anna", options);
    await rescheduleOutboxJob(job.id, Date.now() + 86_400_000, boxes);
    await deliverOutboxJob(job.id); expect(state.send).not.toHaveBeenCalled();
    expect((await getOutboxJob(job.id, boxes)).status).toBe("pending");
  });
});
