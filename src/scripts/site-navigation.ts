/** One animated surface for the server-rendered marketing navigation. */
export function installSiteNavigation(header: HTMLElement) {
  const viewport = header.querySelector<HTMLElement>("[data-mega-viewport]")!;
  const nav = header.querySelector<HTMLElement>("[data-desktop-nav]")!;
  const menus = [...nav.querySelectorAll<HTMLElement>("[data-menu]")].map((menu) => ({
    menu,
    button: menu.querySelector<HTMLButtonElement>("button")!,
    panel: menu.querySelector<HTMLElement>("[data-panel]")!,
  }));
  for (const { panel } of menus) viewport.appendChild(panel);
  let active = -1;
  let timer: number | undefined;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const cancelClose = () => window.clearTimeout(timer);
  const position = () => {
    if (active < 0) return;
    const { button, panel } = menus[active]!;
    const parent = viewport.offsetParent!.getBoundingClientRect();
    const trigger = button.getBoundingClientRect();
    const width = viewport.getBoundingClientRect().width;
    const left = Math.max(16, Math.min(trigger.left + trigger.width / 2 - width / 2, window.innerWidth - width - 16));
    viewport.style.left = `${left - parent.left}px`;
    viewport.style.height = `${panel.offsetHeight}px`;
  };
  const close = () => {
    cancelClose();
    active = -1;
    viewport.dataset.open = "false";
    viewport.inert = true;
    for (const { button, panel } of menus) {
      button.setAttribute("aria-expanded", "false");
      panel.inert = true;
    }
  };
  const open = (index: number) => {
    cancelClose();
    if (active === index) return;
    const previous = active;
    active = index;
    for (const [i, { button, panel }] of menus.entries()) {
      panel.getAnimations().forEach((animation) => animation.cancel());
      delete panel.dataset.leaving;
      button.setAttribute("aria-expanded", String(i === index));
      panel.inert = i !== index;
      panel.dataset.active = String(i === index);
      if (i === previous && !reducedMotion.matches) {
        panel.dataset.leaving = "true";
        const exit = panel.animate({ opacity: [1, 0], transform: ["translateX(0)", `translateX(${index > previous ? -18 : 18}px)`] }, { duration: 140 });
        exit.finished.then(() => { delete panel.dataset.leaving; }).catch(() => {});
      }
    }
    viewport.inert = false;
    viewport.dataset.open = "true";
    position();
    if (!reducedMotion.matches) {
      menus[index]!.panel.animate({ opacity: [0, 1], transform: [`translateX(${previous < 0 ? 0 : index > previous ? 22 : -22}px)`, "translateX(0)"] }, { duration: 230, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
  };
  const scheduleClose = () => { cancelClose(); timer = window.setTimeout(close, 180); };
  for (const [index, { button, panel }] of menus.entries()) {
    button.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") open(index); });
    button.addEventListener("click", () => active === index ? close() : open(index));
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        open(index);
        const links = panel.querySelectorAll<HTMLAnchorElement>("a");
        (event.key === "ArrowUp" ? links[links.length - 1] : links[0])?.focus();
      }
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const links = [...panel.querySelectorAll<HTMLAnchorElement>("a")];
      const current = links.indexOf(document.activeElement as HTMLAnchorElement);
      links[(current + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus();
    });
    panel.addEventListener("click", (event) => { if ((event.target as Element).closest("a")) close(); });
  }
  for (const region of [nav, viewport]) {
    region.addEventListener("pointerenter", cancelClose);
    region.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") scheduleClose(); });
  }
  header.addEventListener("focusout", (event) => {
    const next = event.relatedTarget as Node | null;
    if (!nav.contains(next) && !viewport.contains(next)) close();
  });
  header.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active >= 0) {
      const button = menus[active]!.button;
      close();
      button.focus();
    }
  });
  document.addEventListener("click", (event) => {
    const target = event.target as Node;
    if (!nav.contains(target) && !viewport.contains(target)) close();
  });
  window.addEventListener("resize", () => window.innerWidth < 1024 ? close() : position());
  const observer = new ResizeObserver(position);
  for (const { panel } of menus) observer.observe(panel);
  observer.observe(viewport.parentElement!);
  return close;
}
