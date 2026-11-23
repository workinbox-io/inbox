/**
 * Opens the settings page (/app/settings/<section>, settings-page.tsx) from any app. Kept apart from the page itself so
 * apps don't bundle every settings panel just to link to it.
 */
import { navigatePanel } from "@/lib/panel-history"

export type SettingsSection =
  | "signature"
  | "labels"
  | "filters"
  | "forwarding"
  | "auto-reply"
  | "templates"
  | "storage"
  | "calendar"
  | "calendar-feed"
  | "notifications"
  | "appearance"
  | "account"
  | "ai-apps"
  | "organization"
  | "team"
  | "people"
  | "api-keys"
  | "audit"
  | "mail-admin"
  | "mail-clients"
  | "modules"

/** Fired after a save that an open app shows elsewhere (detail: what was saved). */
export const SETTINGS_SAVED = "workinbox:settings-saved"

export type SettingsSaved =
  | { kind: "mail-imports" }
  | { kind: "signatures"; signatures: Record<string, unknown> }
  | { kind: "calendar-prefs"; prefs: unknown }
  | { kind: "calendars" }

export const notifySaved = (detail: SettingsSaved) => window.dispatchEvent(new CustomEvent(SETTINGS_SAVED, { detail }))

export function openSettings(section?: SettingsSection, opts: { mailbox?: string } = {}) {
  // Owners' and admins' organization sections redirect to the admin console (legacyRedirect).
  navigatePanel(`/app/settings${section ? `/${section}` : ""}${opts.mailbox ? `?mailbox=${encodeURIComponent(opts.mailbox)}` : ""}`)
}

export function onSettingsSaved(fn: (saved: SettingsSaved) => void) {
  const listener = (e: Event) => fn((e as CustomEvent<SettingsSaved>).detail)
  window.addEventListener(SETTINGS_SAVED, listener)
  return () => window.removeEventListener(SETTINGS_SAVED, listener)
}
