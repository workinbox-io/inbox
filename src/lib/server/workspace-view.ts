/**
 * Owners and admins pick how they use the apps (mail, notes): the "admin" view inside the dashboard (AppLayout,
 * sidebar) or the "user" view members get (full screen, app rail, account menu). One cookie per user, set by
 * /app/view; members always get the user view.
 */
import type { AstroCookies } from "astro";
import { canManage, type OrgRole } from "./roles";

export type WorkspaceView = "user" | "admin";

const cookieName = (userId: string) => `app-view-${userId}`;
/** Before notes, the choice was mail's own ("mail" or "console"). */
const legacyCookie = (userId: string) => `mail-view-${userId}`;

export function workspaceView(cookies: AstroCookies, userId: string, role: OrgRole | null): WorkspaceView {
  if (!canManage(role)) return "user";
  const value = cookies.get(cookieName(userId))?.value ?? cookies.get(legacyCookie(userId))?.value;
  return value === "admin" || value === "console" ? "admin" : "user";
}

export function setWorkspaceView(cookies: AstroCookies, userId: string, view: WorkspaceView, secure: boolean) {
  cookies.set(cookieName(userId), view, { path: "/", httpOnly: true, secure, sameSite: "lax", maxAge: 31_536_000 });
  cookies.delete(legacyCookie(userId), { path: "/" });
}

/** Where to land after switching: stay in the same app when it has both views, else its home. */
export function viewLanding(view: WorkspaceView, next: string | null) {
  const path = next && /^\/app\/(mail|notes)(\/[0-9a-f-]{36})?$/.test(next) ? next : null;
  return path ?? (view === "user" ? "/app/mail" : "/app");
}
