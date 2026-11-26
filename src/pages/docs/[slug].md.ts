import type { APIRoute, GetStaticPaths } from "astro";
import { getDocs, type DocEntry } from "@/lib/docs";
import { docMarkdown } from "@/lib/llms";

export const prerender = true;

// Plain Markdown copies of the docs (/docs/<slug>.md) for LLMs and anyone who'd rather read the source. /docs.md is the index.
export const getStaticPaths = (async () =>
  (await getDocs()).filter((doc) => doc.id !== "index").map((doc) => ({ params: { slug: doc.id }, props: { doc } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => docMarkdown((props as { doc: DocEntry }).doc);
