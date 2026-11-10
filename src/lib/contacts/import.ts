/**
 * Address book files: CSV (Google Contacts and Outlook exports, or any sheet with name/email columns) and
 * vCard 3.0/4.0 in; vCard 3.0 and Google-style CSV out, which these same parsers read back.
 */
import type { ContactValue } from "@/db/schema/contacts";
import { cleanContact, type ContactFields } from "./rules";

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export function parseContactsFile(text: string): ContactFields[] {
  const body = text.replace(/^\uFEFF/, "");
  const rows = /^\s*BEGIN:VCARD/im.test(body) ? parseVcards(body) : parseCsvContacts(body);
  return rows
    .map(cleanContact)
    .filter((c) => c.name || c.emails.length || c.phones.length)
    .slice(0, IMPORT_MAX_ROWS);
}

// ---- CSV ----

/** RFC 4180: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim()));
}

const SYSTEM_GROUP = /^\*\s|^(mycontacts|starred)$/i;

function parseCsvContacts(text: string): ContactFields[] {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const h = head.map((x) => x.trim().toLowerCase());
  const col = (...names: string[]) => names.map((n) => h.indexOf(n)).find((i) => i >= 0) ?? -1;
  const name = col("name", "full name", "display name");
  const first = col("first name", "given name");
  const middle = col("middle name", "additional name");
  const last = col("last name", "family name");
  const company = col("company", "organization name", "organization 1 - name", "organization");
  const title = col("job title", "organization title", "organization 1 - title", "title");
  const note = col("notes", "note");
  const groups = col("labels", "group membership", "categories", "groups");
  // "E-mail 1 - Value" + "E-mail 1 - Label"/"Type" (Google), "E-mail 2 Address" (Outlook), "Email" (anything else).
  const valueCols = (kind: RegExp) =>
    h.flatMap((x, i) => {
      if (!kind.test(x) || /(label|type|display name)$/.test(x)) return [];
      const base = x.replace(/\s*-\s*value$/, "");
      const labelCol = h.findIndex((y) => y === `${base} - label` || y === `${base} - type`);
      const fromHeader = base.replace(/e-?mail|phone/g, "").replace(/\b(address|\d+)\b/g, "").replace(/[-\s]+/g, " ").trim();
      return [{ i, labelCol, fromHeader }];
    });
  const emailCols = valueCols(/e-?mail/);
  const phoneCols = valueCols(/phone|mobile|tel\b/);
  const values = (r: string[], cols: ReturnType<typeof valueCols>): ContactValue[] =>
    cols.flatMap(({ i, labelCol, fromHeader }) =>
      // Google puts several values in one cell: "a@x.com ::: b@x.com".
      (r[i] ?? "").split(/\s*:::\s*/).flatMap((value) => {
        const label = (labelCol >= 0 ? r[labelCol]?.replace(/^\*\s*/, "") : fromHeader) || undefined;
        return value.trim() ? [{ value, label }] : [];
      }),
    );
  return rows.map((r) => ({
    name: (name >= 0 && r[name]?.trim()) || [first, middle, last].map((i) => (i >= 0 ? (r[i] ?? "").trim() : "")).filter(Boolean).join(" "),
    company: company >= 0 ? (r[company] ?? "") : "",
    title: title >= 0 ? (r[title] ?? "") : "",
    note: note >= 0 ? (r[note] ?? "") : "",
    emails: values(r, emailCols),
    phones: values(r, phoneCols),
    groups: groups >= 0 ? (r[groups] ?? "").split(/\s*:::\s*|;/).map((g) => g.trim()).filter((g) => g && !SYSTEM_GROUP.test(g)) : [],
  }));
}

