/**
 * Starts every `canvas[data-scene]` on the page: draws at 24 frames a second while on screen, once with reduced motion.
 * The canvas is drawn at a whole multiple of the scene (at least its size on screen), so every scene pixel is the same
 * size; scaling a 240 px canvas straight to 1100 px would make some pixels a device pixel wider than others.
 * A scene's clock runs at `data-speed` times real time (default 1), so a page can speed one up without a jump.
 */
import { Pix, palette } from "./pixel";
import { SCENES } from "./scenes";

const FPS = 24;

export function mountScenes(root: ParentNode = document) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>("canvas[data-scene]")) {
    const scene = SCENES[canvas.dataset.scene ?? ""];
    const ctx = canvas.getContext("2d");
    if (!scene || !ctx || canvas.dataset.mounted) continue;
    canvas.dataset.mounted = "";
    let pix: Pix;
    const fit = () => {
      const ratio = Math.max(canvas.clientWidth / scene.w, canvas.clientHeight / scene.h) * devicePixelRatio;
      const k = Math.min(16, Math.max(1, Math.ceil(ratio)));
      if (canvas.width === scene.w * k) return;
      canvas.width = scene.w * k;
      canvas.height = scene.h * k;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    fit();
    const readPalette = () => {
      const css = getComputedStyle(canvas);
      const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      const page = v("--mk-bg", "#fefefe");
      pix =
        scene.surface === "band"
          ? new Pix(ctx, scene.w, scene.h, palette(v("--mk-band", "#141414"), "#fefefe", page))
          : new Pix(ctx, scene.w, scene.h, palette(page, v("--mk-ink", "#141414"), page));
    };
    readPalette();
    // A still frame a few seconds in, so everything is on screen.
    const draw = (t: number) => scene.draw(pix, t, canvas.dataset.state ?? "");
    let visible = false;
    let last = 0;
    let clock = 4;
    let tick = performance.now();
    const now = () => {
      const at = performance.now();
      clock += ((at - tick) / 1000) * (Number(canvas.dataset.speed) || 1);
      tick = at;
      return clock;
    };
    const frame = (at: number) => {
      if (!visible || reduced.matches) return;
      if (at - last >= 1000 / FPS) {
        last = at;
        draw(now());
      }
      requestAnimationFrame(frame);
    };
    reduced.addEventListener("change", () => {
      if (reduced.matches) draw(4);
      else if (visible) requestAnimationFrame(frame);
    });
    draw(4);
    new ResizeObserver(() => {
      const before = canvas.width;
      fit();
      if (canvas.width !== before) draw(reduced.matches ? 4 : now());
    }).observe(canvas);
    new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = !!entry?.isIntersecting;
      if (visible && !was) requestAnimationFrame(frame);
    }).observe(canvas);
    // Theme switches (html.dark) and the setup steps (data-state) redraw right away.
    new MutationObserver(() => {
      readPalette();
      draw(reduced.matches ? 4 : now());
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(() => draw(reduced.matches ? 4 : now())).observe(canvas, { attributes: true, attributeFilter: ["data-state"] });
  }
}
