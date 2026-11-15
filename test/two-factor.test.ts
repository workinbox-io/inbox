import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { readFileSync, readdirSync } from "node:fs";
import { symmetricDecrypt } from "better-auth/crypto";

const secret = "test-2fa-secret-at-least-thirty-two-characters";
vi.mock("cloudflare:workers", () => ({ env: {
  PUBLIC_APP_URL: "https://workinbox.test", BETTER_AUTH_SECRET: "test-2fa-secret-at-least-thirty-two-characters",
  AUTH_RATE_LIMIT: { limit: async () => ({ success: true }) },
} }));
vi.mock("@/lib/server/mail/account-security", () => ({ mustChangePassword: async () => false, clearPasswordRequirement: async () => {}, accountSecurity: async () => null }));
vi.mock("@/lib/server/org", () => ({
  OrgError: class extends Error {}, createPersonalOrg: vi.fn(), hasPendingInvitation: async () => true,
  memberLimit: async () => 100, prepareAccountDeletion: vi.fn(), seatUpsell: vi.fn(), seatsLeft: vi.fn(),
}));
vi.mock("@/lib/server/oauth", () => ({
  MCP_SCOPES: {}, ORG_CLAIM: "org", fetchClientMetadataResource: vi.fn(), mcpResource: () => "https://workinbox.test/mcp", oauthOrgSelection: vi.fn(),
}));
vi.mock("@/lib/server/analytics", () => ({ attributeSignup: vi.fn() }));
vi.mock("@/lib/server/queue", () => ({ enqueue: vi.fn() }));
vi.mock("@/lib/server/auth-audit", () => ({ auditTeamChange: vi.fn() }));
vi.mock("@/lib/server/email", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("@/db", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { drizzle } = await import("drizzle-orm/sqlite-proxy");
  const operators = await import("drizzle-orm");
  const schema = await import("@/db/schema");
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  }
  const execute = (sql: string, params: unknown[], method: string) => {
    const stmt = sqlite.prepare(sql);
    if (method === "run") { stmt.run(...params as never[]); return { rows: [] } }
    stmt.setReturnArrays(true);
    return { rows: stmt.all(...params as never[]) as unknown as unknown[][] };
  };
  const db = drizzle(async (sql, params, method) => execute(sql, params, method), async queries => {
    sqlite.exec("BEGIN");
    try { const results = queries.map(q => execute(q.sql, q.params, q.method)); sqlite.exec("COMMIT"); return results }
    catch (error) { sqlite.exec("ROLLBACK"); throw error }
  }, { schema });
  return { ...operators, ...schema, db, testSqlite: sqlite };
});

import { db, eq, session, twoFactor, user, verification } from "@/db";
import { getAuth } from "@/lib/server/auth";
import { confirmSecondFactor, finishFactorReplacement, reserveFactorAttempt, startFactorReplacement, totpUri } from "@/lib/server/two-factor";
import { sendEmail } from "@/lib/server/email";
import { POST as replaceAuthenticator } from "@/pages/api/app/account/two-factor";
import { createOTP } from "@better-auth/utils/otp";

