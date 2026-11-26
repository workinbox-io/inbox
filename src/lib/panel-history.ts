import type { NavigateOptions } from "react-router"
import { panelArea } from "./app-routes"

export const PANEL_NAVIGATION = "app:navigation"
type Navigate = (url: string, options?: NavigateOptions) => void
let navigate: Navigate | undefined
const guards = new Set<() => boolean>()

/** The one router owns history, including addresses changed by the open app. */
export function connectPanelHistory(next: Navigate) {
  navigate = next
  return () => { if (navigate === next) navigate = undefined }
}

export function isPanelLink(url: URL) {
  return panelArea(url.pathname) !== null
}

export function navigatePanel(url: string | URL, options?: NavigateOptions) {
  const next = new URL(url, location.href)
  if (navigate && next.origin === location.origin && isPanelLink(next)) navigate(next.pathname + next.search + next.hash, options)
  else location.assign(next.href)
}

function changeUrl(url: string | URL, replace: boolean) {
  const next = new URL(url, location.href)
  if (next.href === location.href) return
  if (navigate) navigatePanel(next, { replace, state: { panelLocal: true }, preventScrollReset: true })
  else history[replace ? "replaceState" : "pushState"](history.state, "", next)
}

export const replaceUrl = (url: string | URL) => changeUrl(url, true)
export const pushUrl = (url: string | URL) => changeUrl(url, false)

/** Read by the router's blocker at navigation time, so pending saves need no global React state. */
export const panelSavePending = () => [...guards].some((active) => active())

export function guardLeaving(active: () => boolean) {
  guards.add(active)
  const unload = (e: BeforeUnloadEvent) => { if (active()) e.preventDefault() }
  window.addEventListener("beforeunload", unload)
  return () => {
    guards.delete(active)
    window.removeEventListener("beforeunload", unload)
  }
}
