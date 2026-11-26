/**
 * Finds the dashboard's translation keys in source code (`t("…")`, `tp(n, { …, other: "…" })`) and compares them
 * with a language's dictionary. Used by scripts/i18n-missing.ts and test/i18n-pl.test.ts. Pure: no imports.
 */

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
// t("…"), msg("…") (texts translated later through t(variable)) and API errors, which handler() (lib/server/api.ts)
// translates: new HttpError(404, "…").
const T_CALL = new RegExp(String.raw`(?:(?<![\w.])(?:t|msg)\(\s*|HttpError\(\d+,\s*)${STR}`, "g");
// `other` is required by the Plural type, so the nearest one belongs to this call ({n} inside the texts rules out [^}]).
const TP_CALL = new RegExp(String.raw`(?<![\w.])tp\([\s\S]*?other:\s*${STR}`, "g");

const unescape = (s: string) => JSON.parse(`"${s}"`) as string;

/** Keys used in one file: plain texts and plural `other` forms (marked `plural: true`). */
export function extractKeys(source: string): { key: string; plural: boolean }[] {
  const out: { key: string; plural: boolean }[] = [];
  for (const m of source.matchAll(T_CALL)) out.push({ key: unescape(m[1]!), plural: false });
  for (const m of source.matchAll(TP_CALL)) out.push({ key: unescape(m[1]!), plural: true });
  return out;
}

/** Dictionary keys a language needs for these uses: the text itself, or `<other>|<category>` per plural category. */
export function neededKeys(uses: { key: string; plural: boolean }[], locale: string): string[] {
  const cats = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  return [...new Set(uses.flatMap((u) => (u.plural ? cats.map((c) => `${u.key}|${c}`) : [u.key])))];
}
