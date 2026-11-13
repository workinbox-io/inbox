/**
 * The "Mail" and "Chat" unread badges in the dashboard sidebar and the user view's app rail. The app itself publishes
 * its count (instant after reading); elsewhere the badge polls while the tab is visible.
 */
const UNREAD_EVENT = "mail:unread"
const CHAT_EVENT = "chat:unread"

export function publishUnread(total: number) {
  window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: total }))
}

export function publishChatUnread(total: number) {
  window.dispatchEvent(new CustomEvent(CHAT_EVENT, { detail: total }))
}

export function badgeText(n: number) {
  return n > 99 ? "99+" : n > 0 ? String(n) : ""
}

/** Calls `cb` with the total now, every minute while visible, on tab focus and whenever Mail publishes. */
export const watchUnread = (cb: (total: number) => void) => watchCount("/api/app/mail/unread", UNREAD_EVENT, cb)

/** Chat: direct messages and mentions, muted conversations left out. */
export const watchChatUnread = (cb: (total: number) => void) => watchCount("/api/app/chat/unread", CHAT_EVENT, cb)

function watchCount(url: string, event: string, cb: (total: number) => void) {
  const fetchNow = () => {
    if (document.visibilityState !== "visible") return
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<{ total: number }>) : null))
      .then((d: { total: number } | null) => d && cb(d.total))
      .catch(() => {})
  }
  const onEvent = (e: Event) => cb((e as CustomEvent<number>).detail)
  fetchNow()
  const timer = setInterval(fetchNow, 60_000)
  document.addEventListener("visibilitychange", fetchNow)
  window.addEventListener(event, onEvent)
  return () => {
    clearInterval(timer)
    document.removeEventListener("visibilitychange", fetchNow)
    window.removeEventListener(event, onEvent)
  }
}
