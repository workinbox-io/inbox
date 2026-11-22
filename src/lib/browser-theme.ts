/** Keep browser chrome in step with the rendered surface and the user's theme override. */
function syncBrowserTheme() {
  const root = document.documentElement;
  const surface = document.querySelector<HTMLElement>("[data-browser-theme-surface]") ?? document.body;
  if (!surface) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = getComputedStyle(surface).backgroundColor;
  root.style.colorScheme = root.classList.contains("dark") ? "dark" : "light";
}

syncBrowserTheme();
window.addEventListener("app:navigation", syncBrowserTheme);
new MutationObserver(syncBrowserTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["class"],
});
