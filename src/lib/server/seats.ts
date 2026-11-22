import { env } from "cloudflare:workers";
import { peopleOf, seatsFor } from "@/config/plans";
import { and, db, eq, inArray, mailboxAccess, mailboxes, member, subscriptions } from "@/db";
import { paddleFetch, planItem, type PaddleSubscription } from "./paddle";
import { enqueue } from "./queue";

/**
 * Per-person billing (config/plans.ts): a Paddle subscription's quantity is the org's mailbox users (`peopleOf`: personal
 * mailboxes plus members given any mailbox). Shared mailboxes and aliases are free, and so are the first FREE_PEOPLE, with at least MIN_SEATS billed (seatsFor). Whatever adds, removes or converts a personal mailbox calls `seatsChanged`; the
 * job (jobs/app.ts) and the daily reconcile (jobs/app-cron.ts) bring Paddle in line, so a missed update heals itself.
 */

/** The org's billed people: owners of its personal mailboxes and members given any of its mailboxes. */
export async function billedPeople(orgId: string) {
  const [personal, granted] = await Promise.all([
    db.select({ userId: mailboxes.userId }).from(mailboxes).where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.kind, "personal"))),
    db.select({ userId: mailboxAccess.userId }).from(mailboxAccess)
      .innerJoin(mailboxes, eq(mailboxes.id, mailboxAccess.mailboxId))
      .innerJoin(member, and(eq(member.userId, mailboxAccess.userId), eq(member.organizationId, orgId)))
      .where(eq(mailboxes.orgId, orgId)),
  ]);
  return peopleOf(personal.map((r) => r.userId), granted.map((r) => r.userId));
}

export async function peopleCount(orgId: string) {
  return (await billedPeople(orgId)).size;
}

export async function billableSeats(orgId: string) {
  return seatsFor(await peopleCount(orgId));
}

/** After a personal mailbox comes or goes. Self-hosted has no billing. */
export async function seatsChanged(orgId: string) {
  if (env.DEPLOY_MODE === "self") return;
  await enqueue("billing.seats", { orgId });
}

const BILLED = ["active", "trialing", "past_due"];

/**
 * Sets the plan item's quantity on the org's Paddle subscription to its seats. More people are charged from the next
 * renewal, prorated (Paddle's `prorated_next_billing_period`), so adding someone never fails on a card mid-period.
 * Idempotent: nothing happens when the quantity already matches.
 */
export async function syncSeats(orgId: string) {
  if (env.DEPLOY_MODE === "self" || !env.PADDLE_API_KEY) return;
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
  if (!sub?.paddleSubscriptionId || !BILLED.includes(sub.status)) return;
  const subscription = await paddleFetch<PaddleSubscription>("GET", `/subscriptions/${sub.paddleSubscriptionId}`);
  const item = planItem(subscription);
  if (!item) return;
  const seats = await billableSeats(orgId);
  if (item.quantity === seats) return;
  await paddleFetch("PATCH", `/subscriptions/${subscription.id}`, {
    items: subscription.items.map((i) => ({ price_id: i.price.id, quantity: i === item ? seats : i.quantity })),
    proration_billing_mode: "prorated_next_billing_period",
  });
  console.log(`[seats] org ${orgId}: ${item.quantity} → ${seats}`);
}

/** Daily: every billed subscription, in case an update was missed (people removed with the org's members, etc.). */
export async function reconcileSeats() {
  if (env.DEPLOY_MODE === "self" || !env.PADDLE_API_KEY) return;
  const subs = await db.select({ orgId: subscriptions.orgId }).from(subscriptions).where(inArray(subscriptions.status, BILLED));
  for (const s of subs) await enqueue("billing.seats", { orgId: s.orgId });
}
