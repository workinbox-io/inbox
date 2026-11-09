/**
 * Plans, limits and paid features. Prices are synced to Paddle with `pnpm paddle:sync`, which tags
 * each Paddle price with `customData: { plan, interval }`; that's how webhooks map back to a plan.
 */
export type PlanId = "starter" | "pro" | "business";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price per person (a personal mailbox) in EUR cents. Yearly = 10× monthly (2 months free).
   *  Shared mailboxes and aliases cost nothing. Paddle checkout still sells quantity 1: per-person billing
   *  (quantity = people on the org's domains) is the next billing change. */
  priceMonthly: number;
  /** Limits; null = unlimited. Add your own (they're checked with withinLimit). */
  projects: number | null;
  members: number | null;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: { id: "starter", name: "Starter", priceMonthly: 300, projects: null, members: null },
  pro: { id: "pro", name: "Pro", priceMonthly: 600, projects: null, members: null },
  business: { id: "business", name: "Business", priceMonthly: 1000, projects: null, members: null },
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
export const FREE_PEOPLE = 1;
/** New organizations start a trial of this plan, without a card. */
export const TRIAL_PLAN: PlanId = "pro";
export const POPULAR_PLAN: PlanId = "pro";

/** Plan for a stored id, falling back to the cheapest one for ids that no longer exist. */
export const planById = (id: string | null | undefined): Plan => PLANS[id as PlanId] ?? PLANS.starter;

export const priceYearly = (plan: Plan) => plan.priceMonthly * 10;

export type BillingInterval = "month" | "year";

/** Paid features that only some plans include: the cheapest plan with each one. */
const FEATURE_PLAN = {
  apiAccess: "pro",
  /** The MCP server (/mcp) that Claude, ChatGPT and other AI apps connect to. */
  mcpAccess: "pro",
  auditLog: "pro",
} as const satisfies Record<string, PlanId>;

export type Feature = keyof typeof FEATURE_PLAN;

export const FEATURE_LABELS: Record<Feature, string> = {
  apiAccess: "API access",
  mcpAccess: "Connecting AI apps",
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

export type LimitKind = "projects" | "members";

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
    { label: "Two-factor authentication" },
  ],
  pro: [{ label: "Everything in Starter" }, { label: "REST API" }, { label: "Claude & ChatGPT connector" }, { label: "Audit log" }],
  business: [{ label: "Everything in Pro" }, { label: "Calendar and contacts", soon: true }, { label: "SSO", soon: true }, { label: "Priority support" }],
};

/** Pricing-page lines. Every plan is per person with unlimited people, so no limit lines. */
export function planFeatures(plan: Plan): PlanFeature[] {
  return EXTRAS[plan.id];
}

/** "€3 per person a month": the unit shown next to every price. */
export const PRICE_UNIT = "per person / month";
/** Shown with every price: the free first person (FREE_PEOPLE). */
export const FREE_NOTE = "First person free";
