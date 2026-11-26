import { planById } from "@/config/plans";
import { and, db, eq, gte, inArray, isNull, lt, member, subscriptions, user } from "@/db";
import { emails, type RenderedEmail } from "@/emails";
import { sendEmail } from "./email";
import { userLocale, withLocale } from "./i18n";

/** Whether the org may use the product: a running trial, or an active (or past-due, while Paddle retries) subscription. */
export function subscriptionUsable(sub: Pick<typeof subscriptions.$inferSelect, "status" | "trialEndsAt">, now = new Date()) {
  if (sub.status === "trialing") return !sub.trialEndsAt || sub.trialEndsAt > now;
  return sub.status === "active" || sub.status === "past_due";
}

/** E-mails the owners and admins of an org; `mail` renders per admin, in their own language. */
export async function emailOrgAdmins(orgId: string, mail: () => Promise<RenderedEmail>) {
  const admins = await db
    .select({ id: user.id, email: user.email })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.organizationId, orgId), inArray(member.role, ["owner", "admin"])));
  for (const a of admins) await sendEmail({ to: a.email, ...(await withLocale(await userLocale({ id: a.id }), mail)) });
}

/** Daily: tells owners and admins three days before their trial ends, once. */
export async function sendTrialReminders(now = new Date()) {
  const due = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "trialing"),
        isNull(subscriptions.trialReminderSentAt),
        gte(subscriptions.trialEndsAt, now),
        lt(subscriptions.trialEndsAt, new Date(now.getTime() + 3 * 86_400_000)),
      ),
    );
  for (const sub of due) {
    // Mark first so a failing send can't cause repeated mails every run.
    await db.update(subscriptions).set({ trialReminderSentAt: now }).where(eq(subscriptions.orgId, sub.orgId));
    await emailOrgAdmins(sub.orgId, () => emails.trialEnding({ endsAt: sub.trialEndsAt!, planName: planById(sub.plan).name }));
  }
}
