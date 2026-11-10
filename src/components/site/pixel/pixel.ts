/**
 * Pixel scenes for the marketing site: a scene draws on a small canvas (a few hundred pixels wide) that CSS scales up
 * with `image-rendering: pixelated`. Colours are six steps between a background and a foreground (`0` … `5`), read
 * from the page so light and dark themes both work, plus `p` for the page colour (bands dither into the page) and `w`
 * for paper white. Sprites are strings of those keys, `.` is see-through. Everything here is pure except `Pix`.
 */

export type ColorKey = "0" | "1" | "2" | "3" | "4" | "5" | "p" | "w";
export type Palette = Record<ColorKey, string>;

/** 4×4 ordered (Bayer) dither: is the pixel at x, y on at this level (0 = never, 1 = always)? */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dithered = (level: number, x: number, y: number) => level > (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

export interface Sprite {
  w: number;
  h: number;
  cells: (ColorKey | null)[];
}
export const sprite = (rows: string[]): Sprite => {
  const w = Math.max(...rows.map((r) => r.length));
  const cells: (ColorKey | null)[] = [];
  for (const row of rows) for (let x = 0; x < w; x++) cells.push(row[x] && row[x] !== "." ? (row[x] as ColorKey) : null);
  return { w, h: rows.length, cells };
};

const hex = (c: string) => {
  const m = c.trim().match(/^#?([0-9a-f]{6})$/i);
  const n = m ? parseInt(m[1]!, 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const to = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${to(r1, r2)}${to(g1, g2)}${to(b1, b2)}`;
};
/** Six steps from `bg` to `fg`, plus the page colour and paper white. */
export const palette = (bg: string, fg: string, page: string): Palette => ({
  "0": mix(bg, fg, 0),
  "1": mix(bg, fg, 0.1),
  "2": mix(bg, fg, 0.25),
  "3": mix(bg, fg, 0.45),
  "4": mix(bg, fg, 0.7),
  "5": mix(bg, fg, 1),
  p: mix(page, page, 0),
  w: "#fefefe",
});

/** Seeded random numbers, so a scene's still frame is the same on every load. */
export const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Drawing on the canvas, in scene pixels. */
export class Pix {
  constructor(
    private ctx: CanvasRenderingContext2D,
    public w: number,
    public h: number,
    public pal: Palette,
  ) {}
  rect(x: number, y: number, w: number, h: number, c: ColorKey) {
    this.ctx.fillStyle = this.pal[c];
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  dot(x: number, y: number, c: ColorKey) {
    this.rect(x, y, 1, 1, c);
  }
  /** Fill with `b` over `a` at a level from 0 to 1, per pixel, by `level(x, y)` or one level. */
  dither(x0: number, y0: number, w: number, h: number, a: ColorKey, b: ColorKey, level: number | ((x: number, y: number) => number)) {
    for (let y = Math.round(y0); y < y0 + h; y++) {
      for (let x = Math.round(x0); x < x0 + w; x++) {
        const l = typeof level === "number" ? level : level(x, y);
        this.dot(x, y, dithered(l, x, y) ? b : a);
      }
    }
  }
  draw(s: Sprite, x: number, y: number, recolor?: Partial<Record<ColorKey, ColorKey>>) {
    const ox = Math.round(x);
    const oy = Math.round(y);
    for (let i = 0; i < s.cells.length; i++) {
      const c = s.cells[i];
      if (c) this.dot(ox + (i % s.w), oy + Math.floor(i / s.w), recolor?.[c] ?? c);
    }
  }
}

export interface Scene {
  w: number;
  h: number;
  /** "band": drawn on the ink band (light on dark); "page": on the page (dark on light). */
  surface: "band" | "page";
  /** Time in seconds; `state` is the canvas's data-state (the setup steps use it). */
  draw(p: Pix, t: number, state: string): void;
}
