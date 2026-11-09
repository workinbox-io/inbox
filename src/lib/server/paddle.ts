import { env } from "cloudflare:workers";
import { PLANS, type BillingInterval, type PlanId } from "@/config/plans";
import { db, eq, organization, subscriptions } from "@/db";
import { HttpError } from "./api";
import { billableSeats } from "./seats";
import type { PaddleEvent } from "./paddle-webhook";

export { verifyWebhook } from "./paddle-webhook";

/**
 * Paddle Billing over plain fetch (the Node SDK isn't needed on Workers). The API key needs
 * read/write on Customers, Transactions, Subscriptions, Prices and Customer portal sessions.
 */

interface PaddlePrice {
  id: string;
  product_id: string;
  custom_data: Record<string, unknown> | null;
  unit_price: { amount: string; currency_code: string };
  billing_cycle: { interval: string; frequency: number } | null;
}

export interface PaddleSubscription {
  id: string;
  status: string;
  customer_id: string;
  custom_data: Record<string, unknown> | null;
  items: { quantity: number; price: Pick<PaddlePrice, "id" | "custom_data"> }[];
  billing_cycle: { interval: string } | null;
  current_billing_period: { ends_at: string } | null;
  scheduled_change: unknown;
}

export class PaddleError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(`Paddle: ${message}`);
  }
}

const apiBase = (paddleEnv = env.PADDLE_ENV) =>
  paddleEnv === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

export async function paddleFetch<T>(method: string, path: string, body?: unknown, apiKey = env.PADDLE_API_KEY, paddleEnv?: string): Promise<T> {
  if (!apiKey) throw new HttpError(503, "Billing is not configured yet.");
  const res = await fetch(`${apiBase(paddleEnv)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; detail: string } } | null;
  if (!res.ok || !data) throw new PaddleError(res.status, data?.error?.code ?? "http_error", data?.error?.detail ?? `HTTP ${res.status}`);
  return data.data as T;
}

/** Prices carry `customData: { plan, interval }`, set by scripts/paddle-sync.ts. */
async function findPrice(plan: PlanId, interval: BillingInterval) {
  const prices = await paddleFetch<PaddlePrice[]>("GET", "/prices?status=active&recurring=true&per_page=200");
  return prices.find((p) => p.custom_data?.plan === plan && p.custom_data?.interval === interval) ?? null;
}

/** The plan item of a subscription; null when it isn't one of ours (a shared Paddle account). */
export function planItem<T extends Pick<PaddleSubscription, "items">>(subscription: T): T["items"][number] | null {
  return subscription.items.find((item) => {
    const plan = item.price.custom_data?.plan;
    return typeof plan === "string" && plan in PLANS;
  }) ?? null;
}

function planOf(subscription: Pick<PaddleSubscription, "items">): PlanId | null {
  return (planItem(subscription)?.price.custom_data?.plan as PlanId | undefined) ?? null;
}

/** Each org maps to one Paddle customer. Paddle keeps customers unique by e-mail, so an existing one is reused. */
async function ensureCustomer(orgId: string, email: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
  if (sub?.paddleCustomerId) return sub.paddleCustomerId;
  const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
  let customerId: string;
  try {
    customerId = (await paddleFetch<{ id: string }>("POST", "/customers", { email, name: org?.name ?? null })).id;
  } catch (e) {
    if (!(e instanceof PaddleError) || e.code !== "customer_already_exists") throw e;
    const [existing] = await paddleFetch<{ id: string }[]>("GET", `/customers?email=${encodeURIComponent(email)}`);
    if (!existing) throw e;
    customerId = existing.id;
  }
  await db.update(subscriptions).set({ paddleCustomerId: customerId }).where(eq(subscriptions.orgId, orgId));
  return customerId;
}

/**
 * Creates a draft transaction and returns its checkout URL. Paddle builds the URL from the default
 * payment link (set it to `<app>/pay` in Checkout settings), where Paddle.js opens the overlay.
 */
export async function createCheckout(orgId: string, email: string, plan: PlanId, interval: BillingInterval) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
  if (sub?.paddleSubscriptionId && sub.status !== "canceled") {
    throw new HttpError(409, "You already have a subscription. Use “Manage billing” to change plans.");
  }
  const price = await findPrice(plan, interval);
  if (!price) throw new HttpError(500, `Price for ${plan}/${interval} is missing in Paddle. Run pnpm paddle:sync.`);
  const transaction = await paddleFetch<{ checkout: { url: string | null } | null }>("POST", "/transactions", {
    // Per person: one unit for each personal mailbox (lib/server/seats.ts keeps it in step afterwards).
    items: [{ price_id: price.id, quantity: await billableSeats(orgId) }],
    customer_id: await ensureCustomer(orgId, email),
    // Copied onto the subscription, so webhooks can be matched to the org.
    custom_data: { orgId },
  });
  if (!transaction.checkout?.url) throw new HttpError(500, "Set a default payment link in Paddle checkout settings.");
  return transaction.checkout.url;
}

/** Paddle's customer portal: invoices, payment method, plan changes and cancellation. */
export async function createPortal(orgId: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
  if (!sub?.paddleCustomerId) throw new HttpError(409, "No billing account yet. Choose a plan first.");
  const session = await paddleFetch<{ urls: { general: { overview: string } } }>(
    "POST",
    `/customers/${sub.paddleCustomerId}/portal-sessions`,
    { subscription_ids: sub.paddleSubscriptionId ? [sub.paddleSubscriptionId] : [] },
  );
  return session.urls.general.overview;
}

/** Ends a subscription now, without a refund (used when the organization is deleted). */
export async function cancelSubscription(paddleSubscriptionId: string) {
  await paddleFetch("POST", `/subscriptions/${paddleSubscriptionId}/cancel`, { effective_from: "immediately" });
}

const intervalOf = (s: Pick<PaddleSubscription, "billing_cycle">): BillingInterval | null =>
  s.billing_cycle?.interval === "month" || s.billing_cycle?.interval === "year" ? s.billing_cycle.interval : null;

/** Mirrors a Paddle subscription into our table, keyed by the org in its custom data (or its customer). */
async function syncSubscription(subscription: PaddleSubscription) {
  const plan = planOf(subscription);
  const orgId = subscription.custom_data?.orgId;
  const where =
    typeof orgId === "string" ? eq(subscriptions.orgId, orgId) : eq(subscriptions.paddleCustomerId, subscription.customer_id);
  const updated = await db
    .update(subscriptions)
    .set({
      paddleCustomerId: subscription.customer_id,
      paddleSubscriptionId: subscription.id,
      status: subscription.status,
      ...(plan ? { plan } : {}),
      billingInterval: intervalOf(subscription),
      trialEndsAt: null,
      currentPeriodEnd: subscription.current_billing_period ? new Date(subscription.current_billing_period.ends_at) : null,
    })
    .where(where)
    .returning({ orgId: subscriptions.orgId });
  if (!updated.length) console.warn(`[paddle] no org for subscription ${subscription.id}`);
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export async function handlePaddleEvent(event: PaddleEvent) {
  if (!event.event_type.startsWith("subscription.")) return;
  // Re-fetch so out-of-order deliveries can't apply stale state.
  const subscription = await paddleFetch<PaddleSubscription>("GET", `/subscriptions/${event.data.id}`);
  // Paddle sends every event to every destination; ignore subscriptions of other products.
  if (!planOf(subscription)) return;
  await syncSubscription(subscription);
}
