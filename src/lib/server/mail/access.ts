/**
 * Which mailboxes a member may open: their personal one, shared ones they were given, and for owners
 * and admins every shared mailbox of the org. Every mail query goes through this list.
 */
import { and, db, eq, inArray, mailboxAccess, mailboxes, or } from "@/db";
import { HttpError } from "@/lib/server/api";
import { canManage, type OrgRole } from "@/lib/server/roles";

export type Mailbox = typeof mailboxes.$inferSelect;

export interface MailViewer {
  apiKeyId?: string;
  orgId: string;
  userId: string;
  role: OrgRole;
}

export async function viewerMailboxes(v: MailViewer): Promise<Mailbox[]> {
  if (v.apiKeyId) return resolveApiKeyMailboxes(v.orgId, v.apiKeyId);
  const shared = canManage(v.role)
    ? eq(mailboxes.kind, "shared")
    : and(
        eq(mailboxes.kind, "shared"),
        inArray(mailboxes.id, db.select({ id: mailboxAccess.mailboxId }).from(mailboxAccess).where(eq(mailboxAccess.userId, v.userId))),
      );
  const rows = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.orgId, v.orgId), or(and(eq(mailboxes.kind, "personal"), eq(mailboxes.userId, v.userId)), shared)));
  // Personal first, then shared by address.
  return rows.sort((a, b) => (a.kind === b.kind ? a.address.localeCompare(b.address) : a.kind === "personal" ? -1 : 1));
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
