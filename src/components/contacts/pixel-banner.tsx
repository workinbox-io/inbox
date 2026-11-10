/**
 * A pixel banner behind a contact's avatar, drawn with the marketing site's pixel kit (components/site/pixel). The
 * picture and its accent colour come from the e-mail domain, so everyone at one company shares a banner; free mail
 * providers use the whole address instead. Static (no animation), redrawn when the theme changes.
 */
import * as React from "react"
import { Pix, dithered, palette, random, type Palette } from "@/components/site/pixel/pixel"

const W = 240
const H = 56
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "gmx.com", "wp.pl", "o2.pl", "onet.pl", "interia.pl"])

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

/** Six steps from the background to the domain's accent: pale on the light theme, deep on the dark one. */
export function bannerPalette(seed: number, dark: boolean): Palette {
  const hue = seed % 360
  return dark ? palette(hsl(hue, 0.35, 0.09), hsl(hue, 0.75, 0.72), "#0a0a0a") : palette(hsl(hue, 0.6, 0.97), hsl(hue, 0.55, 0.42), "#ffffff")
}

/** Three motifs; the seed picks one and places everything in it. */
export function drawBanner(p: Pix, seed: number) {
  const rnd = random(seed)
  // Other bits than the hue's, so the motif doesn't follow the colour.
  const kind = (seed >>> 12) % 3
  // Sky: a dithered gradient from the background down to a light tint.
  p.dither(0, 0, W, H, "0", "1", (_x, y) => y / H)
  if (kind === 0) {
    // An office skyline at dusk: towers with lit windows.
    for (let i = 0; i < 40; i++) p.dot(Math.floor(rnd() * W), Math.floor(rnd() * H * 0.5), rnd() > 0.7 ? "3" : "2")
    for (let x = -4; x < W; ) {
      const w = 10 + Math.floor(rnd() * 16)
      const h = 14 + Math.floor(rnd() * 30)
      const tone = rnd() > 0.5 ? "3" : "4"
      p.rect(x, H - h, w, h, tone)
      for (let wy = H - h + 3; wy < H - 3; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (rnd() > 0.55) p.dot(wx, wy, rnd() > 0.85 ? "w" : "1")
      if (rnd() > 0.7) p.rect(x + Math.floor(w / 2), H - h - 4, 1, 4, tone)
      x += w + (rnd() > 0.6 ? 2 : 0)
    }
  } else if (kind === 1) {
    // Hills under a big sun.
    const sx = 30 + Math.floor(rnd() * (W - 60))
    const sy = 14 + Math.floor(rnd() * 10)
    for (let y = 0; y < H; y++)
      for (let x = sx - 22; x <= sx + 22; x++) {
        const d = Math.hypot(x - sx, y - sy)
        if (d <= 9) p.dot(x, y, "w")
        else if (d < 22 && dithered((1 - (d - 9) / 13) * 0.6, x, y)) p.dot(x, y, "2")
      }
    for (const [tone, base, amp] of [["2", 30, 8], ["3", 38, 7], ["4", 46, 5]] as const) {
      const f1 = 0.02 + rnd() * 0.03
      const f2 = 0.05 + rnd() * 0.05
      const ph = rnd() * 10
      for (let x = 0; x < W; x++) {
        const top = Math.round(base + Math.sin(x * f1 + ph) * amp + Math.sin(x * f2 + ph * 2) * (amp / 2))
        p.rect(x, top, 1, H - top, tone)
      }
    }
  } else {
    // A calm quilt: a few large tiles in the domain's colour, some with a dithered half.
    const size = 12
    for (let by = 0; by < H; by += size)
      for (let bx = 0; bx < W; bx += size) {
        const r = rnd()
        if (r < 0.62) continue
        const tone = r > 0.94 ? "4" : r > 0.8 ? "3" : "2"
        if (r > 0.88) p.dither(bx, by, size, size, "1", tone, (x) => (x - bx < size / 2 ? 1 : 0.5))
        else p.rect(bx, by, size, size, tone)
      }
  }
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

export function PixelBanner({ seed }: { seed: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const n = hashSeed(seed)
    const draw = () => {
      // A whole multiple of the scene, so every pixel is the same size on screen.
      const k = scale(canvas)
      canvas.width = W * k
      canvas.height = H * k
      ctx.setTransform(k, 0, 0, k, 0, 0)
      ctx.imageSmoothingEnabled = false
      drawBanner(new Pix(ctx, W, H, bannerPalette(n, document.documentElement.classList.contains("dark"))), n)
      fadeOut(ctx)
    }
    draw()
    const resize = new ResizeObserver(() => {
      if (canvas.width !== W * scale(canvas)) draw()
    })
    resize.observe(canvas)
    const theme = new MutationObserver(draw)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => {
      resize.disconnect()
      theme.disconnect()
    }
  }, [seed])
  return <canvas ref={ref} aria-hidden className="block aspect-[240/56] min-h-32 w-full object-cover [image-rendering:pixelated]" />
}
