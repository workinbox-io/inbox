import { t } from "@/lib/i18n/panel"

/**
 * Better Auth's own error messages are English; the ones people meet in the forms are mapped to translated texts
 * by code or message, anything else is shown as the server sent it.
 */
export function authErrorText(error: { code?: string; message?: string }, fallback?: string): string {
  const code = error.code ?? ""
  const msg = (error.message ?? "").replace(/\.$/, "").toLowerCase()
  if (code === "SESSION_NOT_FRESH" || code === "SESSION_EXPIRED" || msg.startsWith("session expired")) return t("For your security, sign out and back in, then try again.")
  if (code === "INVALID_EMAIL_OR_PASSWORD" || msg === "invalid email or password") return t("Wrong email or password.")
  if (code === "INVALID_PASSWORD" || msg === "invalid password") return t("Wrong password.")
  if (code === "PASSWORD_TOO_SHORT" || msg === "password too short") return t("Use at least 10 characters.")
  if (code === "PASSWORD_TOO_LONG" || msg === "password too long") return t("That password is too long.")
  if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" || msg.startsWith("user already exists")) return t("An account with this email already exists.")
  if (code === "EMAIL_NOT_VERIFIED" || msg === "email not verified") return t("Confirm your email first.")
  if (code === "INVALID_EMAIL" || msg === "invalid email") return t("That email address isn't valid.")
  if (code === "INVALID_TOKEN" || msg === "invalid token") return t("This link is invalid or has expired.")
  if (code === "TOO_MANY_REQUESTS" || msg.startsWith("too many requests")) return t("Too many attempts. Try again in a moment.")
  if (code === "INVALID_CODE" || msg === "invalid code") return t("That code didn't work")
  if (code === "INVALID_BACKUP_CODE" || msg === "invalid backup code") return t("That backup code didn't work.")
  return error.message ? t(error.message) : (fallback ?? t("Something went wrong"))
}
