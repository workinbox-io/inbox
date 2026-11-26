import { env } from "cloudflare:workers";
import type { ClientSetup } from "@/lib/mail/rules";

interface Domain { domain: string; kind: string; provider: string }

/**
 * Hosted mail apps' autodiscovery for orgs' own domains: autoconfig.<domain> is a Cloudflare for SaaS custom hostname
 * on MAIL_BASE_DOMAIN's zone (fallback origin MAIL_SETUP_ORIGIN), so it gets a certificate and reaches the Worker.
 * Uses MAIL_ZONE_TOKEN, which needs "SSL and Certificates: Edit" on that zone (docs/ses.md). Never fails mail setup.
 */
export function clientSetup(d: Domain): ClientSetup | null {
  if (!env.MAIL_CLIENT_HOST || d.provider !== "ses") return null;
  if (d.kind === "subdomain") return { subdomain: true };
  return env.MAIL_SETUP_ORIGIN ? { origin: env.MAIL_SETUP_ORIGIN } : null;
}

const on = (d: Domain) => !!(clientSetup(d) && "origin" in clientSetup(d)! && env.MAIL_ZONE_TOKEN && env.MAIL_BASE_DOMAIN);

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { authorization: `Bearer ${env.MAIL_ZONE_TOKEN}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message: string }[] };
  if (!res.ok || !data.success) throw new Error(data.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`);
  return data.result as T;
}

let zoneId: string | undefined;
async function zone() {
  zoneId ??= (await call<{ id: string }[]>("GET", `/zones?name=${env.MAIL_BASE_DOMAIN}`))[0]?.id;
  if (!zoneId) throw new Error(`No access to the ${env.MAIL_BASE_DOMAIN} zone`);
  return zoneId;
}

const find = async (hostname: string) => (await call<{ id: string }[]>("GET", `/zones/${await zone()}/custom_hostnames?hostname=${hostname}`))[0];

export async function ensureClientHostname(d: Domain) {
  if (!on(d)) return;
  const hostname = `autoconfig.${d.domain}`;
  try {
    if (await find(hostname)) return;
    await call("POST", `/zones/${await zone()}/custom_hostnames`, { hostname, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } });
  } catch (e) {
    console.error("[custom-hostnames] create failed", hostname, e instanceof Error ? e.message : e);
  }
}

export async function removeClientHostname(d: Domain) {
  if (!on(d)) return;
  const hostname = `autoconfig.${d.domain}`;
  try {
    const found = await find(hostname);
    if (found) await call("DELETE", `/zones/${await zone()}/custom_hostnames/${found.id}`);
  } catch (e) {
    console.error("[custom-hostnames] delete failed", hostname, e instanceof Error ? e.message : e);
  }
}
