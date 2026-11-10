import { handler, json } from "@/lib/server/api";
import { domainBanner } from "@/lib/server/contacts-banner";
import { bannerSeed } from "@/components/contacts/pixel-banner";

/** The pixel banner for an address: ?email= → { seed, theme, color }. Free mail never leaves the server. */
export const GET = handler(async (ctx) => {
  const email = (ctx.url.searchParams.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  const seed = bannerSeed(email);
  // bannerSeed keeps the whole address for free mail: those get the generic banner, no lookup.
  const profile = seed && !seed.includes("@") ? await domainBanner(seed) : { theme: null, color: null, accent: null };
  return json({ seed, ...profile }, 200);
});
