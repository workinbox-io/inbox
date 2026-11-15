import { getCollection, type CollectionEntry } from "astro:content";

export const SECTIONS = ["Getting started", "Guides", "Account"] as const;

export type DocEntry = CollectionEntry<"docs">;

export const docHref = (doc: DocEntry) => (doc.id === "index" ? "/docs" : `/docs/${doc.id}`);

export async function getDocs() {
  const docs = await getCollection("docs");
  return docs.sort(
    (a, b) =>
      SECTIONS.indexOf(a.data.section) - SECTIONS.indexOf(b.data.section) || a.data.order - b.data.order,
  );
}

export function neighbours(docs: DocEntry[], current: DocEntry) {
  const i = docs.findIndex((d) => d.id === current.id);
  return { previous: docs[i - 1], next: docs[i + 1] };
}
