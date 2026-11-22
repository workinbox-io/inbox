/**
 * The contact banner's pixel scenes (240×56, palette keys from components/site/pixel/pixel.ts): one per industry theme
 * in lib/contacts/banner.ts, plus three generic ones for domains without a confident theme. Keys `a` / `b` are the brand's
 * second colour (awnings, coins, roofs, plane tails…), which falls back to the main colour's tones. Everything is placed by a
 * seeded random, so a domain always gets the same picture. The bottom 16 rows are faded out by the caller.
 */
import type { BannerTheme } from "@/lib/contacts/banner"
import { type ColorKey, type Pix, dithered, random, sprite } from "@/components/site/pixel/pixel"

export const W = 240
export const H = 56
type Rnd = () => number

const int = (rnd: Rnd, a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))

const S = {
  plane: sprite(["aa..............", ".aa......4......", "..4444444444444.", "..44444444444445", ".........4......", "........4......."]),
  coin: sprite([".aaa.", "abbba", "abwba", "abbba", ".aaa."]),
  cup: sprite(["..3..3..", "...3..3.", "........", "4444444.", "4ww4444.", "4444444.", "44444444", ".44444.."]),
  apple: sprite(["...3...", "..3....", ".aa.aa.", "aaaaaaa", "awaaaaa", "aaaaaaa", ".aaaaa."]),
  slice: sprite(["44444444", ".3w33w3.", "..3333..", "..3w3...", "...33...", "...3...."]),
  cross: sprite(["..444..", "..444..", "4444444", "444w444", "4444444", "..444..", "..444.."]),
  heart: sprite([".aa.aa.", "awaaaaa", "aaaaaaa", ".aaaaa.", "..aaa..", "...a..."]),
  cap: sprite([".....5.....", "...55555...", ".555555555.", "...55555..a", "...44444..a", "...44444..a"]),
  note: sprite(["..aaaaa", "..a...a", "..a...a", "aaa.aaa", "aaa.aaa"]),
  play: sprite(["4....", "44...", "444..", "4444.", "444..", "44...", "4...."]),
  boat: sprite(["...4....", "...44...", "...4w4..", "...4ww4.", "...44444", "aaaaaaaa", ".aaaaaa."]),
}

function line(p: Pix, x0: number, y0: number, x1: number, y1: number, c: ColorKey) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) p.dot(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c)
}

const sky = (p: Pix) => p.dither(0, 0, W, H, "0", "1", (_x, y) => y / H)

function sun(p: Pix, sx: number, sy: number, r = 8) {
  for (let y = Math.max(0, sy - r - 12); y < Math.min(H, sy + r + 12); y++)
    for (let x = sx - r - 12; x <= sx + r + 12; x++) {
      const d = Math.hypot(x - sx, y - sy)
      if (d <= r) p.dot(x, y, "w")
      else if (d < r + 12 && dithered((1 - (d - r) / 12) * 0.6, x, y)) p.dot(x, y, "b")
    }
}

function cloud(p: Pix, x: number, y: number, len: number) {
  p.rect(x, y, len, 2, "2")
  p.rect(x + 3, y - 2, len - 8, 2, "2")
  p.rect(x + 6, y - 3, Math.max(2, len - 14), 1, "2")
}

function hills(p: Pix, rnd: Rnd, layers: readonly (readonly [ColorKey, number, number])[]) {
  for (const [tone, base, amp] of layers) {
    const f1 = 0.02 + rnd() * 0.03
    const f2 = 0.05 + rnd() * 0.05
    const ph = rnd() * 10
    for (let x = 0; x < W; x++) {
      const top = Math.round(base + Math.sin(x * f1 + ph) * amp + Math.sin(x * f2 + ph * 2) * (amp / 2))
      p.rect(x, top, 1, H - top, tone)
    }
  }
}

/** Sprites spread over the width in a loose grid. */
function scatter(p: Pix, rnd: Rnd, sprites: (typeof S)[keyof typeof S][], rows: number[], step: number) {
  for (const y of rows) for (let x = int(rnd, 2, step); x < W - 8; x += step + int(rnd, -4, 6)) p.draw(sprites[int(rnd, 0, sprites.length - 1)]!, x, y + int(rnd, -2, 2))
}

// ---- Industry themes ----

