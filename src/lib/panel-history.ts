/**
 * The dashboard navigates with Astro's ClientRouter (AppLayout), which keeps its own state in each
 * history entry and ignores entries without it. Pages that change the address in place (the inbox's
 * open conversation, editor sections) go through these helpers, which keep that state, including
 * the stamp of the page on screen (set in AppLayout): going back to an entry of that same page is
 * left to the page's own `popstate` listener, going back to an entry of an earlier page lets the
 * router load it.
 */
export function replaceUrl(url: string | URL) {
  history.replaceState(history.state, "", url)
}

export function pushUrl(url: string | URL) {
  history.pushState(history.state, "", url)
}

/**
 * Asks before leaving while `active()` is true: closing the tab (beforeunload) and dashboard links,
 * which the router would otherwise follow without asking. Those turn into a full page load, so the
 * browser asks the same question. Returns the cleanup.
 */
export function guardLeaving(active: () => boolean) {
  const unload = (e: BeforeUnloadEvent) => {
    if (active()) e.preventDefault()
  }
  const navigate = (e: Event) => {
    if (active()) e.preventDefault()
  }
  window.addEventListener("beforeunload", unload)
  document.addEventListener("astro:before-preparation", navigate)
  return () => {
    window.removeEventListener("beforeunload", unload)
    document.removeEventListener("astro:before-preparation", navigate)
  }
}
