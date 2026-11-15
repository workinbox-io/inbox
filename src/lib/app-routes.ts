/** Shared by the server and client: only these addresses are panel screens. */
export const APP_SCREENS = ["overview", "mail", "external-mail", "chat", "calendar", "notes", "contacts", "drive", "billing", "admin", "admin-mail", "change-password", "recovery-email"] as const
export type AppScreen = (typeof APP_SCREENS)[number]

const UUID = /^[0-9a-f-]{36}$/
const WORKSPACE = new Set(["chat", "calendar", "notes", "contacts", "drive"])

export function appRoute(pathname: string): { screen: AppScreen; id: string | null } | null {
  const path = pathname.replace(/\/$/, "")
  if (path === "/app") return { screen: "overview", id: null }
  const external = /^\/app\/mail\/external\/([a-zA-Z0-9_-]{1,128})$/.exec(path)
  if (external) return { screen: "external-mail", id: external[1]! }
  const match = /^\/app\/([^/]+)(?:\/([^/]+))?$/.exec(path)
  if (!match) return null
  const [, name, id] = match
  if (WORKSPACE.has(name!) && (!id || UUID.test(id))) return { screen: name as AppScreen, id: id ?? null }
  if (!id && APP_SCREENS.includes(name as AppScreen) && name !== "overview" && name !== "external-mail")
    return { screen: name as AppScreen, id: null }
  return null
}

/** A thread/folder change stays in the current app; external accounts have separate state. */
export function appScreenKey(pathname: string) {
  const route = appRoute(pathname)
  if (!route) return null
  if (route.screen === "external-mail" || (route.screen === "calendar" && route.id)) return `${route.screen}:${route.id}`
  return route.screen
}
