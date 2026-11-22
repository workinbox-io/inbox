import { z } from "zod";
import { env } from "cloudflare:workers";
import { account, and, db, eq, mailAccountSecurity, mailDomains, member } from "@/db";
import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { getAuth } from "@/lib/server/auth";
import { accountSecurity, requestRecoveryEmail, verifyRecoveryEmail } from "@/lib/server/mail/account-security";

const input = z.discriminatedUnion("action", [
 z.object({ action: z.literal("set"), email: z.string().email().max(254).transform(v => v.trim().toLowerCase()), password: z.string().min(1).max(256) }),
 z.object({ action: z.literal("remove"), password: z.string().min(1).max(256) }),
 z.object({ action: z.literal("verify"), token: z.string().min(32).max(128) }),
]);
export const GET = handler(async ({ locals }) => {
 const state = await accountSecurity(locals.user!.id);
 return json({ email: state?.recoveryEmail ?? null, verified: !!state?.recoveryVerifiedAt, pending: state?.pendingRecoveryEmail ?? null });
});
export const POST = handler(async ({ request, locals }) => {
 const { success } = await env.AUTH_RATE_LIMIT.limit({ key: "recovery:" + locals.user!.id });
 if (!success) throw new HttpError(429, "Too many attempts. Wait a minute and try again.");
 const data = await parseBody(request, input);
 const userId = locals.user!.id;
 if (data.action === "verify") {
   await verifyRecoveryEmail(userId, data.token);
   return json({ verified: true });
 }
 const [credential] = await db.select({ password: account.password }).from(account).where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
 const context = await getAuth().$context;
 if (!credential?.password || !await context.password.verify({ hash: credential.password, password: data.password })) throw new HttpError(403, "Incorrect current password");
 if (data.action === "remove") {
   await db.update(mailAccountSecurity).set({ recoveryEmail: null, recoveryVerifiedAt: null, pendingRecoveryEmail: null, recoveryTokenHash: null, recoveryTokenExpiresAt: null }).where(eq(mailAccountSecurity.userId, userId));
 } else {
   const domain = data.email.split("@")[1];
   const [workDomain] = await db.select({ id: mailDomains.id }).from(mailDomains).innerJoin(member, eq(member.organizationId, mailDomains.orgId)).where(and(eq(member.userId, userId), eq(mailDomains.domain, domain))).limit(1);
   if (data.email === locals.user!.email.toLowerCase() || workDomain) throw new HttpError(422, "Use a private address outside your organization's mail domains");
   await requestRecoveryEmail(userId, data.email);
 }
 return json({ ok: true });
});
