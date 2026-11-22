/**
 * A pixel banner behind a contact's avatar, drawn with the marketing site's pixel kit (components/site/pixel). The
 * server picks a theme and brand colour for the e-mail domain (/api/app/contacts/banner, Jev on Workers AI); the scene
 * itself is drawn here (banner-scenes.ts), placed by the domain's hash so everyone at one company shares a banner.
 * Free mail uses the whole address and always gets a generic scene. Static, redrawn when the theme changes.
 */
import * as React from "react"
import { Pix, dithered, palette, type Palette } from "@/components/site/pixel/pixel"
import type { BannerHue, BannerProfile } from "@/lib/contacts/banner"
import { drawScene, H, W } from "./banner-scenes"

import { FREE_MAIL } from "@/lib/sender-logo"

/** The string a banner is drawn from: the domain, or the address on free mail. */
export function bannerSeed(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? email
  return FREE_MAIL.has(domain) ? email.toLowerCase() : domain
}

export function hashSeed(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const hsl = (h: number, s: number, l: number) => {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * Six steps from the background to the brand colour (pale on the light theme, deep on the dark one), and the second
 * colour in `a` (solid) and `b` (a tint); without one, `a` and `b` stay steps 4 and 2.
 */
export function bannerPalette(color: BannerHue, accent: BannerHue | null, dark: boolean): Palette {
  const { hue, sat } = color
  // Yellow goes olive at the usual lightness: lift and saturate it around 50°.
  const yellow = Math.max(0, 1 - Math.abs(hue - 50) / 25)
  const base = dark
    ? palette(hsl(hue, sat * 0.6, 0.09), hsl(hue, Math.min(0.85, sat + 0.15), 0.7), "#0a0a0a")
    : palette(hsl(hue, Math.min(0.7, sat + 0.05), 0.97), hsl(hue, yellow > 0 ? Math.min(0.9, sat + 0.2 * yellow) : sat * 0.95, 0.42 + 0.08 * yellow), "#ffffff")
  if (!accent) return base
  const s = Math.min(0.9, accent.sat + 0.15)
  return { ...base, a: hsl(accent.hue, s, dark ? 0.62 : 0.52), b: hsl(accent.hue, s, dark ? 0.28 : 0.82) }
}

/** Dithers the bottom rows away to transparent, so the banner melts into whatever the page colour is. */
function fadeOut(ctx: CanvasRenderingContext2D, rows = 16) {
  for (let y = H - rows; y < H; y++) {
    const l = (y - (H - rows)) / rows
    for (let x = 0; x < W; x++) if (dithered(l, x, y)) ctx.clearRect(x, y, 1, 1)
  }
}

/** Canvas pixels per scene pixel: enough for the side that is cropped least (object-cover on phones). */
const scale = (c: HTMLCanvasElement) => Math.min(16, Math.max(1, Math.ceil(Math.max(c.clientWidth / W, c.clientHeight / H) * devicePixelRatio)))

const GENERIC: BannerProfile = { theme: null, color: null, accent: null }
/** One request per domain per tab. */
const profiles = new Map<string, Promise<BannerProfile>>()
function loadProfile(email: string, seed: string) {
  if (seed.includes("@") || !email.includes("@")) return Promise.resolve(GENERIC)
  let p = profiles.get(seed)
  if (!p) {
    p = fetch(`/api/app/contacts/banner?email=${encodeURIComponent(email)}`)
      .then((r) => (r.ok ? (r.json() as Promise<BannerProfile>) : GENERIC))
      .catch(() => GENERIC)
    profiles.set(seed, p)
  }
  return p
}

export function PixelBanner({ email }: { email: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const seed = bannerSeed(email)
    const n = hashSeed(seed)
    let profile: BannerProfile | null = null
    let live = true
    const draw = () => {
      if (!profile) return
      // A whole multiple of the scene, so every pixel is the same size on screen.
      const k = scale(canvas)
      canvas.width = W * k
      canvas.height = H * k
      ctx.setTransform(k, 0, 0, k, 0, 0)
      ctx.imageSmoothingEnabled = false
      drawScene(new Pix(ctx, W, H, bannerPalette(profile.color ?? { hue: n % 360, sat: 0.55 }, profile.accent, document.documentElement.classList.contains("dark"))), n, profile.theme)
      fadeOut(ctx)
    }
    setReady(false)
    void loadProfile(email, seed).then((p) => {
      if (!live) return
      profile = p
      draw()
      setReady(true)
    })
    const resize = new ResizeObserver(() => {
      if (canvas.width !== W * scale(canvas)) draw()
    })
    resize.observe(canvas)
    const theme = new MutationObserver(draw)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => {
      live = false
      resize.disconnect()
      theme.disconnect()
    }
  }, [email])
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="block aspect-[240/56] min-h-32 w-full object-cover transition-opacity duration-500 [image-rendering:pixelated]"
      style={{ opacity: ready ? 1 : 0 }}
    />
  )
}
