import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: { PUBLIC_APP_URL: "https://workinbox.test" } }));
vi.mock("@/lib/server/email", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/server/api", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message) } } }));
vi.mock("@/db", async () => {
 const { DatabaseSync } = await import("node:sqlite");
 const { drizzle } = await import("drizzle-orm/sqlite-proxy");
 const operators = await import("drizzle-orm");
 const schema = await import("@/db/schema/mail-accounts");
 const sqlite = new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE mail_account_security(user_id TEXT PRIMARY KEY, must_change_password INTEGER NOT NULL DEFAULT 0, recovery_email TEXT, recovery_verified_at INTEGER, pending_recovery_email TEXT, recovery_token_hash TEXT, recovery_token_expires_at INTEGER)");
 const db = drizzle(async (sql, params, method) => {
  const stmt = sqlite.prepare(sql);
  if (method === "run") { stmt.run(...params); return { rows: [] } }
  stmt.setReturnArrays(true);
  return { rows: stmt.all(...params) as unknown as unknown[][] };
 });
 return { ...operators, ...schema, db, testSqlite: sqlite };
});

import { db, eq, mailAccountSecurity } from "@/db";
import { accountSecurity, clearPasswordRequirement, mustChangePassword, requestRecoveryEmail, verifyRecoveryEmail } from "@/lib/server/mail/account-security";
import { sendEmail } from "@/lib/server/email";

beforeEach(async () => { await db.delete(mailAccountSecurity); vi.mocked(sendEmail).mockClear() });
const emailedToken = () => {
 const message = vi.mocked(sendEmail).mock.calls.at(-1)![0];
 return new URL(message.text.match(/https:\/\/\S+/)![0]).searchParams.get("token")!;
};
describe("account security persistence", () => {
 it("keeps the recovery address inactive until its one-time token is verified", async () => {
  await requestRecoveryEmail("u", "private@example.net");
  const state = await accountSecurity("u");
  const token = emailedToken();
  expect(state?.recoveryEmail).toBeNull();
  expect(state?.recoveryTokenHash).not.toBe(token);
  await verifyRecoveryEmail("u", token);
  expect((await accountSecurity("u"))?.recoveryEmail).toBe("private@example.net");
  expect((await accountSecurity("u"))?.recoveryVerifiedAt).toBeInstanceOf(Date);
  await expect(verifyRecoveryEmail("u", token)).rejects.toThrow("Invalid or expired");
 });
 it("rejects expired and wrong-user tokens", async () => {
  await requestRecoveryEmail("u", "private@example.net");
  const token = emailedToken();
  await expect(verifyRecoveryEmail("other", token)).rejects.toThrow("Invalid or expired");
  await db.update(mailAccountSecurity).set({ recoveryTokenExpiresAt: new Date(1) }).where(eq(mailAccountSecurity.userId, "u"));
  await expect(verifyRecoveryEmail("u", token)).rejects.toThrow("Invalid or expired");
 });
 it("invalidates the previous token when a new address is requested", async () => {
  await requestRecoveryEmail("u", "first@example.net");
  const first = emailedToken();
  await requestRecoveryEmail("u", "second@example.net");
  await expect(verifyRecoveryEmail("u", first)).rejects.toThrow("Invalid or expired");
  await verifyRecoveryEmail("u", emailedToken());
  expect((await accountSecurity("u"))?.recoveryEmail).toBe("second@example.net");
 });
 it("requires a password change until the server clears the requirement", async () => {
  await db.insert(mailAccountSecurity).values({ userId: "u", mustChangePassword: true });
  expect(await mustChangePassword("u")).toBe(true);
  await clearPasswordRequirement("u");
  expect(await mustChangePassword("u")).toBe(false);
  expect(await mustChangePassword("unknown")).toBe(false);
 });
});
