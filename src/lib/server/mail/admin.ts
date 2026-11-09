/**
 * Settings → Mail (owners and admins): domains and their DNS check, mailboxes (personal per member,
 * shared like support@), aliases, catch-all and who may open a shared mailbox.
 */
import { env } from "cloudflare:workers";
import { and, count, db, eq, inArray, invitation, gt, mailboxAccess, mailAliases, mailboxes, mailDomains, mailMessages, mailThreads, mailOutbox, member, user } from "@/db";
import { ATTACHMENT_URL_PREFIX } from "@/lib/uploads";
import { evaluateDns, isValidDomain, isValidLocalPart, normalizeDomain, requiredDnsRecords } from "@/lib/mail/rules";
import { HttpError } from "@/lib/server/api";
import { requireActivePlan } from "@/lib/server/org";
import { seatsChanged } from "@/lib/server/seats";

const dohAnswers = async (name: string, type: "MX" | "TXT") => {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" } });
  if (!res.ok) return [];
  const body = (await res.json()) as { Answer?: { data: string }[] };
  return (body.Answer ?? []).map((a) => a.data);
};

export async function listMailSetup(orgId: string) {
  const [domains, boxes, aliases, access, members] = await Promise.all([
    db.select().from(mailDomains).where(eq(mailDomains.orgId, orgId)).orderBy(mailDomains.domain),
    db.select().from(mailboxes).where(eq(mailboxes.orgId, orgId)).orderBy(mailboxes.address),
    db.select().from(mailAliases).where(eq(mailAliases.orgId, orgId)).orderBy(mailAliases.address),
    db
      .select({ mailboxId: mailboxAccess.mailboxId, userId: mailboxAccess.userId })
      .from(mailboxAccess)
      .innerJoin(mailboxes, eq(mailboxes.id, mailboxAccess.mailboxId))
      .where(eq(mailboxes.orgId, orgId)),
    db
      .select({ userId: member.userId, name: user.name, email: user.email, role: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId)),
  ]);
  return {
    domains: domains.map((d) => ({ ...d, records: requiredDnsRecords(d.domain) })),
    mailboxes: boxes.map((b) => {
      const owner = b.userId ? members.find((m) => m.userId === b.userId) : undefined;
      return {
        ...b,
        access: access.filter((a) => a.mailboxId === b.id).map((a) => a.userId),
        // Signs in with the mailbox's own address (added through "Add person"): the admin can reset the password.
        mailOnly: !!owner && owner.email === b.address && owner.role === "member",
      };
    }),
    aliases,
    members,
  };
}

async function ownDomain(orgId: string, domainId: string) {
  const [d] = await db.select().from(mailDomains).where(and(eq(mailDomains.id, domainId), eq(mailDomains.orgId, orgId)));
  if (!d) throw new HttpError(404, "Not found");
  return d;
}

export async function addDomain(orgId: string, raw: string) {
  await requireActivePlan(orgId);
  const domain = normalizeDomain(raw);
  if (!isValidDomain(domain)) throw new HttpError(422, "Enter a domain like acme.com");
  const [taken] = await db.select({ id: mailDomains.id }).from(mailDomains).where(eq(mailDomains.domain, domain));
  if (taken) throw new HttpError(409, "This domain is already in use");
  const [row] = await db.insert(mailDomains).values({ orgId, domain }).returning();
  // Domains already on Cloudflare usually have the records: check right away instead of waiting for a click.
  return checkDomain(orgId, row!.id).catch(() => row!);
}

/** Looks up MX, SPF and DMARC over DNS-over-HTTPS and stores what it found. */
export async function checkDomain(orgId: string, domainId: string) {
  const d = await ownDomain(orgId, domainId);
  const [mx, txt, dmarc] = await Promise.all([dohAnswers(d.domain, "MX"), dohAnswers(d.domain, "TXT"), dohAnswers(`_dmarc.${d.domain}`, "TXT")]);
  const result = evaluateDns({ mx, txt, dmarc });
  const [row] = await db
    .update(mailDomains)
    .set({ checks: { mx: result.mx, spf: result.spf, dmarc: result.dmarc }, status: result.active ? "active" : d.status === "active" ? "failing" : "pending", checkedAt: new Date() })
    .where(eq(mailDomains.id, d.id))
    .returning();
  return row!;
}