const THEMES: Record<BannerTheme, (p: Pix, rnd: Rnd) => void> = {
  airline(p, rnd) {
    sky(p)
    for (let i = 0; i < 6; i++) cloud(p, int(rnd, 0, W - 20), int(rnd, 6, 34), int(rnd, 14, 30))
    for (let i = 0; i < 3; i++) {
      const x = int(rnd, 10 + i * 75, 50 + i * 75)
      const y = int(rnd, 4, 22)
      for (let t = 4; t < 40; t += 2) if (x - t >= 0) p.dot(x - t, y + 3, t % 4 ? "2" : "w")
      p.draw(S.plane, x, y)
      for (let wx = 5; wx < 14; wx += 2) p.dot(x + wx, y + 2, "w")
    }
    p.rect(0, 44, W, H - 44, "3")
    for (let x = 4; x < W; x += 10) p.rect(x, 47, 5, 1, "w")
  },

  bank(p, rnd) {
    sky(p)
    let x = int(rnd, 4, 18)
    while (x < W - 30) {
      const w = int(rnd, 40, 54)
      p.rect(x - 1, 21, w + 2, 3, "4")
      for (let r = 0; r < 9; r++) {
        const inset = Math.round(((9 - r) * (w / 2)) / 9)
        p.rect(x - 1 + inset, 12 + r, Math.max(1, w + 2 - 2 * inset), 1, "4")
      }
      p.rect(x, 24, w, 18, "2")
      for (let c = x + 3; c < x + w - 3; c += 7) p.rect(c, 24, 3, 18, "4")
      p.rect(x - 3, 42, w + 6, 2, "4")
      p.rect(x - 5, 44, w + 10, 2, "3")
      x += w + 8
      // Coin stacks between the buildings.
      for (let s = 0; s < 2 && x < W - 12; s++, x += 10) {
        const coins = int(rnd, 3, 9)
        for (let k = 0; k < coins; k++) {
          p.rect(x, 44 - (k + 1) * 2, 8, 1, "a")
          p.rect(x, 45 - (k + 1) * 2, 8, 1, "b")
        }
      }
      x += int(rnd, 4, 12)
    }
    for (let i = 0; i < 4; i++) p.draw(S.coin, int(rnd, 0, W - 6), int(rnd, 2, 9))
  },

  tech(p, rnd) {
    p.rect(0, 0, W, H, "0")
    for (let y = 2; y < H; y += 6) for (let x = 2; x < W; x += 6) p.dot(x, y, "1")
    for (let i = 0; i < 22; i++) {
      const x0 = int(rnd, 0, 59) * 4
      const y0 = int(rnd, 1, 10) * 4
      const x1 = Math.min(W - 2, x0 + int(rnd, 3, 14) * 4)
      const y1 = int(rnd, 1, 10) * 4
      line(p, x0, y0, x1, y0, "3")
      line(p, x1, y0, x1, y1, "3")
      p.rect(x0 - 1, y0 - 1, 2, 2, "4")
      p.rect(x1 - 1, y1 - 1, 3, 3, "4")
      p.dot(x1, y1, "w")
    }
    for (let i = 0; i < 3; i++) {
      const x = int(rnd, 10 + i * 78, 50 + i * 78)
      const y = int(rnd, 8, 24)
      for (let k = 0; k < 6; k++) {
        p.rect(x + 2 + k * 3, y - 2, 1, 2, "3")
        p.rect(x + 2 + k * 3, y + 10, 1, 2, "3")
      }
      p.rect(x, y, 20, 10, "4")
      p.rect(x + 3, y + 3, 6, 4, "a")
      p.dot(x + 17, y + 2, "w")
    }
  },

  retail(p, rnd) {
    sky(p)
    for (let x = int(rnd, -10, 0); x < W; ) {
      const w = int(rnd, 30, 42)
      const body: ColorKey = rnd() > 0.5 ? "2" : "3"
      p.rect(x, 12, w, 32, body)
      p.rect(x + 4, 14, w - 8, 3, "b")
      for (let s = 0; s < w; s += 3) p.rect(x + s, 19, 2, 5, Math.floor(s / 3) % 2 ? "w" : "a")
      p.rect(x, 18, w, 1, "a")
      for (let s = 0; s < w; s += 2) p.dot(x + s, 24, "a")
      p.rect(x + 3, 27, w - 15, 10, "1")
      for (let k = x + 5; k < x + w - 14; k += 4) p.rect(k, 33, 2, 4, "3")
      p.rect(x + w - 9, 30, 6, 14, "4")
      x += w + 2
    }
    p.rect(0, 44, W, H - 44, "3")
  },

  food(p, rnd) {
    sky(p)
    // A checked tablecloth.
    for (let y = 34; y < H; y += 4) for (let x = 0; x < W; x += 4) p.rect(x, y, 4, 4, (x / 4 + (y - 34) / 4) % 2 ? "b" : "1")
    scatter(p, rnd, [S.cup, S.apple, S.slice], [4, 20], 24)
  },

  health(p, rnd) {
    sky(p)
    hills(p, rnd, [["2", 42, 3]])
    scatter(p, rnd, [S.cross, S.heart], [4, 30], 34)
    const beat = [0, -1, -2, -1, 0, 0, 3, -12, 9, 0, 0, -3, -4, -3, 0]
    // A heart-rate line: flat, then a beat, every 48 pixels.
    let py = 24
    for (let x = 0; x <= W; x += 2) {
      const i = (x % 48) / 2 - 8
      const y = 24 + (beat[i] ?? 0)
      line(p, x - 2, py, x, y, "4")
      py = y
    }
  },

  education(p, rnd) {
    sky(p)
    for (let i = 0; i < 3; i++) p.draw(S.cap, int(rnd, 6 + i * 80, 60 + i * 80), int(rnd, 2, 8))
    for (let x = 0; x < W; ) {
      if (rnd() > 0.9) {
        x += int(rnd, 4, 10)
        continue
      }
      const w = int(rnd, 3, 6)
      const h = int(rnd, 12, 26)
      const tone: ColorKey = (["2", "3", "4", "a"] as const)[int(rnd, 0, 3)]!
      p.rect(x, 42 - h, w, h, tone)
      p.rect(x, 42 - h + 3, w, 1, "1")
      p.rect(x, 39, w, 1, "1")
      x += w + (rnd() > 0.7 ? 1 : 0)
    }
    p.rect(0, 42, W, 2, "5")
  },

  logistics(p, rnd) {
    sky(p)
    p.rect(0, 40, W, 6, "3")
    for (let x = 2; x < W; x += 12) p.rect(x, 42, 6, 1, "w")
    // Container stacks on the right, trucks on the road on the left.
    for (let x = int(rnd, 96, 110); x < W - 20; x += 24) {
      const n = int(rnd, 1, 3)
      for (let k = 0; k < n; k++) {
        const tone: ColorKey = (["2", "3", "4", "a"] as const)[int(rnd, 0, 3)]!
        const rib: ColorKey = tone === "2" ? "3" : tone === "3" ? "4" : tone === "a" ? "b" : "5"
        const y = 40 - (k + 1) * 9
        p.rect(x, y, 22, 8, tone)
        for (let r = 2; r < 21; r += 2) p.rect(x + r, y + 1, 1, 6, rib)
      }
    }
    for (const tx of [int(rnd, 4, 20), int(rnd, 50, 64)]) {
      p.rect(tx, 28, 22, 10, "4")
      p.rect(tx + 2, 32, 18, 1, "w")
      p.rect(tx + 22, 31, 8, 7, "a")
      p.rect(tx + 25, 32, 4, 3, "1")
      for (const wx of [3, 15, 24]) p.rect(tx + wx, 38, 3, 2, "5")
    }
    for (let i = 0; i < 3; i++) cloud(p, int(rnd, 0, W - 20), int(rnd, 6, 14), int(rnd, 14, 26))
  },

  construction(p, rnd) {
    sky(p)
    const mx = int(rnd, 120, 190)
    for (let y = 6; y < 44; y++) {
      p.dot(mx, y, "4")
      p.dot(mx + 2, y, "4")
      if (y % 2) p.dot(mx + 1, y, "4")
    }
    for (let x = mx - 24; x < mx + 50; x++) {
      p.dot(x, 6, "4")
      p.dot(x, 8, "4")
      if (x % 2) p.dot(x, 7, "4")
    }
    p.rect(mx - 24, 9, 7, 4, "a")
    line(p, mx + 40, 9, mx + 40, 26, "3")
    p.rect(mx + 37, 26, 7, 4, "a")
    for (let x = int(rnd, -6, 2); x < W; ) {
      if (Math.abs(x + 10 - mx) < 14) {
        x += 18
        continue
      }
      const w = int(rnd, 16, 24)
      const h = int(rnd, 10, 16)
      const top = 44 - h
      p.rect(x, top, w, h, rnd() > 0.5 ? "2" : "3")
      for (let r = 0; r <= w / 2; r++) p.rect(x - 1 + r, top - 1 - Math.floor(r / 1.5), Math.max(1, w + 2 - 2 * r), 1, "a")
      p.rect(x + 3, top + 3, 4, 4, "1")
      p.rect(x + w - 7, top + h - 7, 4, 7, "4")
      x += w + int(rnd, 3, 8)
    }
    p.rect(0, 44, W, H - 44, "3")
  },

  energy(p, rnd) {
    sky(p)
    sun(p, int(rnd, 20, 60), int(rnd, 10, 16), 7)
    hills(p, rnd, [["2", 34, 6], ["3", 42, 4]])
    for (let i = 0; i < 5; i++) {
      const hx = int(rnd, 70 + i * 34, 90 + i * 34)
      const hy = int(rnd, 10, 18)
      p.rect(hx, hy, 1, 44 - hy, "4")
      const a0 = rnd() * Math.PI * 2
      for (let b = 0; b < 3; b++) {
        const a = a0 + (b * 2 * Math.PI) / 3
        line(p, hx, hy, Math.round(hx + Math.cos(a) * 9), Math.round(hy + Math.sin(a) * 9), "5")
      }
      p.rect(hx - 1, hy - 1, 3, 3, "a")
      p.dot(hx, hy, "w")
    }
  },

  media(p, rnd) {
    sky(p)
    p.rect(0, 8, W, 16, "4")
    for (let x = 1; x < W; x += 6) {
      p.rect(x, 9, 3, 2, "w")
      p.rect(x, 21, 3, 2, "w")
    }
    for (let x = 2; x < W; x += 22) p.rect(x, 12, 18, 8, (x / 22) % 2 < 1 ? "b" : "1")
    scatter(p, rnd, [S.note, S.play], [30], 26)
  },

  travel(p, rnd) {
    sky(p)
    const sx = int(rnd, 80, 160)
    sun(p, sx, 24, 8)
    p.rect(0, 30, W, H - 30, "2")
    for (let y = 32; y < H; y += 3) for (let x = 0; x < W; x++) if ((x + y * 3) % 9 < 3) p.dot(x, y, "3")
    for (let y = 32; y < 44; y += 2) p.rect(sx - 5 + (y % 4), y, 10 - (y - 32) / 2, 1, "w")
    p.draw(S.boat, int(rnd, sx + 20, W - 20), 25)
    for (const px of [int(rnd, 8, 30), int(rnd, W - 40, W - 16)]) {
      for (let y = 44, x = px; y > 16; y--, x += y % 5 === 0 ? 1 : 0) p.rect(x, y, 2, 1, "4")
      const tx = px + 5
      for (const [dx, dy] of [[-12, 6], [-9, 9], [12, 6], [9, 9], [0, -4]] as const) line(p, tx, 16, tx + dx, 16 + dy, "4")
      p.rect(px - 10, 42, 24, 4, "3")
    }
  },
}

