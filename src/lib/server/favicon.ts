/**
 * Company favicons for avatars, fetched by the server so opening mail never contacts the sender's site from the
 * browser. Reads the homepage head for apple-touch-icon / icon links (lib/sender-logo.ts), falls back to /favicon.ico,
 * keeps raster images under 200 KB only, and caches hits for 7 days and misses for a day in Cloudflare's cache.
 */
import { isLookupDomain } from "@/lib/contacts/banner";
import { FREE_MAIL, iconCandidates } from "@/lib/sender-logo";

const UA = { "user-agent": "Mozilla/5.0 (compatible; WorkInboxBot/1.0; +https://workinbox.io)" };
const MAX = 200_000;
const cacheKey = (domain: string) => new Request(`https://favicon.workinbox.internal/v1/${encodeURIComponent(domain)}`);
const headers = (ttl: number, type?: string) => ({
  "cache-control": `public, max-age=${ttl}`,
  "content-security-policy": "default-src 'none'; sandbox",
  "x-content-type-options": "nosniff",
  ...(type ? { "content-type": type } : {}),
});

async function homepageHead(domain: string): Promise<{ html: string; base: string }> {
  try {
    const res = await fetch(`https://${domain}/`, { redirect: "follow", signal: AbortSignal.timeout(3000), headers: { accept: "text/html", ...UA } });
    if (!res.ok || !res.headers.get("content-type")?.includes("html") || !res.body) return { html: "", base: `https://${domain}/` };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < 64_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    void reader.cancel().catch(() => {});
    return { html, base: res.url || `https://${domain}/` };
  } catch {
    return { html: "", base: `https://${domain}/` };
  }
}

async function fetchIcon(url: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(3000), headers: { accept: "image/*", ...UA } });
    const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!res.ok || !type.startsWith("image/") || type.includes("svg")) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX) return null;
    const body = await res.arrayBuffer();
    return body.byteLength > 64 && body.byteLength <= MAX ? { body, type } : null;
  } catch {
    return null;
  }
}

/** The favicon of a company domain as an image response, or a cached empty 204 (no console error for a miss). */
export async function domainFavicon(domain: string): Promise<Response> {
  if (!isLookupDomain(domain) || FREE_MAIL.has(domain)) return new Response(null, { status: 204, headers: headers(86400) });
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey(domain)).catch(() => undefined);
  if (hit) return hit;
  const { html, base } = await homepageHead(domain);
  let res = new Response(null, { status: 204, headers: headers(86400) });
  for (const url of iconCandidates(html, base)) {
    const icon = await fetchIcon(url);
    if (icon) {
      res = new Response(icon.body, { headers: headers(7 * 86400, icon.type) });
      break;
    }
  }
  await cache.put(cacheKey(domain), res.clone()).catch(() => {});
  return res;
}