export async function removeDomain(orgId: string, domainId: string) {
  const d = await ownDomain(orgId, domainId);
  const [used] = await db.select({ n: count() }).from(mailboxes).where(eq(mailboxes.domainId, d.id));
  if (used!.n) throw new HttpError(409, "Delete the domain's mailboxes first");
  await db.delete(mailDomains).where(eq(mailDomains.id, d.id));
  return d;
}

export async function setCatchAll(orgId: string, domainId: string, mailboxId: string | null) {
  const d = await ownDomain(orgId, domainId);
  if (mailboxId) await ownMailbox(orgId, mailboxId);
  await db.update(mailDomains).set({ catchAllMailboxId: mailboxId }).where(eq(mailDomains.id, d.id));
  return d;
}

async function ownMailbox(orgId: string, id: string) {
  const [mb] = await db.select().from(mailboxes).where(and(eq(mailboxes.id, id), eq(mailboxes.orgId, orgId)));
  if (!mb) throw new HttpError(404, "Not found");
  return mb;
}

/** An address on one of the org's domains that no mailbox or alias uses yet. */
export async function freeAddress(orgId: string, domainId: string, local: string) {
  const d = await ownDomain(orgId, domainId);
  const l = local.trim().toLowerCase();
  if (!isValidLocalPart(l)) throw new HttpError(422, "Use letters, digits, dots, dashes or underscores");
  const address = `${l}@${d.domain}`;
  const [[box], [alias], [reserved]] = await Promise.all([
    db.select({ id: mailboxes.id }).from(mailboxes).where(eq(mailboxes.address, address)),
    db.select({ id: mailAliases.id }).from(mailAliases).where(eq(mailAliases.address, address)),
    db.select({ id: invitation.id }).from(invitation).where(and(eq(invitation.mailboxAddress, address), eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date()))),
  ]);
  if (box || alias || reserved) throw new HttpError(409, "This address is already taken");
  return { address, domain: d };
}

export interface NewMailbox {
  domainId: string;
  local: string;
  kind: "personal" | "shared";
  /** personal: the member who owns it. */
  userId?: string;
  displayName?: string;
}

export async function createMailbox(orgId: string, input: NewMailbox) {
  await requireActivePlan(orgId);
  const { address, domain } = await freeAddress(orgId, input.domainId, input.local);
  if (input.kind === "personal") {
    if (!input.userId) throw new HttpError(422, "Pick the member this mailbox belongs to");
    const [m] = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, input.userId)));
    if (!m) throw new HttpError(422, "This person isn't a member of the organization");
    const [has] = await db.select({ id: mailboxes.id }).from(mailboxes).where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.userId, input.userId), eq(mailboxes.kind, "personal")));
    if (has) throw new HttpError(409, "This member already has a mailbox. Add an alias instead.");
  }
  const [row] = await db
    .insert(mailboxes)
    .values({
      orgId,
      domainId: domain.id,
      address,
      kind: input.kind,
      userId: input.kind === "personal" ? input.userId! : null,
      displayName: input.displayName?.trim().slice(0, 100) ?? "",
    })
    .returning();
  if (row!.kind === "personal") await seatsChanged(orgId);
  return row!;
}

export interface MailboxPatch {
  displayName?: string;
  signature?: string;
  /** Turns a personal mailbox into a shared one (e.g. after someone leaves), or hands it to another member. */
  kind?: "personal" | "shared";
  userId?: string | null;
}

export async function updateMailbox(orgId: string, id: string, patch: MailboxPatch) {
  const mb = await ownMailbox(orgId, id);
  const set: Partial<typeof mailboxes.$inferInsert> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName.trim().slice(0, 100);
  if (patch.signature !== undefined) set.signature = patch.signature.slice(0, 2000);
  if (patch.kind === "shared") {
    set.kind = "shared";
    set.userId = null;
  } else if (patch.kind === "personal" || patch.userId) {
    const userId = patch.userId ?? mb.userId;
    if (!userId) throw new HttpError(422, "Pick the member this mailbox belongs to");
    const [m] = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
    if (!m) throw new HttpError(422, "This person isn't a member of the organization");
    set.kind = "personal";
    set.userId = userId;
  }
  const [row] = await db.update(mailboxes).set(set).where(eq(mailboxes.id, mb.id)).returning();
  if (row!.kind !== mb.kind) await seatsChanged(orgId);
  return row!;
}

