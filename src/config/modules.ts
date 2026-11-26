/**
 * Apps an owner or admin can turn off for the organization (Settings → Organization → Apps, MCP `workspace_app_set`).
 * Mail is the core and always on. A turned-off app disappears from the rail, sidebar, ⌘K and MCP, and its /app,
 * /api/app and /api/v1 paths answer 404. Pure module: shared by the server and the browser.
 */
export const OPTIONAL_MODULES = ["chat", "calendar", "notes", "contacts", "drive", "collections"] as const;
export type ModuleId = (typeof OPTIONAL_MODULES)[number];

export const isModuleId = (id: unknown): id is ModuleId => OPTIONAL_MODULES.includes(id as ModuleId);

/** Under an app's path but used by every app (sharing dialogs, @mentions): never turned off with it. */
const SHARED_PATHS = ["/api/app/notes/people"];

/** The app a /app, /api/app or /api/v1 address belongs to, or null for everything else (mail, settings…). */
export function moduleOfPath(path: string): ModuleId | null {
  if (SHARED_PATHS.includes(path)) return null;
  const name = /^\/(?:app|api\/app|api\/v1)\/([^/?#]+)/.exec(path)?.[1];
  return isModuleId(name) ? name : null;
}

let offInBrowser: readonly string[] = [];
/** Set by the panel router from the page's context, so components deep inside (composer, event panel) can hide links into turned-off apps. */
export const setDisabledInBrowser = (disabled: readonly string[]) => void (offInBrowser = disabled);
/** In the browser: is this app on for the organization? */
export const appOn = (id: ModuleId) => !offInBrowser.includes(id);

/** Navigation entries without the turned-off apps. */
export const withoutDisabled = <T extends { href: string }>(items: T[], disabled: readonly string[]) =>
  items.filter((n) => !disabled.includes(moduleOfPath(n.href) ?? ""));
