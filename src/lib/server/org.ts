import { env } from "cloudflare:workers";
import { t } from "@/lib/i18n/panel";
import { FREE_PEOPLE, TRIAL_DAYS, seatsFor, TRIAL_PLAN, featureUpsell, hasFeature, planById, type Feature } from "@/config/plans";
import type { BillingDetails } from "@/lib/validation";
import {
  and,
  apiKeys,
  asc,
  count,
  db,
  eq,
  gte,
  inArray,
  invitation,
  mailboxes,
  member,
  ne,
  orgBillingDetails,
  organization,
  session,
  subscriptions,
  user,
} from "@/db";
import { HttpError } from "./api";
import { subscriptionUsable } from "./billing";
import { cancelSubscription } from "./paddle";
import { peopleCount } from "./seats";
import { MANAGE_ONLY, type OrgRole } from "./roles";
import { canCreateWorkspace } from "@/lib/workspaces";

export class OrgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgError";
  }
}

/** A workspace of one, on a trial. Every user gets one unless they joined through an invitation. */
export async function createPersonalOrg(userId: string, userName: string, name = `${userName}'s team`) {
  const orgId = crypto.randomUUID();
  await db.batch([
    db.insert(organization).values({ id: orgId, name, slug: `team-${orgId.slice(0, 8)}` }),
    db.insert(member).values({ id: crypto.randomUUID(), organizationId: orgId, userId, role: "owner" }),
    db.insert(subscriptions).values({
      orgId,
      plan: TRIAL_PLAN,
      status: "trialing",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
    }),
  ]);
  return orgId;
}

/** The workspaces a person belongs to, oldest first (account menus and Settings → Organization). */
export async function userOrgs(userId: string, orgId: string) {
  const rows = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
  return rows.map((o) => ({ ...o, active: o.id === orgId }));
}

/** Another workspace for an owner/admin running several companies: its own trial, plan and people. */
export async function createWorkspace(userId: string, userName: string, role: OrgRole, name: string) {
  const orgs = await userOrgs(userId, "");
  if (!canCreateWorkspace({ mode: env.DEPLOY_MODE, role, owned: orgs.filter((o) => o.role === "owner").length })) {
    throw new HttpError(403, role === "owner" || role === "admin" ? "You can't create more workspaces." : MANAGE_ONLY);
  }
  return createPersonalOrg(userId, userName, name);
}

export async function hasPendingInvitation(email: string) {
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.email, email.toLowerCase()), eq(invitation.status, "pending"), gte(invitation.expiresAt, new Date())))
    .limit(1);
  return Boolean(row);
}

export async function getOrg(orgId: string) {
  const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
  return org ?? null;
}

export async function getSubscription(orgId: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
  return sub ?? null;
}

/** Throws 402 unless the org's trial or subscription is active, and returns its plan. */
export async function requireActivePlan(orgId: string) {
  if (env.DEPLOY_MODE === "self") return planById("business");
  const sub = await getSubscription(orgId);
  if (!sub || !subscriptionUsable(sub)) {
    throw new HttpError(402, "Your trial has ended or your subscription is inactive. Choose a plan to continue.");
  }
  return planById(sub.plan);
}

/**
 * Mail actions (sending, domains, mailboxes, people): free while the org stays within FREE_PEOPLE personal
 * mailboxes, counting the `addingPeople` the action creates; beyond that it needs an active trial or plan.
 */
export async function requireMailPlan(orgId: string, addingPeople = 0) {
  if (env.DEPLOY_MODE === "self") return;
  const sub = await getSubscription(orgId);
  if (sub && subscriptionUsable(sub)) return;
  if ((await peopleCount(orgId)) + addingPeople <= FREE_PEOPLE) return;
  throw new HttpError(
    402,
    sub?.status === "trialing" || !sub
      ? `Your trial has ended. Up to ${FREE_PEOPLE} people are free; choose a plan to add more people or keep mailing as a team.`
      : `Your subscription is inactive. Up to ${FREE_PEOPLE} people are free; choose a plan to add more people or keep mailing as a team.`,
  );
}

/** Throws 402 unless the org's plan includes `feature`. */
export async function requireFeature(orgId: string, feature: Feature) {
  const plan = await requireActivePlan(orgId);
  if (!hasFeature(plan, feature)) throw new HttpError(402, `${featureUpsell(feature)} Upgrade to use it.`);
  return plan;
}

