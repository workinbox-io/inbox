// Creates one Paddle Product per plan with monthly + yearly Prices tagged `custom_data: { product, plan, interval }`.
// A Price whose amount changed is archived and replaced, so existing subscribers keep their price.
// Usage: pnpm paddle:sync   (reads PADDLE_API_KEY and PADDLE_ENV from .dev.vars)
import { CURRENCY, MIN_SEATS, PADDLE_PRODUCT, PLAN_LIST, priceYearly } from "../src/config/plans.ts";

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

type Product = { id: string; custom_data: Record<string, unknown> | null };
type Price = Product & { product_id: string; unit_price: { amount: string; currency_code: string } };

if (!process.env.PADDLE_API_KEY) throw new Error("Set PADDLE_API_KEY in .dev.vars");
const products = await paddle<Product[]>("GET", "/products?status=active&per_page=200");
const prices = await paddle<Price[]>("GET", "/prices?status=active&per_page=200");

for (const plan of PLAN_LIST) {
  const product =
    products.find((p) => p.custom_data?.product === PADDLE_PRODUCT && p.custom_data?.plan === plan.id) ??
    (await paddle<Product>("POST", "/products", { name: `Work Inbox ${plan.name}`, tax_category: "saas", custom_data: { product: PADDLE_PRODUCT, plan: plan.id } }));

  for (const [interval, amount] of [
    ["month", plan.priceMonthly],
    ["year", priceYearly(plan)],
  ] as const) {
    const label = `${plan.id}_${interval}ly`;
    const existing = prices.find((p) => p.product_id === product.id && p.custom_data?.product === PADDLE_PRODUCT && p.custom_data?.plan === plan.id && p.custom_data?.interval === interval);
    if (existing?.unit_price.amount === String(amount) && existing.unit_price.currency_code === CURRENCY) {
      console.log(`ok      ${label}`);
      continue;
    }
    await paddle("POST", "/prices", {
      product_id: product.id,
      description: `${plan.name}, per person, billed ${interval}ly`,
      unit_price: { amount: String(amount), currency_code: CURRENCY },
      billing_cycle: { interval, frequency: 1 },
      // Prices are quoted without VAT; Paddle adds it at checkout.
      tax_mode: "external",
      // Per person: the quantity is seatsFor(people) (config/plans.ts), never below MIN_SEATS.
      quantity: { minimum: MIN_SEATS, maximum: 10000 },
      custom_data: { product: PADDLE_PRODUCT, plan: plan.id, interval },
    });
    if (existing) await paddle("PATCH", `/prices/${existing.id}`, { status: "archived" });
    console.log(`created ${label} (${amount / 100} ${CURRENCY}/${interval})`);
  }
}
