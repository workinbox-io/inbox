/**
 * The "Mail" and "Chat" unread badges in the dashboard sidebar and the user view's app rail. The app itself publishes
 * its count (instant after reading), other tabs get it over a BroadcastChannel, and the server's "notification" ping
 * (the bell calls `refreshCountsHere()`) makes them refetch; otherwise the badge polls while the tab is visible.
 */
const UNREAD_EVENT = "mail:unread"
const CHAT_EVENT = "chat:unread"
const REFRESH_EVENT = "counts:refresh"

type CountsMessage = { event: string; total: number }
let channel: BroadcastChannel | null | undefined
function tabs() {
  if (channel === undefined) {
    try {
      channel = new BroadcastChannel("workspace-counts")
      channel.onmessage = (e: MessageEvent<CountsMessage>) => window.dispatchEvent(new CustomEvent(e.data.event, { detail: e.data.total }))
    } catch {
      channel = null
    }
  }
  return channel
}

function broadcast(event: string, total: number) {
  window.dispatchEvent(new CustomEvent(event, { detail: total }))
  tabs()?.postMessage({ event, total } satisfies CountsMessage)
}

export const publishUnread = (total: number) => broadcast(UNREAD_EVENT, total)
export const publishChatUnread = (total: number) => broadcast(CHAT_EVENT, total)
/** Badges and bell in this tab refetch: the server's socket ping, which every tab gets on its own socket. */
export const refreshCountsHere = () => window.dispatchEvent(new CustomEvent(REFRESH_EVENT))
/** Only the bell refetches (Mail read a thread), so Mail doesn't reload its own list. */
export const refreshBell = () => window.dispatchEvent(new CustomEvent("bell:refresh"))
export function onRefreshBell(cb: () => void) {
  window.addEventListener("bell:refresh", cb)
  return () => window.removeEventListener("bell:refresh", cb)
}
/** `cb` runs when the server says counts changed; also opens the tab channel so counts from other tabs arrive. */
export function onRefreshCounts(cb: () => void) {
  tabs()
  window.addEventListener(REFRESH_EVENT, cb)
  return () => window.removeEventListener(REFRESH_EVENT, cb)
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
  let soon: ReturnType<typeof setTimeout> | undefined
  const fetchSoon = () => (clearTimeout(soon), (soon = setTimeout(fetchNow, 300)))
  fetchNow()
  const timer = setInterval(fetchNow, 60_000)
  document.addEventListener("visibilitychange", fetchNow)
  window.addEventListener(event, onEvent)
  const stopRefresh = onRefreshCounts(fetchSoon)
  return () => {
    clearInterval(timer)
    clearTimeout(soon)
    document.removeEventListener("visibilitychange", fetchNow)
    window.removeEventListener(event, onEvent)
    stopRefresh()
  }
}
