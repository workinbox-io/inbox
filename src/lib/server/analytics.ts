import { analyticsSalts, and, count, db, desc, eq, gte, lt, organization, pageViews, sql, subscriptions, user } from "@/db";
import { planById, priceYearly } from "@/config/plans";
import { sha256Hex } from "./crypto";

// ---------------------------------------------------------------------------
// Page views: no cookies, no client storage, nothing sent to third parties
// ---------------------------------------------------------------------------

const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|http-?client|facebookexternalhit|embedly/i;
/** Raw page views are kept for 13 months. */
const PAGE_VIEW_RETENTION_DAYS = 395;

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const clip = (v: string | null | undefined, max = 100) => (v ? v.slice(0, max) : null);

export const isBot = (userAgent: string | null | undefined) => !userAgent || BOT_UA.test(userAgent);

/** "google.com" for https://www.google.com/search…; null for our own pages, direct visits and junk. */
export function referrerHost(referrer: string | null | undefined, ownHost: string) {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host && host !== ownHost.replace(/^www\./, "") ? clip(host) : null;
  } catch {
    return null;
  }
}

/** "/pricing" for "/pricing/" (prerendered pages); the root stays "/". */
export const pagePath = (pathname: string) => clip(pathname.replace(/(.)\/$/, "$1"), 200)!;

/** Today's salt, created by whichever request asks first. Old salts are deleted by cleanupPageViews. */
async function dailySalt(day: string) {
  await db
    .insert(analyticsSalts)
    .values({ day, salt: [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("") })
    .onConflictDoNothing();
  const [row] = await db.select().from(analyticsSalts).where(eq(analyticsSalts.day, day));
  return row!.salt;
}

/** Same visitor within a UTC day gives the same hash; once the salt is gone it can't be recomputed. */
async function visitorHash(ip: string, userAgent: string, now = new Date()) {
  const salt = await dailySalt(utcDay(now));
  return (await sha256Hex(`${salt}|${ip}|${userAgent}`)).slice(0, 32);
}

export interface PageViewInput {
  /** The page's full URL (location.href). */
  url: string;
  referrer: string | null;
  ip: string;
  userAgent: string | null;
  /** request.cf.country */
  country: string | null;
}

/** Stores one page view; bots and malformed input are dropped silently. */
export async function recordPageView(input: PageViewInput) {
  if (isBot(input.userAgent)) return;
  let page: URL;
  try {
    page = new URL(input.url);
  } catch {
    return;
  }
  const q = page.searchParams;
  const now = new Date();
  await db.insert(pageViews).values({
    day: utcDay(now),
    path: pagePath(page.pathname),
    referrerHost: referrerHost(input.referrer, page.hostname),
    utmSource: clip(q.get("utm_source") ?? q.get("ref")),
    utmCampaign: clip(q.get("utm_campaign")),
    country: clip(input.country, 2),
    visitor: await visitorHash(input.ip, input.userAgent!, now),
  });
}

/**
 * Copies where a new user came from (their first page view today, by visitor hash) onto the user.
 * Visits on an earlier day can't be linked, by design.
 */
export async function attributeSignup(userId: string, ip: string, userAgent: string | null) {
  if (isBot(userAgent)) return;
  const now = new Date();
  const [first] = await db
    .select()
    .from(pageViews)
    .where(and(eq(pageViews.day, utcDay(now)), eq(pageViews.visitor, await visitorHash(ip, userAgent!, now))))
    .orderBy(pageViews.createdAt)
    .limit(1);
  if (!first) return;
  await db
    .update(user)
    .set({
      signupReferrer: first.referrerHost,
      signupUtmSource: first.utmSource,
      signupUtmCampaign: first.utmCampaign,
      signupLandingPath: first.path,
    })
    .where(eq(user.id, userId));
}

/** Drops salts older than yesterday (so hashes can't be recomputed) and page views past retention. */
export async function cleanupPageViews(now = new Date()) {
  await db.delete(analyticsSalts).where(lt(analyticsSalts.day, utcDay(new Date(now.getTime() - 86_400_000))));
  await db.delete(pageViews).where(lt(pageViews.day, utcDay(new Date(now.getTime() - PAGE_VIEW_RETENTION_DAYS * 86_400_000))));
}

// ---------------------------------------------------------------------------
// Staff overview (/staff)
// ---------------------------------------------------------------------------

/** Monthly recurring revenue in cents, from active subscriptions at list price. */
export const mrrOf = (subs: { plan: string; status: string; billingInterval: string | null }[]) =>
  subs
    .filter((s) => s.status === "active" || s.status === "past_due")
    .reduce((sum, s) => {
      const plan = planById(s.plan);
      return sum + (s.billingInterval === "year" ? Math.round(priceYearly(plan) / 12) : plan.priceMonthly);
    }, 0);

const realUser = sql`${user.email} not like '%.example'`;

export async function adminOverview(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const sinceDay = utcDay(since);
  const [subs, [users], [newUsers], visitsByDay, signupsByDay, topPages, topReferrers] = await Promise.all([
    // The public demo's orgs and people (lib/server/demo) aren't customers.
    db
      .select({ plan: subscriptions.plan, status: subscriptions.status, billingInterval: subscriptions.billingInterval })
      .from(subscriptions)
      .innerJoin(organization, eq(organization.id, subscriptions.orgId))
      .where(sql`${organization.slug} not like 'demo-%'`),
    db.select({ n: count() }).from(user).where(realUser),
    db.select({ n: count() }).from(user).where(and(gte(user.createdAt, since), realUser)),
    db
      .select({ day: pageViews.day, views: count(), visitors: sql<number>`count(distinct ${pageViews.visitor})` })
      .from(pageViews)
      .where(gte(pageViews.day, sinceDay))
      .groupBy(pageViews.day)
      .orderBy(pageViews.day),
    db
      .select({ day: sql<string>`strftime('%Y-%m-%d', ${user.createdAt} / 1000, 'unixepoch')`, n: count() })
      .from(user)
      .where(and(gte(user.createdAt, since), realUser))
      .groupBy(sql`1`),
    db
      .select({ name: pageViews.path, value: count() })
      .from(pageViews)
      .where(gte(pageViews.day, sinceDay))
      .groupBy(pageViews.path)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({ name: sql<string>`coalesce(${pageViews.referrerHost}, 'Direct')`, value: count() })
      .from(pageViews)
      .where(gte(pageViews.day, sinceDay))
      .groupBy(sql`1`)
      .orderBy(desc(count()))
      .limit(10),
  ]);
  const signups = new Map(signupsByDay.map((s) => [s.day, s.n]));
  const series = Array.from({ length: days }, (_, i) => {
    const day = utcDay(new Date(since.getTime() + (i + 1) * 86_400_000));
    const v = visitsByDay.find((d) => d.day === day);
    return { day, visitors: v?.visitors ?? 0, views: v?.views ?? 0, signups: signups.get(day) ?? 0 };
  });
  return {
    mrr: mrrOf(subs),
    paying: subs.filter((s) => s.status === "active" || s.status === "past_due").length,
    trialing: subs.filter((s) => s.status === "trialing").length,
    users: users?.n ?? 0,
    newUsers: newUsers?.n ?? 0,
    visitors: series.reduce((s, d) => s + d.visitors, 0),
    series,
    topPages,
    topReferrers,
  };
}

export type AdminOverview = Awaited<ReturnType<typeof adminOverview>>;
