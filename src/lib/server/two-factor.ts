import { createOTP } from "@better-auth/utils/otp";
import { env } from "cloudflare:workers";
import { APIError } from "better-auth/api";
import { generateRandomString, symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { and, db, eq, gt, like, lt, ne, or, session, sql, twoFactor, verification } from "@/db";
import { siteConfig } from "@/config/site";
import { emails } from "@/emails";
import { getAuth } from "./auth";
import { accountSecurity } from "./mail/account-security";
import { sendEmail } from "./email";

export const TWO_FACTOR_MANAGEMENT_PATHS = new Set([
  "/two-factor/disable", "/two-factor/generate-backup-codes", "/two-factor/get-totp-uri",
]);

/** Account-wide budget also covers signed-in verification, which Better Auth only limits per IP. */
export async function reserveFactorAttempt(userId: string) {
  const now = new Date();
  await db.update(twoFactor).set({ failedVerificationCount: 0, lockedUntil: null })
    .where(and(eq(twoFactor.userId, userId), lt(twoFactor.lockedUntil, now)));
  const [row] = await db.update(twoFactor).set({
    failedVerificationCount: sql`coalesce(${twoFactor.failedVerificationCount}, 0) + 1`,
    lockedUntil: sql`CASE WHEN coalesce(${twoFactor.failedVerificationCount}, 0) >= 9 THEN ${new Date(Date.now() + 15 * 60_000).getTime()} ELSE ${twoFactor.lockedUntil} END`,
  }).where(and(eq(twoFactor.userId, userId), eq(twoFactor.verified, true),
    or(sql`${twoFactor.lockedUntil} IS NULL`, lt(twoFactor.lockedUntil, now)),
    sql`coalesce(${twoFactor.failedVerificationCount}, 0) < 10`)).returning({ id: twoFactor.id });
  if (!row) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Wait 15 minutes and try again." });
}

export async function confirmSecondFactor(userId: string, headers: Headers): Promise<void> {
  const code = headers.get("x-work-inbox-2fa-code")?.replace(/\s/g, "") ?? "";
  const backup = headers.get("x-work-inbox-2fa-method") === "backup";
  if (!(backup ? /^[a-zA-Z0-9-]{5,64}$/ : /^\d{6}$/).test(code)) {
    throw new APIError("BAD_REQUEST", { message: "Enter an authenticator code or a backup code." });
  }
  const result = backup
    ? await getAuth().api.verifyBackupCode({ headers, body: { code } })
    : await getAuth().api.verifyTOTP({ headers, body: { code } });
  if (result.user.id !== userId) throw new APIError("UNAUTHORIZED", { message: "Sign in again to manage two-factor authentication." });
}

export async function resetFactorAttempts(userId: string) {
  await db.update(twoFactor).set({ failedVerificationCount: 0, lockedUntil: null }).where(eq(twoFactor.userId, userId));
}

export async function notifyFactorChange(user: { id: string; email: string }, change: "enabled" | "disabled" | "replaced" | "backup codes regenerated") {
  // A notification failure must not make a completed security change look unsuccessful.
  try {
    const recovery = await accountSecurity(user.id);
    const message = await emails.twoFactorChanged(change);
    await sendEmail({ to: user.email, ...message });
    if (recovery?.recoveryVerifiedAt && recovery.recoveryEmail && recovery.recoveryEmail !== user.email) {
      await sendEmail({ to: recovery.recoveryEmail, ...message });
    }
  } catch (error) { console.error("[auth] 2FA notification failed", error); }
}

export const totpUri = (secret: string, email: string) => createOTP(secret).url(siteConfig.name, email);

export async function startFactorReplacement(userId: string, email: string, sessionId: string) {
  const [current] = await db.select().from(twoFactor).where(and(eq(twoFactor.userId, userId), eq(twoFactor.verified, true)));
  if (!current) throw new APIError("BAD_REQUEST", { message: "Enable two-factor authentication first." });
  const secret = generateRandomString(32);
  const id = crypto.randomUUID();
  const value = await symmetricEncrypt({ key: env.BETTER_AUTH_SECRET, data: JSON.stringify({ secret, previous: current.secret }) });
  await db.insert(verification).values({ id, identifier: `2fa-replace:${userId}:${sessionId}`, value, expiresAt: new Date(Date.now() + 10 * 60_000) });
  return { replacementId: id, totpURI: totpUri(secret, email) };
}

export async function finishFactorReplacement(userId: string, sessionId: string, replacementId: string, code: string) {
  await reserveFactorAttempt(userId);
  const [pending] = await db.select().from(verification).where(and(eq(verification.id, replacementId),
    eq(verification.identifier, `2fa-replace:${userId}:${sessionId}`), gt(verification.expiresAt, new Date())));
  if (!pending) throw new APIError("BAD_REQUEST", { message: "Setup expired. Start changing your authenticator again." });
  const { secret, previous } = JSON.parse(await symmetricDecrypt({ key: env.BETTER_AUTH_SECRET, data: pending.value })) as { secret: string; previous: string };
  if (!await createOTP(secret).verify(code)) throw new APIError("BAD_REQUEST", { message: "That code didn't work. Enter the current code from your new authenticator." });
  const encrypted = await symmetricEncrypt({ key: env.BETTER_AUTH_SECRET, data: secret });
  const applied = sql`EXISTS (SELECT 1 FROM ${twoFactor} WHERE ${twoFactor.userId} = ${userId} AND ${twoFactor.secret} = ${encrypted})`;
  // Commit the replacement and revocations together; a reset or concurrent setup invalidates this one.
  const [changed] = await db.batch([
    db.update(twoFactor).set({ secret: encrypted, failedVerificationCount: 0, lockedUntil: null })
      .where(and(eq(twoFactor.userId, userId), eq(twoFactor.secret, previous), eq(twoFactor.verified, true),
        sql`EXISTS (SELECT 1 FROM ${verification} WHERE ${verification.id} = ${replacementId} AND ${verification.expiresAt} > ${Date.now()})`,
        sql`EXISTS (SELECT 1 FROM ${session} WHERE ${session.id} = ${sessionId} AND ${session.userId} = ${userId} AND ${session.expiresAt} > ${Date.now()})`,
      )).returning({ id: twoFactor.id }),
    db.delete(verification).where(and(applied, eq(verification.value, userId), like(verification.identifier, "trust-device-%"))),
    db.delete(verification).where(and(applied, like(verification.identifier, `2fa-replace:${userId}:%`))),
    db.delete(session).where(and(applied, eq(session.userId, userId), ne(session.id, sessionId))),
  ]);
  if (!changed.length) throw new APIError("BAD_REQUEST", { message: "Your authenticator changed. Start setup again." });
}

export async function clearFactorTrust(userId: string) {
  await db.delete(verification).where(or(
    and(eq(verification.value, userId), like(verification.identifier, "trust-device-%")),
    like(verification.identifier, `2fa-replace:${userId}:%`),
  ));
}
