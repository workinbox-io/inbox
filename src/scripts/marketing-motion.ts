/**
 * GSAP motion for the marketing pages (ported from Luxivo). Loaded lazily by MarketingLayout (dynamic import, only
 * when the page has the .mk wrapper), so it never reaches /app or the widget bundles.
 * Without JS, or with prefers-reduced-motion, nothing here runs and the final state is shown.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

const $$ = <T extends Element = HTMLElement>(sel: string, root: Pick<ParentNode, "querySelectorAll"> = document) => [...root.querySelectorAll<T>(sel)];
const belowFold = (el: Element) => el.getBoundingClientRect().top > window.innerHeight * 0.9;

// Every reveal ends with clearProps, so no filter or transform stays behind (they'd trap fixed or backdrop children).
const settled = "opacity,visibility,filter,transform,clipPath";

/**
 * Section headings come into focus word by word (blur to sharp), the same language as the hero's rotating line.
 * data-split="chars" (the CTA banner) pops its letters out from the middle instead.
 */
function splitHeadings() {
  for (const el of $$("[data-split]")) {
    if (!belowFold(el)) continue;
    const chars = el.dataset.split === "chars";
    SplitText.create(el, {
      type: chars ? "words,chars" : "words",
      autoSplit: true,
      onSplit(self) {
        const scrollTrigger = { trigger: el, start: "top 88%", once: true };
        return chars
          ? gsap.from(self.chars, { autoAlpha: 0, scale: 0.4, duration: 0.6, ease: "back.out(2.2)", stagger: { each: 0.018, from: "center" }, clearProps: settled, scrollTrigger })
          : gsap.from(self.words, { autoAlpha: 0, filter: "blur(12px)", yPercent: 18, duration: 1, ease: "power2.out", stagger: 0.045, clearProps: settled, scrollTrigger });
      },
    });
  }
}

/**
 * data-reveal picks its motion by what it holds:
 * - "" (default): fades in from blur, drifting in from its own side of the page (left column from the left, right
 *   column from the right, centered blocks barely move), so two-column rows close in on the middle.
 * - "card": settles from a slight zoom, batched so a grid of cards ripples in.
 * - "items": the block stays, its [data-reveal-item] (or direct children) come in one after another.
 * - "frame": a product scene (Stage) opens from a smaller rounded window while the screen inside zooms back to size.
 */
const from: Record<string, (el: HTMLElement) => gsap.TweenVars> = {
  auto(el) {
    const r = el.getBoundingClientRect();
    const off = (r.left + r.width / 2) / window.innerWidth - 0.5;
    const side = Math.abs(off) > 0.12 && r.width < window.innerWidth * 0.6 ? Math.sign(off) : 0;
    return { autoAlpha: 0, filter: "blur(8px)", x: side * 56, y: side ? 0 : 16 };
  },
  card: () => ({ autoAlpha: 0, filter: "blur(6px)", scale: 0.92, transformOrigin: "50% 80%" }),
  item: () => ({ autoAlpha: 0, filter: "blur(6px)", y: 12, scale: 0.97 }),
};

function reveals() {
  const all = $$("[data-reveal]").filter(belowFold);
  const kind = (el: HTMLElement) => el.dataset.reveal || "auto";
  const single = all.filter((el) => kind(el) === "auto" || kind(el) === "card");
  for (const el of single) gsap.set(el, from[kind(el)]!(el));
  ScrollTrigger.batch(single, {
    start: "top 90%",
    once: true,
    onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, filter: "blur(0px)", x: 0, y: 0, scale: 1, duration: 1, stagger: 0.09, ease: "power3.out", clearProps: settled }),
  });

  for (const el of all.filter((el) => kind(el) === "items")) {
    const items = $$("[data-reveal-item]", el);
    gsap.from(items.length ? items : [...el.children], {
      ...from.item!(el),
      duration: 0.8,
      stagger: 0.07,
      ease: "power3.out",
      clearProps: settled,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  }

  for (const el of all.filter((el) => kind(el) === "frame")) {
    const inner = el.firstElementChild;
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 85%", once: true }, defaults: { duration: 1.3, ease: "expo.out", clearProps: settled } });
    tl.from(el, { clipPath: "inset(10% 8% 10% 8% round 3rem)" });
    if (inner) tl.from(inner, { scale: 1.12, autoAlpha: 0 }, 0);
  }
}

function parallax() {
  for (const el of $$("[data-parallax]")) {
    gsap.to(el, {
      y: Number(el.dataset.parallax),
      rotate: Number(el.dataset.rotate ?? 0),
      ease: "none",
      scrollTrigger: { trigger: el.parentElement ?? el, start: "top bottom", end: "bottom top", scrub: 0.6 },
    });
  }
}

function magnetic() {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  for (const el of $$("[data-magnetic]")) {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, { x: (e.clientX - (r.left + r.width / 2)) * 0.3, y: (e.clientY - (r.top + r.height / 2)) * 0.4, duration: 0.3, ease: "power3.out", overwrite: "auto" });
    });
    el.addEventListener("pointerleave", () => gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.4)", overwrite: "auto" }));
  }
}

async function init() {
  await document.fonts?.ready;
  splitHeadings();
  reveals();
  parallax();
  magnetic();
  ScrollTrigger.refresh();
}

void init();
