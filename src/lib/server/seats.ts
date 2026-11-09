import { env } from "cloudflare:workers";
import { FREE_PEOPLE } from "@/config/plans";
import { and, count, db, eq, inArray, mailboxes, subscriptions } from "@/db";
import { paddleFetch, planItem, type PaddleSubscription } from "./paddle";
import { enqueue } from "./queue";

/**
 * Per-person billing (config/plans.ts): a Paddle subscription's quantity is the org's personal mailboxes. Shared
 * mailboxes and aliases are free, and so is the first person (FREE_PEOPLE). Whatever adds, removes or converts a personal mailbox calls `seatsChanged`; the
 * job (jobs/app.ts) and the daily reconcile (jobs/app-cron.ts) bring Paddle in line, so a missed update heals itself.
 */

/** People on the org's domains: its personal mailboxes. */
export async function peopleCount(orgId: string) {
  const [row] = await db.select({ n: count() }).from(mailboxes).where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.kind, "personal")));
  return row?.n ?? 0;
}

/** Seats a plan charges for: people minus the free ones. At least one, since Paddle needs a quantity and a plan
 *  bought for one person pays for its paid features (API, MCP, audit log). */
export const seatsFor = (people: number) => Math.max(1, people - FREE_PEOPLE);

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
