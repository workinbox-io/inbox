/**
 * Plans, limits and paid features. Prices are synced to Paddle with `pnpm paddle:sync`, which tags
 * each Paddle price with `customData: { plan, interval }`; that's how webhooks map back to a plan.
 */
export type PlanId = "starter" | "pro" | "business";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price per person (a personal mailbox) in EUR cents. Yearly = 10× monthly (2 months free).
   *  Shared mailboxes and aliases cost nothing. The Paddle quantity is `seatsFor(people)`. */
  priceMonthly: number;
  /** Limits; null = unlimited. Add your own (they're checked with withinLimit). */
  members: number | null;
  /** Drive storage per person (pooled across the org) in GB, on the hosted service; self-hosted is unlimited. */
  driveGbPerPerson: number;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: { id: "starter", name: "Starter", priceMonthly: 100, members: null, driveGbPerPerson: 10 },
  pro: { id: "pro", name: "Pro", priceMonthly: 250, members: null, driveGbPerPerson: 30 },
  business: { id: "business", name: "Business", priceMonthly: 500, members: null, driveGbPerPerson: 100 },
};

export const PLAN_LIST = Object.values(PLANS);
const PLAN_ORDER: PlanId[] = ["starter", "pro", "business"];

export const CURRENCY = "EUR";
/** Tags this product's Paddle products and prices (`custom_data.product`), so a Paddle account shared with other
 *  products (Luxivo uses the same plan ids) never mixes their prices or subscriptions up. */
export const PADDLE_PRODUCT = "workinbox";
export const TRIAL_DAYS = 14;
/** Free tier: an org with this many people (personal mailboxes) or fewer uses mail without a plan, after the trial
 *  too. Shared mailboxes and aliases don't count; paid features (API, MCP, audit log) still need a plan. */
export const FREE_PEOPLE = 5;
/** Every plan charges for at least this many seats (Starter: €5 a month covers up to FREE_PEOPLE + MIN_SEATS people),
 *  so Paddle's per-transaction fee doesn't eat a one-euro charge. */
export const MIN_SEATS = 5;

/** Seats a plan charges for: people beyond the free ones, at least MIN_SEATS (also when a smaller org buys a plan
 *  for its paid features: API, MCP, audit log). The Paddle subscription's quantity. */
export const seatsFor = (people: number) => Math.max(MIN_SEATS, people - FREE_PEOPLE);
/** New organizations start a trial of this plan, without a card. */
export const TRIAL_PLAN: PlanId = "pro";
export const POPULAR_PLAN: PlanId = "pro";

/** Plan for a stored id, falling back to the cheapest one for ids that no longer exist. */
export const planById = (id: string | null | undefined): Plan => PLANS[id as PlanId] ?? PLANS.starter;

export const priceYearly = (plan: Plan) => plan.priceMonthly * 10;

/** 100 → "1", 250 → "2.50": a price in cents for text. */
export const amount = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0);

export type BillingInterval = "month" | "year";

/** Paid features that only some plans include: the cheapest plan with each one. */
const FEATURE_PLAN = {
  apiAccess: "pro",
  /** Changes through the MCP server (/mcp) from Claude, ChatGPT and other AI apps; reading is free. */
  mcpAccess: "pro",
  auditLog: "pro",
} as const satisfies Record<string, PlanId>;

export type Feature = keyof typeof FEATURE_PLAN;

export const FEATURE_LABELS: Record<Feature, string> = {
  apiAccess: "API access",
  mcpAccess: "Changes from AI apps",
  auditLog: "The audit log",
};

export function hasFeature(plan: Plan, feature: Feature) {
  return PLAN_ORDER.indexOf(plan.id) >= PLAN_ORDER.indexOf(FEATURE_PLAN[feature]);
}

/** "API access is available on the Pro and Business plans." */
export function featureUpsell(feature: Feature) {
  const plans = PLAN_ORDER.slice(PLAN_ORDER.indexOf(FEATURE_PLAN[feature])).map((id) => PLANS[id].name);
  const list = plans.length > 1 ? `${plans.slice(0, -1).join(", ")} and ${plans.at(-1)} plans` : `${plans[0]} plan`;
  return `${FEATURE_LABELS[feature]} is available on the ${list}.`;
}

export type LimitKind = "members";

/** True when adding `delta` to `used` stays within the plan limit. */
export function withinLimit(plan: Plan, kind: LimitKind, used: number, delta = 1) {
  const limit = plan[kind];
  return limit === null || used + delta <= limit;
}

export interface PlanFeature {
  label: string;
  /** Announced but not shipped yet; rendered with a "Soon" tag. */
  soon?: boolean;
}

/** Feature lists for the pricing page: what each plan adds on top of the one below. */
const EXTRAS: Record<PlanId, PlanFeature[]> = {
  starter: [
    { label: "Mail on your own domains" },
    { label: "Shared mailboxes, aliases and catch-all" },
    { label: "Spam filter and sender rules" },
    { label: "Shared notes with live editing" },
    { label: "Team address book" },
    { label: "Team calendars with invitations" },
    { label: `Shared drive, ${PLANS.starter.driveGbPerPerson} GB per person` },
    { label: "Two-factor authentication" },
  ],
  pro: [{ label: "Everything in Starter" }, { label: `${PLANS.pro.driveGbPerPerson} GB of drive per person` }, { label: "REST API" }, { label: "Claude & ChatGPT connector" }, { label: "Audit log" }],
  business: [{ label: "Everything in Pro" }, { label: `${PLANS.business.driveGbPerPerson} GB of drive per person` }, { label: "SSO", soon: true }, { label: "Priority support" }],
};

/** Pricing-page lines. Every plan is per person with unlimited people, so no limit lines. */
export function planFeatures(plan: Plan): PlanFeature[] {
  return EXTRAS[plan.id];
}

/** "€1 per person a month": the unit shown next to every price. */
export const PRICE_UNIT = "per person / month";
/** Shown with every price: the free people (FREE_PEOPLE). */
export const FREE_NOTE = `Free for up to ${FREE_PEOPLE} people`;