// ---- Generic scenes (no confident theme) ----

const GENERIC = [
  // An office skyline at dusk: towers with lit windows.
  (p: Pix, rnd: Rnd) => {
    sky(p)
    for (let i = 0; i < 40; i++) p.dot(int(rnd, 0, W - 1), int(rnd, 0, 27), rnd() > 0.7 ? "3" : "2")
    for (let x = -4; x < W; ) {
      const w = int(rnd, 10, 25)
      const h = int(rnd, 14, 43)
      const tone: ColorKey = rnd() > 0.5 ? "3" : "4"
      p.rect(x, H - h, w, h, tone)
      for (let wy = H - h + 3; wy < H - 3; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (rnd() > 0.55) {
        const r = rnd()
        p.dot(wx, wy, r > 0.9 ? "w" : r > 0.8 ? "a" : "1")
      }
      if (rnd() > 0.7) p.rect(x + Math.floor(w / 2), H - h - 4, 1, 4, tone)
      x += w + (rnd() > 0.6 ? 2 : 0)
    }
  },
  // Hills under a big sun.
  (p: Pix, rnd: Rnd) => {
    sky(p)
    sun(p, int(rnd, 30, W - 30), int(rnd, 14, 23), 9)
    hills(p, rnd, [["2", 30, 8], ["3", 38, 7], ["4", 46, 5]])
  },
  // A calm quilt: a few large tiles, some with a dithered half.
  (p: Pix, rnd: Rnd) => {
    sky(p)
    for (let by = 0; by < H; by += 12)
      for (let bx = 0; bx < W; bx += 12) {
        const r = rnd()
        if (r < 0.62) continue
        const tone: ColorKey = r > 0.94 ? "a" : r > 0.8 ? "3" : "2"
        if (r > 0.88) p.dither(bx, by, 12, 12, "1", tone, (x) => (x - bx < 6 ? 1 : 0.5))
        else p.rect(bx, by, 12, 12, tone)
      }
  },
]

/** The theme's scene, or a generic one picked by the seed. */
export function drawScene(p: Pix, seed: number, theme: BannerTheme | null) {
  const rnd = random(seed)
  if (theme) THEMES[theme](p, rnd)
  // Other bits than the hue's, so the generic motif doesn't follow the colour.
  else GENERIC[(seed >>> 12) % GENERIC.length]!(p, rnd)
}
