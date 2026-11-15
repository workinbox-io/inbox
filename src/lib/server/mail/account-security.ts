import { and, db, eq, gt, mailAccountSecurity } from "@/db";
import { HttpError } from "@/lib/server/api";
import { randomBase64Url, sha256Hex } from "@/lib/server/crypto";
import { sendEmail } from "@/lib/server/email";
import { env } from "cloudflare:workers";

export async function accountSecurity(userId: string) {
  const [state] = await db.select().from(mailAccountSecurity).where(eq(mailAccountSecurity.userId, userId));
  return state;
}
export async function mustChangePassword(userId: string) {
  return !!(await accountSecurity(userId))?.mustChangePassword;
}
export async function clearPasswordRequirement(userId: string) {
  await db.update(mailAccountSecurity).set({ mustChangePassword: false }).where(eq(mailAccountSecurity.userId, userId));
}
export async function requestRecoveryEmail(userId: string, email: string) {
  const token = randomBase64Url(32);
  const values = { pendingRecoveryEmail: email, recoveryTokenHash: await sha256Hex(token), recoveryTokenExpiresAt: new Date(Date.now() + 3600_000) };
  await db.insert(mailAccountSecurity).values({ userId, ...values }).onConflictDoUpdate({ target: mailAccountSecurity.userId, set: values });
  const url = new URL("/app/recovery-email", env.PUBLIC_APP_URL);
  url.searchParams.set("token", token);
  await sendEmail({ to: email, subject: "Verify your recovery email", text: `Verify your recovery email: ${url.href}\nThis link expires in one hour.`, html: `<p>Verify your recovery email:</p><p><a href="${url.href}">Verify email</a></p><p>This link expires in one hour.</p>` });
}
export async function verifyRecoveryEmail(userId: string, token: string) {
  const state = await accountSecurity(userId);
  if (!state?.pendingRecoveryEmail) throw new HttpError(400, "Invalid or expired verification link");
  const [saved] = await db.update(mailAccountSecurity).set({
    recoveryEmail: state.pendingRecoveryEmail, recoveryVerifiedAt: new Date(), pendingRecoveryEmail: null, recoveryTokenHash: null, recoveryTokenExpiresAt: null,
  }).where(and(eq(mailAccountSecurity.userId, userId), eq(mailAccountSecurity.recoveryTokenHash, await sha256Hex(token)), gt(mailAccountSecurity.recoveryTokenExpiresAt, new Date()))).returning();
  if (!saved) throw new HttpError(400, "Invalid or expired verification link");
}
