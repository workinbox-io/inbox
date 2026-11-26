import { beforeEach, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { sha256Hex } from "@/lib/server/crypto";

vi.mock("@/lib/server/mail/account-security",()=>({mustChangePassword:async()=>false}));
vi.mock("cloudflare:workers", () => ({ env: { MAIL_BRIDGE_TOKEN: "test-bridge-token-with-32-characters" } }));
vi.mock("@/db", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { drizzle } = await import("drizzle-orm/sqlite-proxy");
  const operators = await import("drizzle-orm");
  const schema = await import("@/db/schema");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE member (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member')");
  const db = drizzle(async (sql, params) => {
    const statement = sqlite.prepare(sql); statement.setReturnArrays(true);
    return { rows: statement.all(...params as never[]) as unknown as unknown[][] };
  }, { schema });
  return { ...operators, member: schema.member, db, testSqlite: sqlite };
});
import { POST } from "@/pages/api/internal/mail-bridge/authorize";
// The real SQL query runs through SQLite; only the Workers D1 transport is substituted.
import * as database from "@/db";
const sqlite = (database as unknown as { testSqlite: import("node:sqlite").DatabaseSync }).testSqlite;
const request = (body: unknown, token = "test-bridge-token-with-32-characters") => POST({ request: new Request("https://workinbox.test/api/internal/mail-bridge/authorize", {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
}) } as APIContext);
beforeEach(() => { sqlite.exec("DELETE FROM member; INSERT INTO member(id,organization_id,user_id) VALUES ('membership','org','person')"); });
it("requires the bridge secret before reading the request", async () => {
  expect((await request({ owners: [] }, "invalid")).status).toBe(401);
});
it("rechecks actual membership and rejects mismatched actor scopes", async () => {
  const scope = await sha256Hex(JSON.stringify(["org", "person"]));
  const removedScope = await sha256Hex(JSON.stringify(["org", "removed"]));
  const body = { owners: [{ scope, orgId: "org", userId: "person" }, { scope: removedScope, orgId: "org", userId: "removed" }, { scope, orgId: "other", userId: "person" }] };
  const allowed = await request(body);
  expect(allowed.headers.get("cache-control")).toBe("no-store");
  expect(await allowed.json()).toEqual({ valid: [scope] });
  sqlite.exec("DELETE FROM member");
  expect(await (await request(body)).json()).toEqual({ valid: [] });
});
it("validates batch size and rejects extra identity fields", async () => {
  const owner = { scope: "a".repeat(64), orgId: "org", userId: "person" };
  expect((await request({ owners: [{ ...owner, role: "owner" }] })).status).toBe(422);
  expect((await request({ owners: Array.from({ length: 41 }, () => owner) })).status).toBe(422);
  expect((await request({ owners: [], padding: "x".repeat(32768) })).status).toBe(413);
});
