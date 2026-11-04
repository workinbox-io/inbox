/**
 * Tiny message helpers, same shape as the widget's copy (components/widget/i18n.ts): the English object
 * is the type, other languages are `Partial<>` of it and fall back to English per key, so a pending
 * translation never blocks typecheck (test/i18n.test.ts lists what is missing).
 */

export type Vars = Record<string, string | number>;

/** "Hi {name}" + { name: "Ola" } → "Hi Ola". Unknown placeholders stay as they are. */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Plural forms keyed by `Intl.PluralRules` categories; `other` is required. */
export type Plural = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

const rules = new Map<string, Intl.PluralRules>();

/** plural("pl", { one: "{n} rozmowa", few: "{n} rozmowy", many: "{n} rozmów", other: "{n} rozmowy" }, 5) → "5 rozmów". */
export function plural(locale: string, forms: Plural, n: number, vars?: Vars): string {
  let r = rules.get(locale);
  if (!r) rules.set(locale, (r = new Intl.PluralRules(locale)));
  const form = forms[r.select(n)] ?? forms.other;
  return fill(form, { n, ...vars });
}

/** English merged with a translation: missing keys (also nested) stay English. */
export function withFallback<T extends object>(en: T, tr: DeepPartial<T> | undefined): T {
  if (!tr) return en;
  const out: Record<string, unknown> = { ...(en as Record<string, unknown>) };
  for (const [k, v] of Object.entries(tr)) {
    const base = (en as Record<string, unknown>)[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && base && typeof base === "object" && !Array.isArray(base)
        ? withFallback(base as object, v as DeepPartial<object>)
        : (v ?? base);
  }
  return out as T;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Dotted keys of an object whose leaves are strings, for "missing translation" checks. */
export function leafKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string" || Array.isArray(obj) || !obj || typeof obj !== "object") return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}

/** The `{x}` placeholders in a string, sorted (a translation must keep the same set). */
export const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
