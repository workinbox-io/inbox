/**
 * The team address book (db/schema/contacts.ts): list and search, create, change, delete, groups, composer
 * suggestions, import/export, and contacts picked up from sent mail. Every member of the org may read and edit
 * it. The directory (our own people and shared mailboxes) is read live from `mailboxes`.
 */
import { and, asc, contactEmails, contactGroupMembers, contactGroups, contacts, db, desc, eq, inArray, isNotNull, isNull, mailboxes, mailDomains, mailThreads, or, sql, user } from "@/db";
import type { BatchItem } from "drizzle-orm/batch";
import type { ContactValue } from "@/db/schema/contacts";
import { HttpError } from "@/lib/server/api";
import { cleanContact, displayName, mergeContact, normalizeEmail, worthRecording, type ContactFields } from "@/lib/contacts/rules";
import type { ContactInput, ContactList, ContactUpdate } from "@/lib/validation-contacts";

type Row = typeof contacts.$inferSelect;
type Batch = BatchItem<"sqlite">[];
/** db.batch wants a non-empty tuple; every caller here has at least one statement. */
const runBatch = (batch: Batch) => (batch.length ? db.batch(batch as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]) : Promise.resolve([]));

export type Contact = {
  id: string;
  name: string;
  company: string;
  title: string;
  note: string;
  emails: ContactValue[];
  phones: ContactValue[];
  source: Row["source"];
  contactCount: number;
  lastContactedAt: string | null;
  groupIds: string[];
  updatedAt: string;
};

export type DirectoryEntry = {
  id: string;
  name: string;
  email: string;
  kind: "personal" | "shared";
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
/** D1 binds at most 100 parameters per statement. */
const chunks = <T>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

const out = (c: Row, groupIds: string[] = []): Contact => ({
  id: c.id,
  name: c.name,
  company: c.company,
  title: c.title,
  note: c.note,
  emails: c.emails,
  phones: c.phones,
  source: c.source,
  contactCount: c.contactCount,
  lastContactedAt: c.lastContactedAt?.toISOString() ?? null,
  groupIds,
  updatedAt: c.updatedAt.toISOString(),
});

async function groupIdsOf(ids: string[]) {
  const map = new Map<string, string[]>();
  for (const part of chunks(ids, 90)) {
    const rows = part.length ? await db.select().from(contactGroupMembers).where(inArray(contactGroupMembers.contactId, part)) : [];
    for (const r of rows) map.set(r.contactId, [...(map.get(r.contactId) ?? []), r.groupId]);
  }
  return map;
}

/** Which contact each address already belongs to. */
async function ownersOf(orgId: string, emails: string[]) {
  const map = new Map<string, string>();
  for (const part of chunks([...new Set(emails)], 90)) {
    const rows = await db.select().from(contactEmails).where(and(eq(contactEmails.orgId, orgId), inArray(contactEmails.email, part)));
    for (const r of rows) map.set(r.email, r.contactId);
  }
  return map;
}

/** Keeps only the org's own groups. */
async function orgGroupIds(orgId: string, ids: string[] | undefined) {
  if (!ids?.length) return [];
  const rows = await db.select({ id: contactGroups.id }).from(contactGroups).where(and(eq(contactGroups.orgId, orgId), inArray(contactGroups.id, ids.slice(0, 90))));
  return rows.map((r) => r.id);
}

export async function listContacts(orgId: string, q: ContactList): Promise<{ contacts: Contact[]; directory: DirectoryEntry[]; hasMore: boolean }> {
  const pattern = q.q ? `%${escapeLike(q.q)}%` : null;
  if (q.view === "directory") return { contacts: [], directory: await listDirectory(orgId, pattern), hasMore: false };

  const where = [eq(contacts.orgId, orgId)];
  if (q.view === "recent") where.push(isNotNull(contacts.lastContactedAt));
  if (q.groupId) where.push(sql`${contacts.id} IN (SELECT ${contactGroupMembers.contactId} FROM ${contactGroupMembers} WHERE ${contactGroupMembers.groupId} = ${q.groupId})`);
  if (pattern)
    where.push(
      or(
        sql`${contacts.name} LIKE ${pattern} ESCAPE '\\'`,
        sql`${contacts.company} LIKE ${pattern} ESCAPE '\\'`,
        sql`${contacts.id} IN (SELECT ${contactEmails.contactId} FROM ${contactEmails} WHERE ${contactEmails.orgId} = ${orgId} AND ${contactEmails.email} LIKE ${pattern} ESCAPE '\\')`,
      )!,
    );
  const rows = await db
    .select()
    .from(contacts)
    .where(and(...where))
    .orderBy(...(q.view === "recent" ? [desc(contacts.lastContactedAt)] : [sql`lower(coalesce(nullif(${contacts.name}, ''), json_extract(${contacts.emails}, '$[0].value')))`]))
    .limit(q.limit + 1)
    .offset(q.offset);
  const page = rows.slice(0, q.limit);
  const groups = await groupIdsOf(page.map((c) => c.id));
  // The directory joins in a search of the whole book, so one search finds colleagues too.
  const directory = pattern && q.view === "all" && !q.groupId && q.offset === 0 ? await listDirectory(orgId, pattern) : [];
  return { contacts: page.map((c) => out(c, groups.get(c.id))), directory, hasMore: rows.length > q.limit };
}

async function listDirectory(orgId: string, pattern: string | null): Promise<DirectoryEntry[]> {
  const name = sql<string>`coalesce(nullif(${mailboxes.displayName}, ''), ${user.name}, '')`;
  const rows = await db
    .select({ id: mailboxes.id, email: mailboxes.address, kind: mailboxes.kind, name })
    .from(mailboxes)
    .leftJoin(user, eq(user.id, mailboxes.userId))
    .where(and(eq(mailboxes.orgId, orgId), pattern ? or(sql`${mailboxes.address} LIKE ${pattern} ESCAPE '\\'`, sql`${name} LIKE ${pattern} ESCAPE '\\'`) : undefined))
    .orderBy(asc(mailboxes.kind), asc(mailboxes.address))
    .limit(200);
  return rows;
}

async function requireContact(orgId: string, id: string) {
  const [row] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)));
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

