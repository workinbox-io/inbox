/**
 * Drive storage per org: files plus uploads in progress, against GB per person on the plan (pooled), unlimited when
 * self-hosted. Checked before any bytes are written.
 */
import { env } from "cloudflare:workers";
import { planById } from "@/config/plans";
import { db, driveItems, driveUploads, eq, sql } from "@/db";
import { driveQuota } from "@/lib/drive/access";
import { HttpError } from "@/lib/server/api";
import { subscriptionUsable } from "@/lib/server/billing";
import { getSubscription } from "@/lib/server/org";
import { peopleCount } from "@/lib/server/seats";

export async function driveUsage(orgId: string) {
  const [[files], [uploads]] = await Promise.all([
    db.select({ n: sql<number>`coalesce(sum(${driveItems.size}), 0)` }).from(driveItems).where(eq(driveItems.orgId, orgId)),
    db.select({ n: sql<number>`coalesce(sum(${driveUploads.size}), 0)` }).from(driveUploads).where(eq(driveUploads.orgId, orgId)),
  ]);
  const used = Number(files?.n ?? 0) + Number(uploads?.n ?? 0);
  if (env.DEPLOY_MODE === "self") return { used, quota: null };
  const sub = await getSubscription(orgId);
  // Without a usable plan the org keeps the cheapest plan's storage (the free tier).
  const plan = planById(sub && subscriptionUsable(sub) ? sub.plan : null);
  return { used, quota: driveQuota(plan.driveGbPerPerson, await peopleCount(orgId)) };
}

/** 507 when `bytes` more wouldn't fit. Trashed files still count until they're deleted. */
export async function requireDriveSpace(orgId: string, bytes: number) {
  const { used, quota } = await driveUsage(orgId);
  if (quota !== null && used + bytes > quota) throw new HttpError(507, "Drive storage is full. Empty the trash or delete files to make room.");
}