/** What the org uses of its plan limits (Billing page). Add your product's counts here. */
export async function getOrgUsage(orgId: string) {
  const [sub, [m], people] = await Promise.all([
    getSubscription(orgId),
    db.select({ n: count() }).from(member).where(eq(member.organizationId, orgId)),
    peopleCount(orgId),
  ]);
  /** `people`: personal mailboxes. `seats`: people billed for (beyond the free ones, at least MIN_SEATS), the subscription's
   *  quantity. */
  return { plan: planById(sub?.plan), members: m?.n ?? 0, people, seats: seatsFor(people) };
}

export type OrgUsage = Awaited<ReturnType<typeof getOrgUsage>>;

/**
 * Seats the plan still has for a new invitation: members plus pending, unexpired invitations both
 * hold one, so an org cannot invite past its limit and accept them all later. An invitation to the
 * same address doesn't count — re-inviting replaces it. `null` = the plan has no member limit.
 */
export async function seatsLeft(orgId: string, email?: string) {
  const sub = await getSubscription(orgId);
  const plan = planById(sub?.plan);
  if (plan.members === null) return { plan, left: null };
  const pending = and(
    eq(invitation.organizationId, orgId),
    eq(invitation.status, "pending"),
    gte(invitation.expiresAt, new Date()),
    ...(email ? [ne(invitation.email, email.toLowerCase())] : []),
  );
  const [[m], [i]] = await Promise.all([
    db.select({ n: count() }).from(member).where(eq(member.organizationId, orgId)),
    db.select({ n: count() }).from(invitation).where(pending),
  ]);
  return { plan, left: plan.members - (m?.n ?? 0) - (i?.n ?? 0) };
}

/** Better Auth's `membershipLimit`: checked when an invitation is accepted. */
export async function memberLimit(orgId: string) {
  const plan = planById((await getSubscription(orgId))?.plan);
  return plan.members ?? Number.MAX_SAFE_INTEGER;
}

export const seatUpsell = (plan: { name: string; members: number | null }) =>
  `The ${plan.name} plan includes ${plan.members} team members. Upgrade to invite more.`;

// ---------------------------------------------------------------------------
// Settings → Organization
// ---------------------------------------------------------------------------

export const EMPTY_BILLING_DETAILS: BillingDetails = {
  legalName: "",
  vatId: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  region: "",
  country: "",
};

export async function getBillingDetails(orgId: string): Promise<BillingDetails> {
  const [row] = await db.select().from(orgBillingDetails).where(eq(orgBillingDetails.orgId, orgId));
  if (!row) return EMPTY_BILLING_DETAILS;
  const { orgId: _org, updatedAt: _updated, ...details } = row;
  return details;
}

export async function saveBillingDetails(orgId: string, details: BillingDetails) {
  await db
    .insert(orgBillingDetails)
    .values({ orgId, ...details })
    .onConflictDoUpdate({ target: orgBillingDetails.orgId, set: { ...details, updatedAt: new Date() } });
}

/** Settings → Team: members, pending invitations and the orgs the viewer can switch to. */
export async function loadTeam(orgId: string, userId: string) {
  const [members, invitations, orgs, sub] = await Promise.all([
    db
      .select({ id: member.id, userId: member.userId, name: user.name, email: user.email, role: member.role })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, orgId))
      .orderBy(asc(member.createdAt)),
    db
      .select({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt })
      .from(invitation)
      .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, "pending"), gte(invitation.expiresAt, new Date())))
      .orderBy(asc(invitation.createdAt)),
    userOrgs(userId, orgId),
    getSubscription(orgId),
  ]);
  const plan = planById(sub?.plan);
  const myRole = members.find((m) => m.userId === userId)?.role ?? "member";
  return {
    members: members.map((m) => ({ id: m.id, userId: m.userId, name: m.name, email: m.email, role: m.role, isMe: m.userId === userId })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role ?? "member", expiresAt: i.expiresAt.toISOString() })),
    canManage: myRole === "owner" || myRole === "admin",
    /** Only an owner changes roles; ownership itself moves through Transfer, never a role pick. */
    canChangeRoles: myRole === "owner",
    /** The plan's member limit (`null` = unlimited); pending invitations hold a seat too. */
    seats: { plan: plan.name, limit: plan.members },
    orgs: orgs.map(({ id, name, active }) => ({ id, name, active })),
  };
}