export async function getContact(orgId: string, id: string) {
  const row = await requireContact(orgId, id);
  return out(row, (await groupIdsOf([id])).get(id));
}

/** The contact an address belongs to, if any (the sender panel in Mail). */
export async function contactByEmail(orgId: string, email: string) {
  const id = (await ownersOf(orgId, [email.toLowerCase()])).get(email.toLowerCase());
  return id ? getContact(orgId, id) : null;
}

async function assertFree(orgId: string, emails: ContactValue[], self?: string) {
  const owners = await ownersOf(orgId, emails.map((e) => e.value));
  for (const [email, id] of owners) if (id !== self) throw new HttpError(409, "{email} already belongs to another contact", { email, contactId: id });
}

const emailRows = (orgId: string, contactId: string, emails: ContactValue[]) => emails.map((e) => ({ orgId, email: e.value, contactId }));

export async function createContact(orgId: string, input: ContactInput, createdBy: string | null) {
  const c = cleanContact(input);
  if (!c.name && !c.emails.length && !c.phones.length) throw new HttpError(422, "Enter a name, an e-mail address or a phone number");
  await assertFree(orgId, c.emails);
  const groupIds = await orgGroupIds(orgId, input.groupIds);
  const id = crypto.randomUUID();
  const { groups: _g, ...fields } = c;
  const batch: Batch = [db.insert(contacts).values({ id, orgId, ...fields, source: "manual", createdBy })];
  if (c.emails.length) batch.push(db.insert(contactEmails).values(emailRows(orgId, id, c.emails)));
  if (groupIds.length) batch.push(db.insert(contactGroupMembers).values(groupIds.map((groupId) => ({ groupId, contactId: id }))));
  await runBatch(batch);
  return getContact(orgId, id);
}

