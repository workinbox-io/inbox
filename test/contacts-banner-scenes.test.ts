import { describe, expect, it } from "vitest";
import { drawScene, H, W } from "../src/components/contacts/banner-scenes";
import { BANNER_THEMES, type BannerTheme } from "../src/lib/contacts/banner";
import { Pix, palette } from "../src/components/site/pixel/pixel";

/** A canvas stand-in that counts painted pixels and ones outside the scene. */
function fakeCanvas() {
  const stats = { painted: 0, outside: 0, colors: new Set<string>() };
  const ctx = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      stats.painted += w * h;
      stats.colors.add(String(this.fillStyle));
      if (x < -40 || y < -2 || x + w > W + 40 || y + h > H + 2) stats.outside++;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, stats };
}

describe("banner scenes", () => {
  const themes = [...(Object.keys(BANNER_THEMES) as BannerTheme[]), null];
  for (const theme of themes)
    it(`draws ${theme ?? "generic"} for many domains`, () => {
      for (const seed of [1, 42, 123456, 987654321, 4294967295]) {
        const { ctx, stats } = fakeCanvas();
        drawScene(new Pix(ctx, W, H, palette("#ffffff", "#0b2c63", "#ffffff")), seed, theme);
        expect(stats.painted).toBeGreaterThan(W * H * 0.9);
        expect(stats.colors.size).toBeGreaterThanOrEqual(3);
        expect(stats.outside).toBe(0);
      }
    });
});
