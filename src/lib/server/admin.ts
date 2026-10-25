import { env } from "cloudflare:workers";

/** Staff, from ADMIN_EMAILS (comma-separated). They see /app/admin; nobody else learns it exists. */
export function isAdmin(user: App.Locals["user"]) {
  if (!user?.emailVerified) return false;
  const admins = (env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}
