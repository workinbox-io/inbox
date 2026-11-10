/**
 * The "Mail" unread badge in the dashboard sidebar and the user view's app rail. Mail itself publishes its counts
 * (instant after reading); elsewhere the badge polls while the tab is visible.
 */
const UNREAD_EVENT = "mail:unread"

export function publishUnread(total: number) {
  window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: total }))
}

export function badgeText(n: number) {
  return n > 99 ? "99+" : n > 0 ? String(n) : ""
}

/** Calls `cb` with the total now, every minute while visible, on tab focus and whenever Mail publishes. */
export function watchUnread(cb: (total: number) => void) {
  const fetchNow = () => {
    if (document.visibilityState !== "visible") return
    fetch("/api/app/mail/unread")
      .then((r) => (r.ok ? (r.json() as Promise<{ total: number }>) : null))
      .then((d: { total: number } | null) => d && cb(d.total))
      .catch(() => {})
  }
  const onEvent = (e: Event) => cb((e as CustomEvent<number>).detail)
  fetchNow()
  const timer = setInterval(fetchNow, 60_000)
  document.addEventListener("visibilitychange", fetchNow)
  window.addEventListener(UNREAD_EVENT, onEvent)
  return () => {
    clearInterval(timer)
    document.removeEventListener("visibilitychange", fetchNow)
    window.removeEventListener(UNREAD_EVENT, onEvent)
  }
}