/** A member edits their own mailbox's name and signature (or a shared one they can open). */
export async function updateOwnMailbox(boxIds: string[], id: string, patch: Pick<MailboxPatch, "displayName" | "signature">) {
  if (!boxIds.includes(id)) throw new HttpError(404, "Not found");
  const [mb] = await db.select({ orgId: mailboxes.orgId }).from(mailboxes).where(eq(mailboxes.id, id));
  return updateMailbox(mb!.orgId, id, patch);
}

/** Deletes a mailbox with all its mail. Only an empty one, unless `force`. */
export async function deleteMailbox(orgId: string, id: string, force = false) {
  const mb = await ownMailbox(orgId, id);
  const [n] = await db.select({ n: count() }).from(mailThreads).where(eq(mailThreads.mailboxId, id));
  if (n!.n && !force) throw new HttpError(409, "This mailbox still has mail. Turn it into a shared mailbox, or delete it with its mail.");
  const outbox = await db.select().from(mailOutbox).where(eq(mailOutbox.mailboxId,id));
  if(outbox.some(job=>job.status==="sending"))throw new HttpError(409,"A message is being sent from this mailbox; try again shortly");
  // Incoming files and raw messages in R2 go with it (sent files stay: they are the org's uploads).
  const rows = await db.select({ files: mailMessages.files, rawKey: mailMessages.rawKey, htmlKey: mailMessages.htmlKey, storageKeys: mailMessages.storageKeys, direction: mailMessages.direction }).from(mailMessages).where(eq(mailMessages.mailboxId, id));
  const keys = [...new Set([...rows.flatMap((r) => [...r.storageKeys, ...(r.direction === "in" ? r.files.map((f) => f.url.slice(ATTACHMENT_URL_PREFIX.length)) : []), ...(r.rawKey ? [r.rawKey] : []), ...(r.htmlKey ? [r.htmlKey] : [])]), ...outbox.flatMap(job=>[...job.payload.files.map(f=>f.url.slice(ATTACHMENT_URL_PREFIX.length)),...(job.payload.htmlKey?[job.payload.htmlKey]:[])])])];
  for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
  await db.batch([db.update(mailDomains).set({ catchAllMailboxId: null }).where(eq(mailDomains.catchAllMailboxId, id)), db.delete(mailboxes).where(eq(mailboxes.id, id))]);
  if (mb.kind === "personal") await seatsChanged(orgId);
  return mb;
}

export async function setMailboxAccess(orgId: string, id: string, userIds: string[]) {
  const mb = await ownMailbox(orgId, id);
  if (mb.kind !== "shared") throw new HttpError(422, "Only shared mailboxes have members");
  const members = userIds.length
    ? await db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, orgId), inArray(member.userId, userIds)))
    : [];
  const valid = members.map((m) => m.userId);
  await db.batch([
    db.delete(mailboxAccess).where(eq(mailboxAccess.mailboxId, id)),
    ...(valid.length ? [db.insert(mailboxAccess).values(valid.map((userId) => ({ mailboxId: id, userId })))] : []),
  ]);
  return mb;
}

export async function addAlias(orgId: string, input: { domainId: string; local: string; mailboxId: string }) {
  const mb = await ownMailbox(orgId, input.mailboxId);
  const { address } = await freeAddress(orgId, input.domainId, input.local);
  const [row] = await db.insert(mailAliases).values({ orgId, address, mailboxId: mb.id }).returning();
  return row!;
}

export async function removeAlias(orgId: string, id: string) {
  const [row] = await db.delete(mailAliases).where(and(eq(mailAliases.id, id), eq(mailAliases.orgId, orgId))).returning();
  if (!row) throw new HttpError(404, "Not found");
  return row;
}
