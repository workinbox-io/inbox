/**
 * Contacts' pixel banners: which theme and colour an e-mail domain gets (lib/contacts/banner.ts). Reads the domain's
 * homepage for its title, description and theme-color, asks Jev (typesafe/jev on Workers AI, optionally through the AI
 * Gateway in AI_GATEWAY_ID) three choice questions (theme, main colour, second colour), and keeps the answer in Cloudflare's cache (30 days, a day when no theme was sure). Only company
 * domains are looked up; free mail and anything that fails get the generic banner (`{ theme: null, color: null }`).
 */
import { env } from "cloudflare:workers";
import { BANNER_COLORS, BANNER_THEMES, NO_ACCENT, isLookupDomain, pickProfile, siteHints, type BannerProfile, type ChoiceAnswer } from "@/lib/contacts/banner";

const GENERIC: BannerProfile = { theme: null, color: null, accent: null };
const CACHE_TTL = 30 * 24 * 3600;
const cacheKey = (domain: string) => new Request(`https://contact-banner.workinbox.internal/v2/${encodeURIComponent(domain)}`);

const THEME_CRITERIA = { ...BANNER_THEMES, other: "Anything else, or the domain gives no clue" };
const COLOR_CRITERIA = Object.fromEntries(Object.entries(BANNER_COLORS).map(([k, v]) => [k, v.label]));
const ACCENT_CRITERIA = { ...COLOR_CRITERIA, [NO_ACCENT]: "No second colour: the brand uses one colour" };

/** The homepage's head, within 3 seconds; nothing on any failure. */
async function readSite(domain: string): Promise<Partial<ReturnType<typeof siteHints>>> {
  try {
    const res = await fetch(`https://${domain}/`, {
      redirect: "follow",
      signal: AbortSignal.timeout(3000),
      headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; WorkInboxBot/1.0; +https://workinbox.io)" },
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("html") || !res.body) return {};
    // Only the start of the page: the head is all we read.
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
    return siteHints(html);
  } catch {
    return {};
  }
}

async function askJev(state: Record<string, string>) {
  const input = {
    state,
    questions: {
      industry: { type: "choice", instructions: "Which industry does the company behind this e-mail domain work in?", criteria: THEME_CRITERIA },
      color: { type: "choice", instructions: "What is the main colour of this company's brand (logo, website)?", criteria: COLOR_CRITERIA },
      color2: { type: "choice", instructions: "Besides its main colour, what is the second colour of this company's brand, if it has one?", criteria: ACCENT_CRITERIA },
    },
  };
  const gateway = env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID } } : undefined;
  // typesafe/jev isn't in the generated model list yet, hence the loose type. Called as a method: run needs its `this`.
  const ai = env.AI as unknown as { run(model: string, input: unknown, options?: unknown): Promise<unknown> };
  const out = (await ai.run("typesafe/jev", input, gateway)) as { answers?: Record<string, ChoiceAnswer>; result?: { answers?: Record<string, ChoiceAnswer> } };
  return out.answers ?? out.result?.answers ?? null;
}

/** The banner for a domain (lower case, already checked to be a company domain by the caller). */
export async function domainBanner(domain: string): Promise<BannerProfile> {
  if (!isLookupDomain(domain) || !env.AI) return GENERIC;
  // Workers' default cache (the DOM typings in tsconfig don't know `caches.default`).
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey(domain)).catch(() => undefined);
  if (hit) return (await hit.json()) as BannerProfile;
  let profile = GENERIC;
  try {
    const site = await readSite(domain);
    const state: Record<string, string> = { domain };
    if (site.title) state.site_title = site.title;
    if (site.description) state.site_description = site.description;
    profile = pickProfile(await askJev(state), site.themeColor);
  } catch (e) {
    console.error("[contacts.banner]", domain, e);
    return GENERIC; // not cached: the next view tries again
  }
  // An unsure answer is kept a day only, so a better homepage or prompt gets another go soon.
  const ttl = profile.theme ? CACHE_TTL : 24 * 3600;
  await cache.put(cacheKey(domain), Response.json(profile, { headers: { "cache-control": `public, max-age=${ttl}` } })).catch(() => {});
  return profile;
}

