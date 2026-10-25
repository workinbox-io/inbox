import { CURRENCY, PLAN_LIST, TRIAL_DAYS } from "@/config/plans";
import { siteConfig } from "@/config/site";
import { SECTIONS, docHref, getDocs, type DocEntry } from "@/lib/docs";

const markdown = (body: string) => new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });

/** A doc page as Markdown: its title and description, then the source as written. */
export function docMarkdown(doc: DocEntry) {
  const updated = doc.data.updated.toISOString().slice(0, 10);
  return markdown(`# ${doc.data.title}\n\n> ${doc.data.description}\n\nUpdated ${updated}\n\n${doc.body?.trim() ?? ""}\n`);
}

/** /llms.txt (llmstxt.org): what the product is, the facts people ask about, and where the details are. */
export async function llmsTxt(site: URL) {
  const url = (path: string) => new URL(path, site).href;
  const link = (href: string, title: string, note?: string) => `- [${title}](${url(href)})${note ? `: ${note}` : ""}`;
  const limit = (n: number | null, what: string) => `${n === null ? "unlimited" : n} ${what}`;
  const plans = PLAN_LIST.map(
    (p) => `- ${p.name}: ${p.priceMonthly / 100} ${CURRENCY} a month, ${limit(p.projects, "projects")}, ${limit(p.members, "team members")}`,
  );
  const docs = await getDocs();

  const body = [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description}`,
    "",
    "Key facts:",
    "",
    ...plans,
    `- Prices exclude VAT. Yearly billing gives two months free. ${TRIAL_DAYS}-day free trial, no card needed.`,
    "- REST API with an OpenAPI 3.1 spec.",
    "",
    "## Product",
    "",
    link("/", "Home", "overview, features and FAQ"),
    link("/pricing", "Pricing", "plans and limits"),
    "",
    "## Docs",
    "",
    ...SECTIONS.flatMap((section) =>
      docs.filter((d) => d.data.section === section).map((d) => link(`${docHref(d)}.md`, d.data.title, d.data.description)),
    ),
    "",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
