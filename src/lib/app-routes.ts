/**
 * Shared by the server and client: the panel router serves three areas, each with its own frame.
 * - `/app/*`: the apps, for everyone (app rail).
 * - `/admin/*`: the organization's admin console, owners and admins (sidebar).
 * - `/staff/*`: the platform operator's tools, ADMIN_EMAILS only (sidebar).
 */
export const PANEL_AREAS = ["app", "admin", "staff"] as const
export type PanelArea = (typeof PANEL_AREAS)[number]

/** Console pages that show a settings section; the value is its section in the settings dialog. */
export const ADMIN_SETTINGS = {
  people: "people",
  mail: "mail-admin",
  apps: "modules",
  "api-keys": "api-keys",
  audit: "audit",
  organization: "organization",
} as const
export type AdminSettingsPage = keyof typeof ADMIN_SETTINGS

export const APP_SCREENS = ["mail", "external-mail", "chat", "calendar", "notes", "contacts", "drive", "collections", "change-password", "recovery-email", "overview", "billing", "admin-settings", "settings", "staff", "staff-mail"] as const
export type AppScreen = (typeof APP_SCREENS)[number]

const UUID = /^[0-9a-f-]{36}$/
const WORKSPACE = new Set(["chat", "calendar", "notes", "contacts", "drive", "collections"])
const SINGLE = new Set(["mail", "change-password", "recovery-email"])

export function panelArea(pathname: string): PanelArea | null {
  return PANEL_AREAS.find((area) => pathname === `/${area}` || pathname.startsWith(`/${area}/`)) ?? null
}

/** The console page that holds a settings dialog section, if one does. */
export function adminPageOf(section: string | null | undefined): AdminSettingsPage | null {
  return (Object.keys(ADMIN_SETTINGS) as AdminSettingsPage[]).find((page) => ADMIN_SETTINGS[page] === section) ?? null
}

export function appRoute(pathname: string): { screen: AppScreen; id: string | null } | null {
  const path = pathname.replace(/\/$/, "")
  if (path === "/admin") return { screen: "overview", id: null }
  if (path === "/admin/billing") return { screen: "billing", id: null }
  const admin = /^\/admin\/([^/]+)$/.exec(path)
  if (admin) return Object.hasOwn(ADMIN_SETTINGS, admin[1]!) ? { screen: "admin-settings", id: admin[1]! } : null
  if (path === "/staff") return { screen: "staff", id: null }
  if (path === "/staff/mail") return { screen: "staff-mail", id: null }
  const external = /^\/app\/mail\/external\/([a-zA-Z0-9_-]{1,128})$/.exec(path)
  if (external) return { screen: "external-mail", id: external[1]! }
  const match = /^\/app\/([^/]+)(?:\/([^/]+))?$/.exec(path)
  if (!match) return null
  if (match[1] === "settings") return { screen: "settings", id: match[2] ?? null }
  const [, name, id] = match
  if (WORKSPACE.has(name!) && (!id || UUID.test(id))) return { screen: name as AppScreen, id: id ?? null }
  if (!id && SINGLE.has(name!)) return { screen: name as AppScreen, id: null }
  return null
}

/** A thread/folder change stays in the current app; external accounts have separate state. */
export function appScreenKey(pathname: string) {
  const route = appRoute(pathname)
  if (!route) return null
  // Each collection and each console page is its own screen: switching loads its data.
  if (route.screen === "external-mail" || route.screen === "collections" || route.screen === "admin-settings" || (route.screen === "calendar" && route.id)) return `${route.screen}:${route.id}`
  return route.screen
}
