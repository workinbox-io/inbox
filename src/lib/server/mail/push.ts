import { env } from "cloudflare:workers";
import { t } from "@/lib/i18n/panel";
import { userLocale, withLocale } from "@/lib/server/i18n";
import * as webpush from "web-push";
import { and, db, eq, member } from "@/db";
import { mailPushSubscriptions } from "@/db/schema/mail-integrations";
import { viewerMailboxes } from "./access";
import { toRole } from "../roles";
import { validPushEndpoint } from "@/lib/mail/push-policy";
export { validPushEndpoint } from "@/lib/mail/push-policy";
export const pushConfig = () => {
  const vars = env as unknown as Record<string, string | undefined>;
  return { publicKey: vars.VAPID_PUBLIC_KEY, privateKey: vars.VAPID_PRIVATE_KEY, subject: vars.VAPID_SUBJECT ?? `mailto:${env.EMAIL_FROM_ADDRESS}` };
};
type PushSubscription = typeof mailPushSubscriptions.$inferSelect;

/** Sends one payload to one device; drops subscriptions the push service says are gone. */
async function sendPush(subscription: PushSubscription, payload: Record<string, unknown>) {
  const config = pushConfig();
  if (!config.publicKey || !config.privateKey || !validPushEndpoint(subscription.endpoint)) return;
  const details = webpush.generateRequestDetails({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify(payload),
    { TTL: 60, vapidDetails: { publicKey: config.publicKey, privateKey: config.privateKey, subject: config.subject } });
  const response = await fetch(details.endpoint, { method: "POST", headers: details.headers as Record<string, string>, body: details.body ? new Uint8Array(details.body) : undefined, redirect: "manual" }); // Workers reject "error"
  if (response.status === 404 || response.status === 410) await db.delete(mailPushSubscriptions).where(eq(mailPushSubscriptions.id, subscription.id));
  else if (!response.ok) console.error("[mail-push] delivery failed", response.status);
}

/** Pushes to every device of one person in the org (the service worker rechecks access before showing anything). */
export async function pushToUser(orgId: string, userId: string, payload: Record<string, unknown>) {
  const config = pushConfig();
  if (!config.publicKey || !config.privateKey) return;
  const subscriptions = await db.select().from(mailPushSubscriptions).where(and(eq(mailPushSubscriptions.orgId, orgId), eq(mailPushSubscriptions.userId, userId)));
  for (const subscription of subscriptions) await sendPush(subscription, { userId, ...payload });
}

/** No body, sender or subject is sent to the device's push service. */
export async function notifyNewMail(orgId: string, mailboxId: string, threadId: string) {
  const config = pushConfig();
  if (!config.publicKey || !config.privateKey) return;
  const subscriptions = await db.select().from(mailPushSubscriptions).where(eq(mailPushSubscriptions.orgId, orgId));
  for (const subscription of subscriptions) {
    const [membership] = await db.select().from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, subscription.userId)));
    if (!membership) continue;
    const boxes = await viewerMailboxes({ orgId, userId: subscription.userId, role: toRole(membership.role) });
    if (!boxes.some(b => b.id === mailboxId && b.followed)) continue;
    // The title is the only text the device shows, in the person's own language.
    const title = withLocale(await userLocale({ id: subscription.userId }), () => t("New mail"));
    await sendPush(subscription, { userId: subscription.userId, threadId, title, url: "/app/mail?t=" + encodeURIComponent(threadId) });
  }
}
