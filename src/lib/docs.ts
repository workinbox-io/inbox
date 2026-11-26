import { DEFAULT_LOCALE, isSiteLocale, localizedPath, type SiteLocale } from "@/lib/i18n/locales";
import { getCollection, type CollectionEntry } from "astro:content";

export const SECTIONS = ["Getting started", "Guides", "Account"] as const;

export type DocEntry = CollectionEntry<"docs">;

/**
 * Translations live in src/content/docs/<code>/ (ids "pl/quickstart"); English ids have no prefix. A folder's index.md
 * gets the folder's id ("pl"), so a bare language code is that language's index.
 */
const LANG_ID = /^([a-z]{2})(?:\/|$)/;
export const docLocale = (doc: DocEntry): SiteLocale => {
  const code = LANG_ID.exec(doc.id)?.[1];
  return isSiteLocale(code) && code !== DEFAULT_LOCALE ? code : DEFAULT_LOCALE;
};
/** The slug without the language: "pl/quickstart" → "quickstart", "pl" → "index". */
export const docSlug = (doc: DocEntry) => (docLocale(doc) === DEFAULT_LOCALE ? doc.id : doc.id.replace(LANG_ID, "") || "index");

export const docHref = (doc: DocEntry) => {
  const slug = docSlug(doc);
  return localizedPath(docLocale(doc), slug === "index" ? "/docs" : `/docs/${slug}`);
};

/** The docs of one language (English by default), sorted by section and order. */
export async function getDocs(locale: SiteLocale = DEFAULT_LOCALE) {
  const docs = (await getCollection("docs")).filter((d) => docLocale(d) === locale);
  return docs.sort(
    (a, b) =>
      SECTIONS.indexOf(a.data.section) - SECTIONS.indexOf(b.data.section) || a.data.order - b.data.order,
  );
}

export function neighbours(docs: DocEntry[], current: DocEntry) {
  const i = docs.findIndex((d) => d.id === current.id);
  return { previous: docs[i - 1], next: docs[i + 1] };
}
