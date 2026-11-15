// One-off (2026-11 price change): moves every active subscription to its plan's current price and the new seat count.
// Old quantity = people − 1 (first person free, at least 1); new = seatsFor(people) (config/plans.ts). The daily seat
// reconcile corrects any org whose count drifted. Charged from the next renewal, prorated.
// Usage: node --env-file=.dev.vars scripts/paddle-migrate-prices.ts [--dry-run]   (run `pnpm paddle:sync` first)
import { PADDLE_PRODUCT, seatsFor } from "../src/config/plans.ts";

const dryRun = process.argv.includes("--dry-run");
const base = process.env.PADDLE_ENV === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

async function paddle<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as { data: T; error?: { detail: string } };
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error?.detail ?? res.status}`);
  return data.data;
}

type Tags = { product?: string; plan?: string; interval?: string } | null;
type Price = { id: string; custom_data: Tags };
type Subscription = { id: string; items: { quantity: number; price: Price }[] };

if (!process.env.PADDLE_API_KEY) throw new Error("Set PADDLE_API_KEY in .dev.vars");
const prices = await paddle<Price[]>("GET", "/prices?status=active&per_page=200");
const current = (tags: Tags) =>
  prices.find((p) => p.custom_data?.product === PADDLE_PRODUCT && p.custom_data?.plan === tags?.plan && p.custom_data?.interval === tags?.interval);

// shortcut: one page of 200 subscriptions, enough for the current customer count; paginate if it grows.
const subs = await paddle<Subscription[]>("GET", "/subscriptions?status=active,trialing,past_due&per_page=200");
for (const sub of subs) {
  const item = sub.items.find((i) => i.price.custom_data?.product === PADDLE_PRODUCT);
  if (!item) continue;
  const price = current(item.price.custom_data);
  if (!price) {
    console.log(`skip    ${sub.id}: no active price for ${JSON.stringify(item.price.custom_data)}`);
    continue;
  }
  const quantity = seatsFor(item.quantity + 1);
  if (price.id === item.price.id && quantity === item.quantity) {
    console.log(`ok      ${sub.id}`);
    continue;
  }
  console.log(`${dryRun ? "would " : ""}move ${sub.id}: ${item.price.id}×${item.quantity} → ${price.id}×${quantity}`);
  if (dryRun) continue;
  await paddle("PATCH", `/subscriptions/${sub.id}`, {
    items: sub.items.map((i) => (i === item ? { price_id: price.id, quantity } : { price_id: i.price.id, quantity: i.quantity })),
    proration_billing_mode: "prorated_next_billing_period",
  });
}
