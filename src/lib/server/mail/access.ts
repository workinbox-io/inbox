/**
 * Which mailboxes a member may open: their personal one and the ones they were given (shared, or someone's
 * personal mailbox delegated to them); owners and admins open every mailbox of the org. Every mail query goes
 * through this list. `followed` marks the ones that belong in "All mailboxes", the bell and push: own, given,
 * and shared ones; an admin opens others' personal mailboxes without being flooded by them.
 */
import { and, db, eq, inArray, mailboxAccess, mailboxes, member, or } from "@/db";
import { HttpError } from "@/lib/server/api";
import { canManage, type OrgRole } from "@/lib/server/roles";

export type Mailbox = typeof mailboxes.$inferSelect & { followed?: boolean };

export interface MailViewer {
  apiKeyId?: string;
  orgId: string;
  userId: string;
  role: OrgRole;
}

export async function viewerMailboxes(v: MailViewer): Promise<Mailbox[]> {
  if (v.apiKeyId) return resolveApiKeyMailboxes(v.orgId, v.apiKeyId);
  const grants = db.select({ id: mailboxAccess.mailboxId }).from(mailboxAccess).where(eq(mailboxAccess.userId, v.userId));
  const mine = or(and(eq(mailboxes.kind, "personal"), eq(mailboxes.userId, v.userId)), inArray(mailboxes.id, grants));
  const [given, rows] = await Promise.all([grants, db.select().from(mailboxes).where(and(eq(mailboxes.orgId, v.orgId), canManage(v.role) ? undefined : mine))]);
  const granted = new Set(given.map((g) => g.id));
  const own = (b: Mailbox) => b.kind === "personal" && b.userId === v.userId;
  const rank = (b: Mailbox) => (own(b) ? 0 : b.followed ? 1 : 2);
  // Own first, then the followed ones, then (admins) everyone else's, each by address.
  return rows
    .map((b) => ({ ...b, followed: own(b) || granted.has(b.id) || b.kind === "shared" }))
    .sort((a, b) => rank(a) - rank(b) || a.address.localeCompare(b.address));
}

/** The viewer's mailboxes, narrowed to `addresses` when given; unknown addresses are a 404. */
export async function resolveMailboxes(v: MailViewer, addresses?: string[]) {
  const all = await viewerMailboxes(v);
  if (!addresses) return all;
  const picked = all.filter((m) => addresses.includes(m.address));
  if (picked.length !== addresses.length) throw new HttpError(404, "Not found");
  return picked;
}


/** API keys never inherit admin access to personal or shared mailboxes. */
export async function resolveApiKeyMailboxes(orgId: string, apiKeyId: string): Promise<Mailbox[]> {
  const { mailApiAccess } = await import("@/db/schema/mail-integrations");
  const { apiKeys } = await import("@/db/schema/core");
  return db.select({ mailbox: mailboxes }).from(mailboxes)
    .innerJoin(mailApiAccess, eq(mailApiAccess.mailboxId, mailboxes.id))
    .innerJoin(apiKeys, eq(apiKeys.id, mailApiAccess.apiKeyId))
    .where(and(eq(mailboxes.orgId, orgId), eq(apiKeys.orgId, orgId), eq(mailApiAccess.apiKeyId, apiKeyId)))
    .then(rows => rows.map(row => row.mailbox));
}

/** Whether this person is still a member who may open the mailbox (for work done later on their behalf). */
export async function memberCanOpen(orgId: string, userId: string, mailboxId: string) {
  const [m] = await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  if (!m) return false;
  return (await viewerMailboxes({ orgId, userId, role: m.role as OrgRole })).some((b) => b.id === mailboxId);
}