export async function updateContact(orgId: string, id: string, input: ContactUpdate) {
  const row = await requireContact(orgId, id);
  const { groupIds: wanted, ...patch } = input;
  const { groups: _g, ...c } = cleanContact({ ...row, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) });
  if (!c.name && !c.emails.length && !c.phones.length) throw new HttpError(422, "Enter a name, an e-mail address or a phone number");
  await assertFree(orgId, c.emails, id);
  const batch: Batch = [db.update(contacts).set({ ...c, updatedAt: new Date() }).where(eq(contacts.id, id)), db.delete(contactEmails).where(eq(contactEmails.contactId, id))];
  if (c.emails.length) batch.push(db.insert(contactEmails).values(emailRows(orgId, id, c.emails)));
  if (wanted) {
    const groupIds = await orgGroupIds(orgId, wanted);
    batch.push(db.delete(contactGroupMembers).where(eq(contactGroupMembers.contactId, id)));
    if (groupIds.length) batch.push(db.insert(contactGroupMembers).values(groupIds.map((groupId) => ({ groupId, contactId: id }))));
  }
  await runBatch(batch);
  return getContact(orgId, id);
}

export async function deleteContact(orgId: string, id: string) {
  const row = await requireContact(orgId, id);
  await db.delete(contacts).where(eq(contacts.id, id));
  return out(row);
}

/** The latest threads with a contact, from the mailboxes the viewer may open (lib/server/mail/access.ts). */
export async function contactThreads(orgId: string, id: string, boxIds: string[]) {
  const c = await requireContact(orgId, id);
  const emails = c.emails.map((e) => e.value).slice(0, 10);
  if (!emails.length || !boxIds.length) return { threads: [] };
  const threads = await db
    .select({ id: mailThreads.id, subject: mailThreads.subject, mailbox: mailboxes.address, unread: mailThreads.unread, lastMessageAt: mailThreads.lastMessageAt })
    .from(mailThreads)
    .innerJoin(mailboxes, eq(mailboxes.id, mailThreads.mailboxId))
    .where(and(inArray(mailThreads.mailboxId, boxIds.slice(0, 80)), inArray(mailThreads.contactEmail, emails), isNull(mailThreads.trashedAt), eq(mailThreads.spam, false)))
    .orderBy(desc(mailThreads.lastMessageAt))
    .limit(6);
  return { threads: threads.map((t) => ({ ...t, lastMessageAt: t.lastMessageAt.toISOString() })) };
}

// ---- Groups ----

export async function listGroups(orgId: string) {
  return db
    .select({ id: contactGroups.id, name: contactGroups.name, count: sql<number>`(SELECT count(*) FROM ${contactGroupMembers} WHERE ${contactGroupMembers.groupId} = ${contactGroups.id})` })
    .from(contactGroups)
    .where(eq(contactGroups.orgId, orgId))
    .orderBy(asc(contactGroups.name));
}

async function requireGroup(orgId: string, id: string) {
  const [g] = await db.select().from(contactGroups).where(and(eq(contactGroups.id, id), eq(contactGroups.orgId, orgId)));
  if (!g) throw new HttpError(404, "Not found");
  return g;
}

export async function createGroup(orgId: string, name: string) {
  const [g] = await db.insert(contactGroups).values({ orgId, name }).returning();
  return { id: g!.id, name: g!.name, count: 0 };
}

export async function renameGroup(orgId: string, id: string, name: string) {
  await requireGroup(orgId, id);
  await db.update(contactGroups).set({ name }).where(eq(contactGroups.id, id));
  return (await listGroups(orgId)).find((g) => g.id === id)!;
}

