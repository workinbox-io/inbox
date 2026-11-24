import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ sqlite: undefined as DatabaseSync | undefined }));
vi.mock("cloudflare:workers", () => ({ env: { PUBLIC_APP_URL: "https://workinbox.test" } }));
vi.mock("@/lib/server/api", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock("@/lib/server/mail/access", () => ({ viewerMailboxes: vi.fn() }));
vi.mock("@/lib/server/mail/admin", () => ({ updateOwnMailbox: vi.fn() }));
vi.mock("@/lib/server/mail/store", () => ({ listThreads: vi.fn(), getThread: vi.fn() }));
vi.mock("@/lib/server/mail/outbox", () => ({ cancelOutboxJob: vi.fn(), queueMailSend: vi.fn() }));
vi.mock("@/lib/server/uploads", () => ({ checkAttachments: vi.fn() }));
vi.mock("@/mcp/widgets/mail-threads.tsx?widget", () => ({ default: "" }));
vi.mock("@/mcp/widgets/mail-compose.tsx?widget", () => ({ default: "" }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/sqlite-proxy");
  const operators = await import("drizzle-orm");
  const schema = await import("@/db/schema");
  const { getTableConfig } = await import("drizzle-orm/sqlite-core");
  const sql = new DatabaseSync(":memory:");
  state.sqlite = sql;
  for (const table of [schema.mailDrafts, schema.mailThreads]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((c) => `"${c.name}" ${c.getSQLType()}`);
    if (table === schema.mailDrafts) columns.push("PRIMARY KEY(org_id,user_id,key)");
    sql.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  const db = drizzle(async (query, params, method) => {
    const stmt = sql.prepare(query);
    if (method === "run") { stmt.run(...params); return { rows: [] }; }
    stmt.setReturnArrays(true);
    return { rows: stmt.all(...params) as unknown as unknown[][] };
  });
  return { ...operators, ...schema, db };
});

import { deleteDraft, getDraft, listDrafts, saveDraft, updateDraft, type DraftOwner } from "@/lib/server/mail/drafts";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { updateOwnMailbox } from "@/lib/server/mail/admin";
import { mailModule } from "@/mcp/mail";
import { canUseTool, needsPlan, type McpContext } from "@/mcp/define";

const key = "d-11111111-1111-4111-8111-111111111111";
const owner: DraftOwner = { orgId: "org", userId: "anna", boxes: [{ id: "own", address: "anna@example.com", kind: "personal" }] as DraftOwner["boxes"] };
const payload = { mode: "new" as const, from: "anna@example.com", to: ["hello@example.net"], cc: ["cc@example.net"], subject: "Wholesale", text: "Old text", noSignature: true };
const ctx: McpContext = { orgId: owner.orgId, userId: owner.userId, role: "member", via: "Codex", audit: vi.fn() };
const tools = mailModule.tools;
const call = (name: string, input: unknown, context = ctx) => tools[name]!.run(tools[name]!.input!.parse(input), context);

beforeEach(async () => {
  state.sqlite!.exec("DELETE FROM mail_drafts; DELETE FROM mail_threads");
  vi.clearAllMocks();
  vi.mocked(viewerMailboxes).mockResolvedValue(owner.boxes);
  await saveDraft(owner, key, payload, { source: "ai", via: "Codex" });
});

it("updates signatures through the mailbox access list and audits successful writes", async () => {
  const tool = tools.mail_set_signature!;
  expect(canUseTool(tool, new Set(["read"]), "member")).toBe(false);
  await expect(call("mail_set_signature", { mailbox: "other@example.com", signature: "" })).rejects.toMatchObject({ status: 404 });
  await expect(call("mail_set_signature", { mailbox: "anna@example.com" })).rejects.toMatchObject({ status: 422 });
  await expect(call("mail_set_signature", { mailbox: "anna@example.com", signature: "" }, { ...ctx, userId: null, apiKeyId: "key" })).rejects.toMatchObject({ status: 403 });
  expect(updateOwnMailbox).not.toHaveBeenCalled();
  const saved = { ...owner.boxes[0]!, signature: "", signatureCard: { name: "Anna", role: "", phone: "" } };
  vi.mocked(updateOwnMailbox).mockResolvedValueOnce(saved);
  await expect(call("mail_set_signature", { mailbox: " ANNA@example.com ", signature: "" })).resolves.toEqual({
    mailbox: "anna@example.com", signature: "", signatureCard: saved.signatureCard,
  });
  expect(updateOwnMailbox).toHaveBeenCalledWith(["own"], "own", { signature: "", signatureCard: undefined });
  expect(ctx.audit).toHaveBeenCalledWith("mail_signature.update", { target: "anna@example.com" });
});

describe("saved draft access and changes against SQLite", () => {
  it("edits in place, preserves omitted fields and clears recipient lists explicitly", async () => {
    const before = await getDraft(owner, key);
    const saved = await updateDraft(owner, key, { text: "Their products only", cc: [] }, before.updatedAt);
    expect(saved.draft).toEqual({ ...payload, text: "Their products only", cc: [] });
    expect(saved.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(saved.source).toBe("ai");
    expect(saved.via).toBe("Codex");
    expect((await listDrafts(owner)).drafts).toHaveLength(1);
  });

  it("isolates users, organizations and revoked mailbox access", async () => {
    for (const denied of [{ ...owner, userId: "boss" }, { ...owner, orgId: "other" }, { ...owner, boxes: [] }]) {
      expect((await listDrafts(denied)).drafts).toEqual([]);
      await expect(getDraft(denied, key)).rejects.toMatchObject({ status: 404 });
      await expect(updateDraft(denied, key, { text: "leak" }, 0)).rejects.toMatchObject({ status: 409 });
    }
    await expect(getDraft({ ...owner, userId: "" }, key)).rejects.toMatchObject({ status: 403 });
    expect((await getDraft(owner, key)).draft).toEqual(payload);
  });

  it("rejects stale edits and deletions and never recreates a deleted draft", async () => {
    const before = await getDraft(owner, key);
    const after = await updateDraft(owner, key, { text: "New version" }, before.updatedAt);
    await expect(updateDraft(owner, key, { text: "Stale" }, before.updatedAt)).rejects.toMatchObject({ status: 409 });
    await expect(deleteDraft(owner, key, before.updatedAt)).rejects.toMatchObject({ status: 409 });
    expect((await getDraft(owner, key)).draft.text).toBe("New version");
    await deleteDraft(owner, key, after.updatedAt);
    await expect(updateDraft(owner, key, { text: "Recreate" }, after.updatedAt)).rejects.toMatchObject({ status: 409 });
    expect((await listDrafts(owner)).drafts).toEqual([]);
  });

  it("rejects ungranted senders and moving replies between mailboxes", async () => {
    const before = await getDraft(owner, key);
    await expect(updateDraft(owner, key, { from: "boss@example.com" }, before.updatedAt)).rejects.toMatchObject({ status: 422 });
    const thread = "22222222-2222-4222-8222-222222222222";
    state.sqlite!.prepare("INSERT INTO mail_threads(id,mailbox_id) VALUES (?,?)").run(thread, "own");
    await saveDraft(owner, thread, { ...payload, mode: "replyAll" });
    const reply = await getDraft(owner, thread);
    const expanded = { ...owner, boxes: [...owner.boxes, { ...owner.boxes[0]!, id: "shared", address: "support@example.com" }] };
    await expect(updateDraft(expanded, thread, { from: "support@example.com" }, reply.updatedAt)).rejects.toMatchObject({ status: 422 });
    expect((await updateDraft(owner, thread, { text: "Reply" }, reply.updatedAt)).draft.mode).toBe("replyAll");
  });

  it("protects app creates, edits and deletes using the same version contract", async () => {
    const current = await getDraft(owner, key);
    await expect(saveDraft(owner, key, payload, { expectedUpdatedAt: null })).rejects.toMatchObject({ status: 409 });
    const saved = await saveDraft(owner, key, { ...payload, text: "App edit" }, { expectedUpdatedAt: current.updatedAt });
    await expect(saveDraft(owner, key, payload, { expectedUpdatedAt: current.updatedAt })).rejects.toMatchObject({ status: 409 });
    await deleteDraft(owner, key, saved!.updatedAt);
    await expect(saveDraft(owner, key, payload, { expectedUpdatedAt: saved!.updatedAt })).rejects.toMatchObject({ status: 409 });
  });

  it("pages over 200 equal timestamps without gaps and filters before paging", async () => {
    for (let i = 0; i < 215; i++) await saveDraft(owner, `d-${i}`, { ...payload, subject: i % 2 ? "Match" : "Other" });
    state.sqlite!.exec("UPDATE mail_drafts SET updated_at=1234");
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listDrafts(owner, { limit: 50, cursor });
      keys.push(...page.drafts.map(d => d.key));
      expect(page.hasMore).toBe(!!page.nextCursor);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(keys).toHaveLength(216);
    expect(new Set(keys).size).toBe(216);
    const page = await listDrafts(owner, { q: "MATCH", limit: 200 });
    expect(page.drafts).toHaveLength(107);
    expect(page.hasMore).toBe(false);
    await expect(listDrafts(owner, { cursor: "bad" })).rejects.toMatchObject({ status: 422 });
  });

  it("keeps existing drafts and requires a version when deleting", async () => {
    expect(await saveDraft(owner, key, { ...payload, text: "Duplicate" }, { keepExisting: true })).toBeNull();
    const current = await getDraft(owner, key);
    await deleteDraft(owner, key, current.updatedAt);
    await expect(deleteDraft(owner, key, current.updatedAt)).rejects.toMatchObject({ status: 409 });
    expect((await listDrafts(owner)).drafts).toEqual([]);
  });
});

describe("MCP saved draft workflow", () => {
  it("lists, reads, edits and deletes the same draft with audit entries and a review URL", async () => {
    const listed = await call("mail_list_drafts", {}) as { drafts: { key: string; snippet: string }[] };
    expect(listed.drafts[0]).toMatchObject({ key, snippet: "Old text" });
    const read = await call("mail_get_draft", { key }) as { updatedAt: number };
    const saved = await call("mail_update_draft", { key, expectedUpdatedAt: read.updatedAt, text: "Only their products" }) as { updatedAt: number; url: string };
    expect(saved.url).toBe(`https://workinbox.test/app/mail?draft=${key}`);
    expect(ctx.audit).toHaveBeenCalledWith("mail_draft.update", { target: key });
    expect((await listDrafts(owner)).drafts).toHaveLength(1);
    expect(await call("mail_delete_draft", { key, expectedUpdatedAt: saved.updatedAt })).toEqual({ key, deleted: true });
    expect(ctx.audit).toHaveBeenCalledWith("mail_draft.delete", { target: key });
  });

  it("denies API keys and inaccessible drafts for every saved-draft tool", async () => {
    for (const name of ["mail_list_drafts", "mail_get_draft", "mail_update_draft", "mail_delete_draft"]) {
      const input = { key, expectedUpdatedAt: 0, text: "Changed" };
      await expect(call(name, input, { ...ctx, userId: null, apiKeyId: "key" })).rejects.toMatchObject({ status: 403 });
    }
    vi.mocked(viewerMailboxes).mockResolvedValue([]);
    for (const name of ["mail_get_draft", "mail_update_draft", "mail_delete_draft"]) {
      await expect(call(name, { key, expectedUpdatedAt: 0, text: "Changed" })).rejects.toMatchObject({ status: name === "mail_update_draft" ? 409 : 404 });
    }
    expect((await listDrafts(owner)).drafts).toHaveLength(1);
  });

  it("requires write scope and plan for mutations and validates edits", async () => {
    for (const name of ["mail_update_draft", "mail_delete_draft"]) {
      expect(canUseTool(tools[name]!, new Set(["read"]), "owner")).toBe(false);
      expect(needsPlan(tools[name]!)).toBe(true);
      expect(tools[name]!.destructive).toBe(true);
      expect(tools[name]!.input!.safeParse({ key }).success).toBe(false);
    }
    const schema = tools.mail_update_draft!.input!;
    expect(schema.safeParse({ key, expectedUpdatedAt: 0, to: ["invalid"] }).success).toBe(false);
    expect(schema.safeParse({ key: "../other", expectedUpdatedAt: 0, text: "Changed" }).success).toBe(false);
    await expect(call("mail_update_draft", { key, expectedUpdatedAt: 0 })).rejects.toMatchObject({ status: 422 });
  });
});
