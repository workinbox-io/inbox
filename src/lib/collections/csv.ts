/**
 * Collections to and from CSV (spreadsheets). Pure: the browser parses the file (lib/csv.ts, commas or semicolons) and
 * maps columns to fields by name; the server checks the values (lib/server/collections.ts `importRecords`).
 */
import { csvSafe } from "@/lib/csv";
import { DMY, EMAIL, findField, MAX_FIELDS, NO, YES, valueText, type CollectionField, type FieldInput, type RecordValues } from "./fields";

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** Rows per request, under D1's per-request query limit. */
export const IMPORT_CHUNK = 200;

export type ImportRow = { title: string; values: Record<string, string> };

const TITLE = new Set(["name", "title", "nazwa", "tytuł"]);
const cell = (raw: string) => {
  const s = csvSafe(raw);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Header row → the title column (Name/Title, else the first column no field claims) and one field per known column.
 * Returns the rows that have a title and the columns nothing matched.
 */
export function csvToRows(fields: CollectionField[], table: string[][]): { rows: ImportRow[]; unknown: string[] } {
  const [head = [], ...body] = table;
  const cols = head.map((h) => h.trim());
  const mapped = cols.map((h) => findField(fields, h)?.id ?? null);
  let titleCol = cols.findIndex((h, i) => TITLE.has(h.toLowerCase()) && !mapped[i]);
  if (titleCol < 0) titleCol = mapped.findIndex((m) => m === null);
  const unknown = cols.filter((h, i) => h && i !== titleCol && !mapped[i]);
  const rows: ImportRow[] = [];
  for (const r of body) {
    const title = (r[titleCol] ?? "").trim();
    if (!title) continue;
    const values: Record<string, string> = {};
    mapped.forEach((id, i) => {
      const v = (r[i] ?? "").trim();
      if (id && v) values[id] = v;
    });
    rows.push({ title: title.slice(0, 300), values });
  }
  return { rows, unknown };
}

/** Name, then every field; person fields as e-mails so a file can go back in. */
export function recordsToCsv(fields: CollectionField[], records: { title: string; values: RecordValues }[], people: { id: string; email: string }[]): string {
  const email = new Map(people.map((p) => [p.id, p.email]));
  const head = ["Name", ...fields.map((f) => f.name)];
  const rows = records.map((r) => [r.title, ...fields.map((f) => {
    const v = r.values[f.id];
    if (v === undefined) return "";
    return f.type === "person" ? (email.get(String(v)) ?? "") : valueText(v);
  })]);
  return [head, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const NUMBER = /^-?(\d+|\d{1,3}([ \u00a0]\d{3})+)([.,]\d+)?$/;

/**
 * Fields for a new collection from a spreadsheet: one per column except the title (Name/Title, else the first), typed by
 * what every filled cell looks like: checkbox, number (not codes with leading zeros), date (ISO or 31.12.2026), person
 * (e-mails or names of the org's people), e-mail, link, choice (few values that repeat), else text.
 */
export function inferFields(table: string[][], people: { name: string; email: string }[] = []): { fields: FieldInput[]; skipped: string[] } {
  const [head = [], ...body] = table;
  const cols = head.map((h, i) => h.trim() || `Column ${i + 1}`);
  let titleCol = cols.findIndex((h) => TITLE.has(h.toLowerCase()));
  if (titleCol < 0) titleCol = 0;
  const emails = new Set(people.map((p) => p.email.toLowerCase()));
  const names = new Set(people.map((p) => p.name.toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const fields: FieldInput[] = [];
  const skipped: string[] = [];
  cols.forEach((name, i) => {
    if (i === titleCol) return;
    let unique = name.slice(0, 60);
    for (let n = 2; seen.has(unique.toLowerCase()); n++) unique = `${name.slice(0, 56)} ${n}`;
    seen.add(unique.toLowerCase());
    if (fields.length >= MAX_FIELDS) return void skipped.push(name);
    const vals = body.map((r) => (r[i] ?? "").trim()).filter(Boolean);
    const all = (test: (v: string) => boolean) => vals.length > 0 && vals.every(test);
    const distinct = [...new Set(vals)];
    let field: FieldInput = { name: unique, type: "text" };
    if (all((v) => YES.test(v) || NO.test(v)) && !all((v) => /^[01]$/.test(v))) field = { name: unique, type: "checkbox" };
    else if (all((v) => NUMBER.test(v) && !/^0\d/.test(v))) field = { name: unique, type: "number" };
    else if (all((v) => ISO_DATE.test(v) || DMY.test(v))) field = { name: unique, type: "date" };
    else if (all((v) => emails.has(v.toLowerCase()) || names.has(v.toLowerCase()))) field = { name: unique, type: "person" };
    else if (all((v) => EMAIL.test(v))) field = { name: unique, type: "email" };
    else if (all((v) => /^https?:\/\/\S+$/i.test(v))) field = { name: unique, type: "url" };
    else if (distinct.length <= 12 && distinct.length < vals.length && distinct.every((v) => v.length <= 60)) field = { name: unique, type: "select", options: distinct };
    fields.push(field);
  });
  return { fields, skipped };
}
