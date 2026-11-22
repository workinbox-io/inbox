// Simple Icons (CC0), served locally so opening mail never contacts a logo provider.
const LOGOS: Record<string, string> = {
  "github.com": "github",
  "stripe.com": "stripe",
  "vercel.com": "vercel",
  "linear.app": "linear",
  "figma.com": "figma",
  "notion.so": "notion",
  "notion.com": "notion",
  "discord.com": "discord",
  "discordapp.com": "discord",
  "dropbox.com": "dropbox",
  "cloudflare.com": "cloudflare",
}

export function senderLogo(email: string): string | undefined {
  const domain = /^[^\s@]+@([a-z0-9.-]+)$/i.exec(email.trim())?.[1]?.toLowerCase()
  if (!domain) return
  const brand = Object.keys(LOGOS).find((host) => domain === host || domain.endsWith(`.${host}`))
  return brand ? `/logos/senders/${LOGOS[brand]}.svg` : undefined
}

/** Free mail: the provider's icon says nothing about the person, so they keep their avatar. */
export const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "gmx.com", "wp.pl", "o2.pl", "onet.pl", "interia.pl"])

/** A known logo, else the company's favicon through our own server (api/app/favicon); none for free mail. */
export function senderIcon(email: string): string | undefined {
  const logo = senderLogo(email)
  if (logo) return logo
  const domain = /^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,63})$/i.exec(email.trim())?.[1]?.toLowerCase()
  // Reserved names (RFC 2606: example, test, invalid, localhost) have no site to read.
  if (!domain || FREE_MAIL.has(domain) || /(^|\.)(example|test|invalid|localhost)$|^example\.(com|net|org)$/.test(domain)) return
  return `/api/app/favicon?domain=${encodeURIComponent(domain)}`
}

/** Icon URLs a homepage head names, biggest first (apple-touch-icon, then icon), then /favicon.ico. SVG left out. */
export function iconCandidates(html: string, base: string): string[] {
  const links = [...html.slice(0, 64_000).matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
  const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag)?.[1]?.trim()
  const pick = (re: RegExp) => links.filter((l) => re.test(attr(l, "rel") ?? "")).map((l) => attr(l, "href")).filter((h): h is string => !!h && !/\.svg(\?|#|$)/i.test(h))
  const out: string[] = []
  for (const href of [...pick(/apple-touch-icon/i), ...pick(/(^|\s)icon(\s|$)/i), "/favicon.ico"]) {
    try {
      const url = new URL(href.replace(/&amp;/g, "&"), base)
      if (url.protocol === "https:" || url.protocol === "http:") out.push(url.href)
    } catch {}
  }
  return [...new Set(out)].slice(0, 4)
}