export async function deleteGroup(orgId: string, id: string) {
  const g = await requireGroup(orgId, id);
  await db.delete(contactGroups).where(eq(contactGroups.id, id));
  return g;
}

// ---- Composer suggestions ----

export interface Suggestion {
  /** "Anna Kowalska" or the group's name. */
  label: string;
  emails: string[];
  kind: "contact" | "directory" | "group";
}

export async function suggestContacts(orgId: string, q: string): Promise<Suggestion[]> {
  const pattern = `%${escapeLike(q)}%`;
  const [people, directory, groups] = await Promise.all([
    db
      .select({ email: contactEmails.email, name: contacts.name })
      .from(contactEmails)
      .innerJoin(contacts, eq(contacts.id, contactEmails.contactId))
      .where(and(eq(contactEmails.orgId, orgId), or(sql`${contactEmails.email} LIKE ${pattern} ESCAPE '\\'`, sql`${contacts.name} LIKE ${pattern} ESCAPE '\\'`)))
      .orderBy(desc(contacts.contactCount), desc(contacts.lastContactedAt), asc(contacts.name))
      .limit(8),
    listDirectory(orgId, pattern),
    db
      .select({ id: contactGroups.id, name: contactGroups.name })
      .from(contactGroups)
      .where(and(eq(contactGroups.orgId, orgId), sql`${contactGroups.name} LIKE ${pattern} ESCAPE '\\'`))
      .limit(3),
  ]);
  const groupEmails = await Promise.all(
    groups.map((g) =>
      db
        .select({ emails: contacts.emails })
        .from(contactGroupMembers)
        .innerJoin(contacts, eq(contacts.id, contactGroupMembers.contactId))
        .where(eq(contactGroupMembers.groupId, g.id))
        .limit(200),
    ),
  );
  return [
    ...groups.flatMap((g, i): Suggestion[] => {
      const emails = groupEmails[i]!.flatMap((r) => r.emails.slice(0, 1).map((e) => e.value))
      return emails.length ? [{ label: g.name, emails, kind: "group" }] : []
    }),
    ...people.map((p): Suggestion => ({ label: p.name, emails: [p.email], kind: "contact" })),
    ...directory.slice(0, 5).map((d): Suggestion => ({ label: d.name, emails: [d.email], kind: "directory" })),
  ];
}

// ---- Sent mail ----

/** Adds people the team writes to and keeps their ranking fresh. Called once per stored outgoing mail. */
export async function recordSent(orgId: string, addresses: string[]) {
  const domains = (await db.select({ domain: mailDomains.domain }).from(mailDomains).where(eq(mailDomains.orgId, orgId))).map((d) => d.domain);
  const list = [...new Set(addresses.flatMap((a) => a.split(/[,;\s]+/)).map((a) => normalizeEmail(a) ?? ""))].filter((a) => a && worthRecording(a, domains)).slice(0, 50);
  if (!list.length) return;
  const owners = await ownersOf(orgId, list);
  const now = new Date();
  const known = [...new Set(owners.values())];
  const fresh = list.filter((a) => !owners.has(a));
  const batch: Batch = [];
  for (const part of chunks(known, 90)) batch.push(db.update(contacts).set({ contactCount: sql`${contacts.contactCount} + 1`, lastContactedAt: now }).where(inArray(contacts.id, part)));
  for (const email of fresh) {
    const id = crypto.randomUUID();
    batch.push(db.insert(contacts).values({ id, orgId, emails: [{ value: email }], source: "sent", contactCount: 1, lastContactedAt: now }));
    batch.push(db.insert(contactEmails).values({ orgId, email, contactId: id }));
  }
  await runBatch(batch);
}

// ---- Import / export ----