const password = "a-long-test-password";
let cookie: string;
let userId: string;
async function request(path: string, body: object, extra: Record<string, string> = {}) {
  const response = await getAuth().handler(new Request(`https://workinbox.test/api/auth${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://workinbox.test", ...(cookie ? { cookie } : {}), ...extra }, body: JSON.stringify(body),
  }));
  const jar = new Map(cookie.split("; ").filter(Boolean).map(part => { const i = part.indexOf("="); return [part.slice(0, i), part.slice(i + 1)] }));
  for (const value of response.headers.getSetCookie()) {
    const part = value.split(";")[0];
    const i = part.indexOf("=");
    if (part.slice(i + 1)) jar.set(part.slice(0, i), part.slice(i + 1));
    else jar.delete(part.slice(0, i));
  }
  cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  return { response, data: await response.json() as { user: { id: string }; backupCodes: string[]; twoFactorRedirect?: boolean; message?: string } };
}
async function currentCode() {
  const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId));
  return (await getAuth().api.generateTOTP({ body: { secret: await symmetricDecrypt({ key: secret, data: row.secret }) } })).code;
}
async function enable() {
  const setup = await request("/two-factor/enable", { password });
  expect(setup.response.status).toBe(200);
  const code = await currentCode();
  expect((await request("/two-factor/verify-totp", { code })).response.status).toBe(200);
  return setup.data.backupCodes as string[];
}
const proof = (code: string, method = "totp") => ({ "x-work-inbox-2fa-code": code, "x-work-inbox-2fa-method": method });

beforeEach(async () => {
  // Foreign-key cascades clear account/session/factor rows between requests.
  await db.delete(user);
  await db.delete(verification);
  cookie = "";
  vi.mocked(sendEmail).mockClear();
  const signup = await request("/sign-up/email", { email: "person@example.net", password, name: "Person" });
  userId = signup.data.user.id;
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
  expect((await request("/sign-in/email", { email: "person@example.net", password })).response.status).toBe(200);
});

describe("two-factor account security", () => {
  it("only enables protection after confirmation and emails the account", async () => {
    expect((await request("/two-factor/enable", { password })).response.status).toBe(200);
    expect((await db.select().from(user).where(eq(user.id, userId)))[0].twoFactorEnabled).toBe(false);
    expect((await request("/two-factor/verify-totp", { code: await currentCode() })).response.status).toBe(200);
    expect((await db.select().from(user).where(eq(user.id, userId)))[0].twoFactorEnabled).toBe(true);
    expect(vi.mocked(sendEmail).mock.calls.some(([message]) => message.subject.includes("authentication enabled"))).toBe(true);
  });
  it("does not create an authenticated session until the second sign-in step", async () => {
    await enable();
    await request("/sign-out", {});
    cookie = "";
    const login = await request("/sign-in/email", { email: "person@example.net", password });
    expect(login.data.twoFactorRedirect).toBe(true);
    expect(await getAuth().api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });
  it("rejects management without a second factor, including direct HTTP requests", async () => {
    await enable();
    for (const path of ["/two-factor/disable", "/two-factor/generate-backup-codes", "/two-factor/get-totp-uri"]) {
      const result = await request(path, { password });
      expect(result.response.status).toBe(400);
      expect(result.data.message).toContain("authenticator code");
    }
    const wrong = (await currentCode()) === "000000" ? "000001" : "000000";
    expect((await request("/two-factor/disable", { password }, proof(wrong))).response.status).toBe(401);
    expect((await db.select().from(user).where(eq(user.id, userId)))[0].twoFactorEnabled).toBe(true);
  });
  it("consumes backup codes once and invalidates the previous set on regeneration", async () => {
    const codes = await enable();
    const wrongPassword = await request("/two-factor/generate-backup-codes", { password: "wrong-password" }, proof(codes[0], "backup"));
    expect(wrongPassword.response.status).toBe(400);
    const result = await request("/two-factor/generate-backup-codes", { password }, proof(codes[0], "backup"));
    expect(result.response.status).toBe(200);
    expect(result.data.backupCodes).toHaveLength(10);
    await expect(confirmSecondFactor(userId, new Headers({ cookie, ...proof(codes[1], "backup") }))).rejects.toThrow();
    await confirmSecondFactor(userId, new Headers({ cookie, ...proof(result.data.backupCodes[0], "backup") }));
    await expect(confirmSecondFactor(userId, new Headers({ cookie, ...proof(result.data.backupCodes[0], "backup") }))).rejects.toThrow();
  });
  it("locks repeated verification attempts across sessions and permits retry after expiry", async () => {
    await enable();
    for (let i = 0; i < 10; i++) await reserveFactorAttempt(userId);
    await expect(reserveFactorAttempt(userId)).rejects.toThrow("Wait 15 minutes");
    await db.update(twoFactor).set({ lockedUntil: new Date(Date.now() - 1) }).where(eq(twoFactor.userId, userId));
    await reserveFactorAttempt(userId);
    expect((await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)))[0].failedVerificationCount).toBe(1);
  });
  it("keeps the old authenticator until replacement is verified, then revokes other sessions and trust", async () => {
    await enable();
    const signedIn = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
    const activeId = signedIn!.session.id;
    const original = (await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)))[0];
    const setup = await startFactorReplacement(userId, "person@example.net", activeId);
    expect((await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)))[0].secret).toBe(original.secret);
    await db.insert(session).values({ id: "other", token: "other-token", userId, expiresAt: new Date(Date.now() + 60_000) });
    await db.insert(verification).values({ id: "trust", identifier: "trust-device-test", value: userId, expiresAt: new Date(Date.now() + 60_000) });
    const [pending] = await db.select().from(verification).where(eq(verification.id, setup.replacementId));
    expect(pending.value).not.toContain("previous");
    const next = JSON.parse(await symmetricDecrypt({ key: secret, data: pending.value }));
    const code = (await getAuth().api.generateTOTP({ body: { secret: next.secret } })).code;
    await expect(finishFactorReplacement(userId, "wrong-session", setup.replacementId, code)).rejects.toThrow("Setup expired");
    await finishFactorReplacement(userId, activeId, setup.replacementId, code);
    expect((await db.select().from(session).where(eq(session.userId, userId))).map(row => row.id)).toEqual([activeId]);
    expect(await db.select().from(verification).where(eq(verification.id, "trust"))).toHaveLength(0);
    const [changed] = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId));
    expect(changed.secret).not.toBe(original.secret);
    expect(changed.backupCodes).toBe(original.backupCodes);
    await expect(finishFactorReplacement(userId, activeId, setup.replacementId, code)).rejects.toThrow("Setup expired");
  });
  it("rejects expired replacement setup without changing the current secret", async () => {
    await enable();
    const setup = await startFactorReplacement(userId, "person@example.net", "session");
    const oldCode = await currentCode();
    await db.update(verification).set({ expiresAt: new Date(1) }).where(eq(verification.id, setup.replacementId));
    await expect(finishFactorReplacement(userId, "session", setup.replacementId, "123456")).rejects.toThrow("Setup expired");
    expect(await currentCode()).toBe(oldCode);
  });
  it("requires a second factor to disable protection and clears remembered devices", async () => {
    await enable();
    await db.insert(verification).values({ id: "trusted", identifier: "trust-device-old-browser", value: userId, expiresAt: new Date(Date.now() + 60_000) });
    expect((await request("/two-factor/disable", { password }, proof(await currentCode()))).response.status).toBe(200);
    expect((await db.select().from(user).where(eq(user.id, userId)))[0].twoFactorEnabled).toBe(false);
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, userId))).toHaveLength(0);
    expect(await db.select().from(verification).where(eq(verification.id, "trusted"))).toHaveLength(0);
    expect(vi.mocked(sendEmail).mock.calls.some(([message]) => message.subject.includes("authentication disabled"))).toBe(true);
  });
  it("keeps 2FA after a password reset and revokes existing sessions", async () => {
    await enable();
    await getAuth().api.requestPasswordReset({ body: { email: "person@example.net", redirectTo: "https://workinbox.test/reset-password" } });
    const token = (await db.select().from(verification)).find(row => row.identifier.startsWith("reset-password:"))!.identifier.slice("reset-password:".length);
    await getAuth().api.resetPassword({ body: { token, newPassword: "another-long-test-password" } });
    expect((await db.select().from(user).where(eq(user.id, userId)))[0].twoFactorEnabled).toBe(true);
    expect(await getAuth().api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    cookie = "";
    expect((await request("/sign-in/email", { email: "person@example.net", password: "another-long-test-password" })).data.twoFactorRedirect).toBe(true);
  });
  it("applies the account budget to direct signed-in verification requests", async () => {
    await enable();
    const wrong = (await currentCode()) === "000000" ? "000001" : "000000";
    for (let i = 0; i < 10; i++) expect((await request("/two-factor/verify-totp", { code: wrong })).response.status).toBe(401);
    expect((await request("/two-factor/verify-totp", { code: await currentCode() })).response.status).toBe(429);
  });
  it("requires both password and second factor at the replacement endpoint", async () => {
    await enable();
    const signedIn = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
    async function start(password: string, extra: Record<string, string> = {}) {
      return replaceAuthenticator({
        request: new Request("https://workinbox.test/api/app/account/two-factor", { method: "POST", headers: { cookie, "Content-Type": "application/json", ...extra }, body: JSON.stringify({ action: "start", password }) }),
        locals: { user: signedIn!.user, session: signedIn!.session, orgId: "test", role: "member", apiKeyId: null },
      } as unknown as APIContext);
    }
    expect((await start(password)).status).toBe(400);
    expect((await start("wrong-password", proof(await currentCode()))).status).toBe(400);
    const valid = await start(password, proof(await currentCode()));
    expect(valid.status).toBe(200);
    const setup = await valid.json() as { replacementId: string; totpURI: string };
    expect(setup.totpURI).toContain("otpauth://totp/");
    expect(setup.replacementId).toBeTruthy();
  });
  it("uses the same time tolerance as Better Auth for a replacement code", async () => {
    await enable();
    const signedIn = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
    const setup = await startFactorReplacement(userId, "person@example.net", signedIn!.session.id);
    const [pending] = await db.select().from(verification).where(eq(verification.id, setup.replacementId));
    const next = JSON.parse(await symmetricDecrypt({ key: secret, data: pending.value }));
    const previousWindow = await createOTP(next.secret).hotp(Math.floor(Date.now() / 30_000) - 1);
    await finishFactorReplacement(userId, signedIn!.session.id, setup.replacementId, previousWindow);
    expect((await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)))[0].secret).not.toBe(next.previous);
  });
  it("does not finish a pending replacement after its session is revoked", async () => {
    await enable();
    const signedIn = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
    const activeId = signedIn!.session.id;
    const setup = await startFactorReplacement(userId, "person@example.net", activeId);
    const [pending] = await db.select().from(verification).where(eq(verification.id, setup.replacementId));
    const next = JSON.parse(await symmetricDecrypt({ key: secret, data: pending.value }));
    await db.delete(session).where(eq(session.id, activeId));
    await expect(finishFactorReplacement(userId, activeId, setup.replacementId, await createOTP(next.secret).totp())).rejects.toThrow("Start setup again");
    expect((await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)))[0].secret).toBe(next.previous);
  });
  it("encodes the authenticator URI using RFC 4648 Base32", () => {
    const uri = new URL(totpUri("foobar", "person+test@example.net"));
    expect(uri.searchParams.get("secret")).toBe("MZXW6YTBOI");
    expect(uri.searchParams.get("issuer")).toBe("Work Inbox");
    expect(decodeURIComponent(uri.pathname)).toContain("person+test@example.net");
  });
});
