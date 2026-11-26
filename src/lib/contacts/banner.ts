/**
 * What a contact's pixel banner shows (components/contacts/pixel-banner.tsx): an industry theme and a brand colour for
 * the e-mail domain. lib/server/contacts-banner.ts asks Jev (typesafe/jev on Workers AI) two choice questions with
 * these labels; the thresholds below decide when its answers are trusted. Pure, shared by the server and the browser.
 */

/** Industry themes, each its own pixel scene. The descriptions are what Jev reads. */
export const BANNER_THEMES = {
  airline: "Airlines, airports, aviation",
  bank: "Banks, payments, insurance, investing, accounting",
  tech: "Software, SaaS, IT, telecom, hardware",
  retail: "Shops, e-commerce, fashion, consumer brands",
  food: "Restaurants, cafés, food and drink producers, catering",
  health: "Healthcare, clinics, pharma, wellness, fitness",
  education: "Schools, universities, courses, research",
  logistics: "Shipping, couriers, freight, transport, automotive",
  construction: "Construction, architecture, real estate, property",
  energy: "Energy, utilities, oil and gas, renewables, mining",
  media: "Media, publishing, marketing, design, entertainment, music",
  travel: "Hotels, travel agencies, tourism, events",
} as const;
export type BannerTheme = keyof typeof BANNER_THEMES;

/** Brand colour families and the hue (and saturation) each is drawn in. */
export const BANNER_COLORS = {
  red: { label: "Red", hue: 4, sat: 0.6 },
  orange: { label: "Orange", hue: 26, sat: 0.65 },
  yellow: { label: "Yellow or gold", hue: 45, sat: 0.7 },
  green: { label: "Green", hue: 135, sat: 0.45 },
  teal: { label: "Teal or turquoise", hue: 175, sat: 0.5 },
  blue: { label: "Blue or navy", hue: 215, sat: 0.6 },
  purple: { label: "Purple or violet", hue: 265, sat: 0.5 },
  pink: { label: "Pink or magenta", hue: 325, sat: 0.55 },
  brown: { label: "Brown or beige", hue: 28, sat: 0.3 },
  gray: { label: "Black, gray or no clear brand colour", hue: 220, sat: 0.06 },
} as const;
export type BannerColor = keyof typeof BANNER_COLORS;

/** "No second colour", as a label for Jev's second-colour question. */
export const NO_ACCENT = "none";

/** Below these, Jev's answer is a guess: the theme falls back to a generic scene, the colour to the domain's hash. */
export const THEME_MIN_CONFIDENCE = 0.4;
export const COLOR_MIN_CONFIDENCE = 0.5;

export type BannerHue = { hue: number; sat: number };

export interface BannerProfile {
  /** null: one of the generic scenes (skyline, hills, tiles) picked by the hash. */
  theme: BannerTheme | null;
  /** Hue 0–360 and saturation 0–1, or null for the domain's hash colour. */
  color: BannerHue | null;
  /** The brand's second colour (IKEA's yellow next to its blue), or null for one-colour brands. */
  accent: BannerHue | null;
}

export interface ChoiceAnswer {
  choice?: string;
  confidence?: number;
}

/** Hue and saturation of a #rgb / #rrggbb colour, or null when it isn't one (or is too grey to tint with). */
export function hexHue(hex: string | null | undefined): BannerHue | null {
  const m = hex?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  // White, black and greys say nothing about the brand.
  if (d < 0.08 || l > 0.95 || l < 0.05) return null;
  const sat = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { hue: Math.round(hue * 60), sat: Math.min(0.75, Math.max(0.3, sat)) };
}

const family = (a: ChoiceAnswer | undefined): (typeof BANNER_COLORS)[BannerColor] | null =>
  a?.choice && a.choice in BANNER_COLORS && (a.confidence ?? 0) >= COLOR_MIN_CONFIDENCE ? BANNER_COLORS[a.choice as BannerColor] : null;
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Jev's answers plus the site's own theme-color, into what the banner draws. */
export function pickProfile(answers: { industry?: ChoiceAnswer; color?: ChoiceAnswer; color2?: ChoiceAnswer } | null, themeColor?: string | null): BannerProfile {
  const industry = answers?.industry;
  const theme =
    industry?.choice && industry.choice in BANNER_THEMES && (industry.confidence ?? 0) >= THEME_MIN_CONFIDENCE ? (industry.choice as BannerTheme) : null;
  const main = family(answers?.color);
  const color = hexHue(themeColor) ?? (main ? { hue: main.hue, sat: main.sat } : null);
  // A second colour only when it's sure and clearly different from the first (grey never counts as one).
  const second = answers?.color2?.choice === NO_ACCENT || answers?.color2?.choice === "gray" ? null : family(answers?.color2);
  const accent = second && color && hueGap(second.hue, color.hue) >= 30 ? { hue: second.hue, sat: second.sat } : null;
  return { theme, color, accent };
}

/** A hostname worth looking up: letters, digits, dots and dashes, with a dot, no IP literal. */
export const isLookupDomain = (d: string) => /^(?=.{4,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(d) && !/^\d+(\.\d+){3}$/.test(d);

/** Title, description and theme-color from the start of a homepage, for Jev and the colour. */
export function siteHints(html: string) {
  const head = html.slice(0, 64_000);
  const meta = (name: string) =>
    head.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']{1,300})["']`, "i"))?.[1] ??
    head.match(new RegExp(`<meta[^>]+content=["']([^"']{1,300})["'][^>]*(?:name|property)=["']${name}["']`, "i"))?.[1];
  const clean = (s: string | undefined) => s?.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim().slice(0, 200) || undefined;
  return {
    title: clean(head.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1] ?? meta("og:title")),
    description: clean(meta("description") ?? meta("og:description")),
    themeColor: meta("theme-color")?.trim(),
  };
}
