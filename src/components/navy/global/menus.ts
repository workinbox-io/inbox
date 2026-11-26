// Disclosure menus of the header and footer: `<div data-menu-wrap><button data-menu aria-controls=id>` + `<div id hidden>`.
// Click toggles; with `data-hover` a mouse also opens it after 120 ms and closes 200 ms after leaving (switching between
// open menus is instant); Escape, a click outside or Tab out closes; arrows, Home and End move through the links.
const wraps = Array.from(document.querySelectorAll<HTMLElement>("[data-menu-wrap]"));
const hoverable = matchMedia("(hover: hover)");
let openWrap: HTMLElement | null = null;
let pinned = false;
let timer = 0;

const trigger = (w: HTMLElement) => w.querySelector<HTMLButtonElement>("[data-menu]")!;
const panel = (w: HTMLElement) => document.getElementById(trigger(w).getAttribute("aria-controls")!)!;
const items = (w: HTMLElement) => Array.from(panel(w).querySelectorAll<HTMLElement>("a[href]:not([aria-disabled])"));

function close(w: HTMLElement | null, refocus = false) {
  if (!w) return;
  trigger(w).setAttribute("aria-expanded", "false");
  panel(w).hidden = true;
  if (openWrap === w) openWrap = null;
  if (refocus) trigger(w).focus();
}
function open(w: HTMLElement, byHover: boolean) {
  window.clearTimeout(timer);
  if (openWrap && openWrap !== w) close(openWrap);
  trigger(w).setAttribute("aria-expanded", "true");
  panel(w).hidden = false;
  openWrap = w;
  pinned = !byHover;
}
export const closeMenus = () => close(openWrap);

for (const w of wraps) {
  const btn = trigger(w);
  const hover = btn.hasAttribute("data-hover");
  btn.addEventListener("click", () => {
    if (openWrap === w && !pinned) pinned = true; // opened by hover: a click keeps it open
    else if (openWrap === w) close(w);
    else open(w, false);
  });
  if (hover) {
    w.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse" || !hoverable.matches) return;
      window.clearTimeout(timer);
      if (openWrap === w) return;
      if (openWrap) open(w, true);
      else timer = window.setTimeout(() => open(w, true), 120);
    });
    w.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse") return;
      window.clearTimeout(timer);
      if (openWrap === w && !pinned) timer = window.setTimeout(() => close(w), 200);
    });
  }
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open(w, false);
      const list = items(w);
      (e.key === "ArrowDown" ? list[0] : list[list.length - 1])?.focus();
    }
  });
  panel(w).addEventListener("keydown", (e) => {
    const list = items(w);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
  });
  w.addEventListener("focusout", (e) => {
    const next = e.relatedTarget as Node | null;
    if (next && !w.contains(next)) close(w);
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openWrap) {
    const w = openWrap;
    e.stopPropagation();
    close(w, true);
  }
});
document.addEventListener("pointerdown", (e) => {
  if (openWrap && !openWrap.contains(e.target as Node)) close(openWrap);
});
