import { env } from "cloudflare:workers";
import { and, db, eq, mailDomains } from "@/db";
import { autodiscoverEmail, autodiscoverPox, emailDomain, thunderbirdConfig } from "@/lib/mail/autoconfig";

const THUNDERBIRD = /^\/(?:\.well-known\/autoconfig\/)?mail\/config-v1\.1\.xml$/;
const OUTLOOK = /^\/autodiscover\/autodiscover\.xml$/i;

/** Mail apps' autodiscovery paths, served on any host routed to us (custom hostnames, *.workinbox.io). */
export const isAutoconfigPath = (path: string) => THUNDERBIRD.test(path) || OUTLOOK.test(path);

async function served(domain: string | null) {
  if (!domain || !env.MAIL_CLIENT_HOST) return false;
  const [row] = await db.select({ id: mailDomains.id }).from(mailDomains).where(and(eq(mailDomains.domain, domain), eq(mailDomains.status, "active")));
  return !!row;
}

const xml = (body: string) => new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
const notFound = () => new Response("Not found", { status: 404 });

/** Answers only for our active domains, so other hosts' addresses never get our servers. */
export async function autoconfigResponse(request: Request, url: URL) {
  if (THUNDERBIRD.test(url.pathname)) {
    if (request.method !== "GET" && request.method !== "HEAD") return notFound();
    const domain = emailDomain(url.searchParams.get("emailaddress")) ?? url.hostname.replace(/^autoconfig\./, "");
    return (await served(domain)) ? xml(thunderbirdConfig(domain, env.MAIL_CLIENT_HOST!)) : notFound();
  }
  const body = request.method === "POST" ? (await request.text()).slice(0, 16_384) : "";
  const email = autodiscoverEmail(body) ?? url.searchParams.get("email");
  return email && (await served(emailDomain(email))) ? xml(autodiscoverPox(email.trim(), env.MAIL_CLIENT_HOST!)) : notFound();
}
