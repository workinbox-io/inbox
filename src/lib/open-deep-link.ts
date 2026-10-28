/** How long an app has to take the focus before we say it didn't open. */
const LAUNCH_TIMEOUT = 1200

/**
 * Opening a custom scheme is silent when no app registered it: the browser reports neither success nor failure. The
 * only signal is the page losing focus, to the app or to the browser's "Open this app?" prompt. A page that was already
 * hidden or unfocused gives nothing to measure, so that counts as opened rather than a false "didn't open".
 */
function attempt(url: string) {
  const measurable = !document.hidden && document.hasFocus()
  return new Promise<boolean>((resolve) => {
    let settled = false
    const settle = (launched: boolean) => {
      if (settled) return
      settled = true
      window.removeEventListener("blur", onLeave)
      document.removeEventListener("visibilitychange", onLeave)
      clearTimeout(timer)
      resolve(launched)
    }
    const onLeave = () => settle(true)
    const timer = setTimeout(() => settle(!measurable || document.hidden || !document.hasFocus()), LAUNCH_TIMEOUT)
    if (measurable) {
      window.addEventListener("blur", onLeave)
      document.addEventListener("visibilitychange", onLeave)
    }
    // A custom scheme hands off to the OS without leaving the page.
    window.location.href = url
  })
}

/** Tries each app link in turn, stopping at the first that takes the focus. False: none is installed (or a phone). */
export async function openDeepLink(urls: string[]) {
  for (const url of urls) if (await attempt(url)) return true
  return false
}