export type TeamData = Awaited<ReturnType<typeof loadTeam>>;

// ---------------------------------------------------------------------------
// Deleting and transferring
// ---------------------------------------------------------------------------

/** A subscription that still bills (or will): anything Paddle hasn't canceled. */
const hasLiveSubscription = (sub: { paddleSubscriptionId: string | null; status: string } | null) =>
  Boolean(sub?.paddleSubscriptionId) && sub!.status !== "canceled";

/**
 * Cancels the subscription first (if Paddle refuses, nothing is taken apart yet), then deletes the
 * org; members, keys, invitations, mail and the audit log go with it (on delete cascade).
 */
export async function deleteOrganization(orgId: string) {
  const sub = await getSubscription(orgId);
  if (hasLiveSubscription(sub)) await cancelSubscription(sub!.paddleSubscriptionId!);
  await db.batch([
    // Sessions pointing here pick another org (or a fresh personal one) on the next request.
    db.update(session).set({ activeOrganizationId: null }).where(eq(session.activeOrganizationId, orgId)),
    db.delete(apiKeys).where(eq(apiKeys.orgId, orgId)),
    db.delete(organization).where(eq(organization.id, orgId)),
  ]);
}

/** Makes another member the owner; the previous owner stays on as an admin. */
export async function transferOwnership(orgId: string, fromUserId: string, toMemberId: string) {
  const rows = await db
    .select({ id: member.id, userId: member.userId, role: member.role, email: user.email, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, orgId));
  const from = rows.find((r) => r.userId === fromUserId);
  const to = rows.find((r) => r.id === toMemberId);
  if (!from || from.role !== "owner") throw new OrgError("Only the owner can transfer ownership.");
  if (!to) throw new OrgError("That person isn't a member of this organization.");
  if (to.userId === fromUserId) throw new OrgError("You already own this organization.");
  await db.batch([
    db.update(member).set({ role: "owner" }).where(eq(member.id, to.id)),
    db.update(member).set({ role: "admin" }).where(eq(member.id, from.id)),
  ]);
  return { name: to.name, email: to.email };
}

export interface MembershipSummary {
  orgId: string;
  orgName: string;
  role: string;
  /** Other members of the org, whatever their role. */
  otherMembers: number;
  /** Other owners; with one, the org doesn't depend on this user. */
  otherOwners: number;
}

/**
 * An account can go unless the user is the only owner of an org someone else still uses: that one
 * needs a new owner or deleting first. Orgs the user owns alone are deleted with them.
 */
export function planAccountDeletion(memberships: MembershipSummary[]) {
  const plan = { blockers: [] as string[], deleteOrgs: [] as string[] };
  for (const m of memberships) {
    if (m.role !== "owner" || m.otherOwners > 0) continue;
    if (m.otherMembers > 0) {
      plan.blockers.push(t("You're the only owner of “{org}”, which has other members. Transfer ownership to one of them or delete the organization first.", { org: m.orgName }));
    } else {
      plan.deleteOrgs.push(m.orgId);
    }
  }
  return plan;
}

export async function loadMemberships(userId: string): Promise<MembershipSummary[]> {
  const mine = await db
    .select({ orgId: member.organizationId, role: member.role, orgName: organization.name })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId));
  if (!mine.length) return [];
  const others = await db
    .select({ orgId: member.organizationId, role: member.role })
    .from(member)
    .where(and(inArray(member.organizationId, mine.map((m) => m.orgId)), ne(member.userId, userId)));
  return mine.map((m) => ({
    ...m,
    otherMembers: others.filter((o) => o.orgId === m.orgId).length,
    otherOwners: others.filter((o) => o.orgId === m.orgId && o.role === "owner").length,
  }));
}

/** Better Auth's `beforeDelete`: refuses with the blockers, otherwise deletes the orgs only this user had. */
export async function prepareAccountDeletion(userId: string) {
  const plan = planAccountDeletion(await loadMemberships(userId));
  if (plan.blockers.length) throw new OrgError(plan.blockers.join(" "));
  for (const orgId of plan.deleteOrgs) await deleteOrganization(orgId);
  return plan;
}
