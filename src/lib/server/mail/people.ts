/**
 * People who only use mail (Settings → Mail → Add person): an account on the org's own domain, created by an
 * owner/admin together with its personal mailbox and access to shared ones. The new address can't receive an
 * invitation before it exists, so the admin gets a temporary password to hand over, like a Workspace admin.
 */
import { account, and, db, eq, inArray, mailboxAccess, mailboxes, member, session, user } from "@/db";
import { HttpError } from "@/lib/server/api";
import { getAuth } from "@/lib/server/auth";
import { seatUpsell, seatsLeft } from "@/lib/server/org";
import { freeAddress } from "./admin";

/** 14 characters without look-alikes (0/O, 1/l/I), grouped for reading out loud: abcd-efgh-jkmn-pq. */
export function temporaryPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12), chars.slice(12)].map((g) => g.join("")).join("-");
}

const hash = async (password: string) => (await getAuth().$context).password.hash(password);

export interface NewPerson {
  name: string;
  domainId: string;
  local: string;
  /** Shared mailboxes they read and answer, e.g. hello@. */
  sharedMailboxIds: string[];
}

export async function addPerson(orgId: string, input: NewPerson) {
  const { plan, left } = await seatsLeft(orgId);
  if (left !== null && left < 1) throw new HttpError(403, seatUpsell(plan));
  const { address, domain } = await freeAddress(orgId, input.domainId, input.local);
  const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, address));
  if (taken) throw new HttpError(409, "An account with this address already exists");
  const shared = input.sharedMailboxIds.length
    ? await db
        .select({ id: mailboxes.id })
        .from(mailboxes)
        .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.kind, "shared"), inArray(mailboxes.id, input.sharedMailboxIds)))
    : [];

  const password = temporaryPassword();
  const userId = crypto.randomUUID();
  const mailboxId = crypto.randomUUID();
  const name = input.name.trim().slice(0, 100);
  // Written directly, not through sign-up: no verification e-mail (the domain is the org's) and no personal
  // trial organization (the user.create hook in auth.ts) — they belong to this org only.
  await db.batch([
    db.insert(user).values({ id: userId, name, email: address, emailVerified: true }),
    db.insert(account).values({ id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId, password: await hash(password) }),
    db.insert(member).values({ id: crypto.randomUUID(), organizationId: orgId, userId, role: "member" }),
    db.insert(mailboxes).values({ id: mailboxId, orgId, domainId: domain.id, address, kind: "personal", userId, displayName: name }),
    ...shared.map((s) => db.insert(mailboxAccess).values({ mailboxId: s.id, userId })),
  ]);
  return { userId, address, password, shared: shared.length };
}

/** A new temporary password for someone who uses mail only; signs them out everywhere. */
export async function resetPersonPassword(orgId: string, mailboxId: string) {
  const [mb] = await db.select().from(mailboxes).where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.orgId, orgId)));
  if (!mb?.userId || mb.kind !== "personal") throw new HttpError(404, "Not found");
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, mb.userId));
  // Only accounts on the mailbox's own address: someone who signed up with their own e-mail manages their password.
  if (u?.email !== mb.address) throw new HttpError(409, "This person signs in with their own e-mail address");
  const [m] = await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, mb.userId)));
  if (!m || m.role === "owner") throw new HttpError(403, "Only a member's password can be reset here");
  const password = temporaryPassword();
  await db.batch([
    db.update(account).set({ password: await hash(password), updatedAt: new Date() }).where(and(eq(account.userId, mb.userId), eq(account.providerId, "credential"))),
    db.delete(session).where(eq(session.userId, mb.userId)),
  ]);
  return { address: mb.address, password };
}
