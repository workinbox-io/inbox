/** Pure rules of the team address book: addresses, cleaning input, merging duplicates (lib/server/contacts.ts). */
import type { ContactValue } from "@/db/schema/contacts";

export const MAX_VALUES = 10;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

export interface ContactFields {
  name: string;
  company: string;
  title: string;
  note: string;
  emails: ContactValue[];
  phones: ContactValue[];
  /** Group names (import) — resolved to ids on the server. */
  groups?: string[];
}

export const normalizeEmail = (s: string) => {
  const e = s.trim().toLowerCase().replace(/^mailto:/, "");
  return EMAIL.test(e) ? e : null;
};

/** Trims everything, drops invalid and repeated addresses and empty phones. */
export function cleanContact(c: Partial<ContactFields>): ContactFields {
  const seen = new Set<string>();
  const emails: ContactValue[] = [];
  for (const e of c.emails ?? []) {
    const value = normalizeEmail(e.value);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    emails.push(e.label?.trim() ? { value, label: e.label.trim().toLowerCase() } : { value });
  }
  const phones = (c.phones ?? [])
    .map((p) => ({ value: p.value.trim(), label: p.label?.trim().toLowerCase() || undefined }))
    .filter((p, i, all) => p.value && all.findIndex((q) => q.value === p.value) === i)
    .map((p) => (p.label ? p : { value: p.value }));
  return {
    name: (c.name ?? "").trim().slice(0, 200),
    company: (c.company ?? "").trim().slice(0, 200),
    title: (c.title ?? "").trim().slice(0, 200),
    note: (c.note ?? "").trim().slice(0, 5000),
    emails: emails.slice(0, MAX_VALUES),
    phones: phones.slice(0, MAX_VALUES),
    groups: [...new Set((c.groups ?? []).map((g) => g.trim()).filter(Boolean))],
  };
}

/** Machines and our own people are not worth an address-book entry. */
export function worthRecording(address: string, ownDomains: string[]) {
  const domain = address.split("@")[1] ?? "";
  if (ownDomains.includes(domain)) return false;
  return !/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?)([+.-]|@)/.test(address);
}

/** An import row onto an existing contact: empty fields are filled, addresses and phones added, nothing removed. */
export function mergeContact(existing: ContactFields, incoming: ContactFields): ContactFields {
  return cleanContact({
    name: existing.name || incoming.name,
    company: existing.company || incoming.company,
    title: existing.title || incoming.title,
    note: existing.note || incoming.note,
    emails: [...existing.emails, ...incoming.emails],
    phones: [...existing.phones, ...incoming.phones],
    groups: [...(existing.groups ?? []), ...(incoming.groups ?? [])],
  });
}

/** What a contact is called in lists when it has no name. */
export const displayName = (c: { name: string; emails: ContactValue[] }) => c.name || c.emails[0]?.value.split("@")[0] || "";
