import { and, db, eq, mailDomains } from "@/db";
import { handler } from "@/lib/server/api";
import { domainFavicon } from "@/lib/server/favicon";

/** ?domain= → the company's favicon (lib/server/favicon.ts). The org's own domains get an empty 204: teammates keep avatars. */
export const GET = handler(async (ctx) => {
  const domain = (ctx.url.searchParams.get("domain") ?? "").trim().toLowerCase().slice(0, 253);
  const [own] = await db.select({ id: mailDomains.id }).from(mailDomains).where(and(eq(mailDomains.orgId, ctx.orgId), eq(mailDomains.domain, domain))).limit(1);
  if (own) return new Response(null, { status: 204, headers: { "cache-control": "private, max-age=86400" } });
  const res = await domainFavicon(domain);
  // Per viewer in the browser: whether a domain is "own" depends on the org.
  const out = new Response(res.body, res);
  out.headers.set("cache-control", "private, max-age=86400");
  return out;
});
