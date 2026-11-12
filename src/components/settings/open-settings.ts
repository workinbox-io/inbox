/**
 * Opens the one settings dialog (SettingsHost, mounted once per page by the layouts) from any app. Kept apart from the
 * dialog itself so apps don't bundle every settings panel just to open it. `?settings=<section>` in the address opens
 * it too (old /app/settings/* links redirect there).
 */
export type SettingsSection =
  | "signature"
  | "labels"
  | "filters"
  | "forwarding"
  | "storage"
  | "calendar"
  | "calendar-feed"
  | "notifications"
  | "appearance"
  | "account"
  | "ai-apps"
  | "organization"
  | "team"
  | "api-keys"
  | "audit"
  | "mail-admin"

export const OPEN_SETTINGS = "workinbox:open-settings"
/** Fired after a save that an open app shows elsewhere (detail: what was saved). */
export const SETTINGS_SAVED = "workinbox:settings-saved"

export type SettingsSaved =
  | { kind: "signatures"; signatures: Record<string, unknown> }
  | { kind: "calendar-prefs"; prefs: unknown }

export function openSettings(section?: SettingsSection, opts: { mailbox?: string } = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS, { detail: { section, ...opts } }))
}

export function onSettingsSaved(fn: (saved: SettingsSaved) => void) {
  const listener = (e: Event) => fn((e as CustomEvent<SettingsSaved>).detail)
  window.addEventListener(SETTINGS_SAVED, listener)
  return () => window.removeEventListener(SETTINGS_SAVED, listener)
}