const csvField = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(list: ContactFields[]): string {
  const emails = Math.max(1, ...list.map((c) => c.emails.length));
  const phones = Math.max(1, ...list.map((c) => c.phones.length));
  const pairs = (kind: string, n: number) => Array.from({ length: n }, (_, i) => [`${kind} ${i + 1} - Label`, `${kind} ${i + 1} - Value`]).flat();
  const head = ["Name", "Organization Name", "Organization Title", "Notes", "Labels", ...pairs("E-mail", emails), ...pairs("Phone", phones)];
  const cells = (vals: ContactValue[], n: number) => Array.from({ length: n }, (_, i) => [vals[i]?.label ?? "", vals[i]?.value ?? ""]).flat();
  const rows = list.map((c) => [c.name, c.company, c.title, c.note, (c.groups ?? []).join(" ::: "), ...cells(c.emails, emails), ...cells(c.phones, phones)]);
  return [head, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

// ---- vCard ----

const unescapeV = (s: string) => s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
const escapeV = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
/** Splits on separators that aren't escaped. */
const splitV = (s: string, sep: string) => s.split(new RegExp(`(?<!\\\\)${sep}`)).map(unescapeV);

const LABELS = new Set(["work", "home", "cell", "mobile", "other", "main", "fax", "pager"]);

// shortcut: vCard 2.1 QUOTED-PRINTABLE and BASE64 values are taken as-is; decode them if old Outlook/Nokia exports show up.
function parseVcards(text: string): ContactFields[] {
  const lines = text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: ContactFields[] = [];
  let card: (ContactFields & { n?: string }) | null = null;
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [rawName = "", ...params] = line.slice(0, colon).split(";");
    const prop = rawName.replace(/^.*\./, "").toUpperCase();
    const value = line.slice(colon + 1);
    if (prop === "BEGIN" && value.toUpperCase() === "VCARD") card = { name: "", company: "", title: "", note: "", emails: [], phones: [], groups: [] };
    if (!card) continue;
    const types = params
      .flatMap((p) => (p.toUpperCase().startsWith("TYPE=") ? p.slice(5) : p.includes("=") ? "" : p).split(","))
      .map((x) => x.replace(/"/g, "").toLowerCase())
      .filter((x) => LABELS.has(x));
    const label = types[0] === "cell" ? "mobile" : types[0];
    if (prop === "FN") card.name = unescapeV(value);
    else if (prop === "N") {
      const [family = "", given = "", additional = ""] = splitV(value, ";");
      card.n = [given, additional, family].filter(Boolean).join(" ");
    }
    else if (prop === "EMAIL") card.emails.push({ value: unescapeV(value), label });
    else if (prop === "TEL") card.phones.push({ value: unescapeV(value).replace(/^tel:/i, ""), label });
    else if (prop === "ORG") card.company = splitV(value, ";")[0] ?? "";
    else if (prop === "TITLE") card.title = unescapeV(value);
    else if (prop === "NOTE") card.note = unescapeV(value);
    else if (prop === "CATEGORIES") card.groups!.push(...splitV(value, ","));
    else if (prop === "END" && value.toUpperCase() === "VCARD") {
      const { n, ...rest } = card;
      out.push({ ...rest, name: rest.name || n || "" });
      card = null;
    }
  }
  return out;
}

export function toVcards(list: ContactFields[]): string {
  const typed = (prop: string, v: ContactValue) => `${prop}${v.label ? `;TYPE=${v.label === "mobile" ? "cell" : v.label}` : ""}:${escapeV(v.value)}`;
  return list
    .map((c) =>
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${escapeV(c.name || c.emails[0]?.value || "")}`,
        `N:${escapeV(c.name.split(" ").slice(1).join(" "))};${escapeV(c.name.split(" ")[0] ?? "")};;;`,
        ...c.emails.map((e) => typed("EMAIL", e)),
        ...c.phones.map((p) => typed("TEL", p)),
        c.company && `ORG:${escapeV(c.company)}`,
        c.title && `TITLE:${escapeV(c.title)}`,
        c.note && `NOTE:${escapeV(c.note)}`,
        c.groups?.length && `CATEGORIES:${c.groups.map(escapeV).join(",")}`,
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\r\n"),
    )
    .join("\r\n") + "\r\n";
}