export async function exportContacts(orgId: string): Promise<ContactFields[]> {
  const [rows, groups] = await Promise.all([db.select().from(contacts).where(eq(contacts.orgId, orgId)).orderBy(asc(contacts.name)), listGroups(orgId)]);
  const names = new Map(groups.map((g) => [g.id, g.name]));
  const members = await db.select({ groupId: contactGroupMembers.groupId, contactId: contactGroupMembers.contactId }).from(contactGroupMembers).innerJoin(contactGroups, eq(contactGroups.id, contactGroupMembers.groupId)).where(eq(contactGroups.orgId, orgId));
  const byContact = new Map<string, string[]>();
  for (const m of members) byContact.set(m.contactId, [...(byContact.get(m.contactId) ?? []), names.get(m.groupId) ?? ""]);
  return rows.map((c) => ({ name: c.name || displayName(c), company: c.company, title: c.title, note: c.note, emails: c.emails, phones: c.phones, groups: byContact.get(c.id) ?? [] }));
}

/**
 * One chunk of an import (the browser parses the file and sends up to 200 at a time, which keeps each request
 * well under D1's query limits). A row whose address is already known is merged into that contact.
 */
export async function importContacts(orgId: string, rows: ContactFields[], createdBy: string | null) {
  const list = rows.map(cleanContact).filter((c) => c.name || c.emails.length || c.phones.length);
  const owners = await ownersOf(orgId, list.flatMap((c) => c.emails.map((e) => e.value)));
  const existingIds = [...new Set(owners.values())];
  const existing = new Map<string, Row>();
  for (const part of chunks(existingIds, 90)) for (const r of await db.select().from(contacts).where(inArray(contacts.id, part))) existing.set(r.id, r);

  // Groups by name, created when missing.
  const groups = new Map((await listGroups(orgId)).map((g) => [g.name.toLowerCase(), g.id]));
  const newGroups = [...new Set(list.flatMap((c) => c.groups ?? []))].filter((n) => !groups.has(n.toLowerCase()));
  for (const name of newGroups) groups.set(name.toLowerCase(), (await createGroup(orgId, name.slice(0, 80))).id);

  const batch: Batch = [];
  const members: { groupId: string; contactId: string }[] = [];
  const taken = new Map(owners);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const c of list) {
    const ownerId = c.emails.map((e) => taken.get(e.value)).find(Boolean);
    const groupIds = (c.groups ?? []).map((n) => groups.get(n.toLowerCase())!).filter(Boolean);
    if (ownerId) {
      const row = existing.get(ownerId);
      if (!row) {
        skipped++; // an earlier row of this same file; merging twice in one go isn't worth it.
        continue;
      }
      const merged = mergeContact({ ...row, groups: [] }, c);
      // Addresses that belong to some other contact stay where they are.
      const emails = merged.emails.filter((e) => (taken.get(e.value) ?? ownerId) === ownerId);
      const add = emails.filter((e) => !taken.has(e.value));
      const { groups: _g, ...fields } = merged;
      batch.push(db.update(contacts).set({ ...fields, emails, updatedAt: new Date() }).where(eq(contacts.id, ownerId)));
      if (add.length) batch.push(db.insert(contactEmails).values(emailRows(orgId, ownerId, add)));
      for (const e of add) taken.set(e.value, ownerId);
      members.push(...groupIds.map((groupId) => ({ groupId, contactId: ownerId })));
      existing.delete(ownerId);
      updated++;
    } else {
      const id = crypto.randomUUID();
      const emails = c.emails.filter((e) => !taken.has(e.value));
      const { groups: _g, ...fields } = c;
      batch.push(db.insert(contacts).values({ id, orgId, ...fields, emails, source: "import", createdBy }));
      if (emails.length) batch.push(db.insert(contactEmails).values(emailRows(orgId, id, emails)));
      for (const e of emails) taken.set(e.value, id);
      members.push(...groupIds.map((groupId) => ({ groupId, contactId: id })));
      created++;
    }
  }
  for (const part of chunks(members, 45)) batch.push(db.insert(contactGroupMembers).values(part).onConflictDoNothing());
  await runBatch(batch);
  return { created, updated, skipped };
}
