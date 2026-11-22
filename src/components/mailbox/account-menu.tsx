import * as React from "react"
import { ChevronsUpDown, Download, KeyRound, LayoutDashboard, LogOut, Monitor, Moon, PenLine, Settings, Sun } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { navigatePanel } from "@/lib/panel-history"
import { tapllEvent } from "@/lib/tapll"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { openSettings, type SettingsSection } from "@/components/settings/open-settings"
import { UserAvatar } from "@/components/app/user-avatar"
import { t } from "@/lib/i18n/panel"
import { WorkspaceMenu } from "@/components/workspace/workspace-menu"

export interface MailUser {
  name: string
  email: string
}

/** Chrome's and Edge's install prompt (beforeinstallprompt). It fires once, early, so it's caught at module load. */
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
let installPrompt: InstallPrompt | null = null
const installListeners = new Set<() => void>()
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    installPrompt = e as InstallPrompt
    installListeners.forEach((l) => l())
  })
  window.addEventListener("appinstalled", () => {
    installPrompt = null
    installListeners.forEach((l) => l())
  })
}

/** The pending install prompt, or null when the browser has none (already installed, Safari, Firefox). */
function useInstallPrompt() {
  return React.useSyncExternalStore(
    (l) => (installListeners.add(l), () => installListeners.delete(l)),
    () => installPrompt,
    () => null,
  )
}

/**
 * The account corner of the apps' rail: settings, the admin console (owners and admins), theme, sign out.
 * `compact` is the avatar alone, for the phone layout's list header.
 */
export function AccountMenu({
  user,
  onSettings = (section) => openSettings(section),
  compact = false,
  canManage = false,
}: {
  user: MailUser
  /** Opens the settings dialog; Mail passes its own to start at the open mailbox. */
  onSettings?: (section?: SettingsSection) => void
  compact?: boolean
  canManage?: boolean
}) {
  const install = useInstallPrompt()
  return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {compact ? (
            <button type="button" className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]" aria-label={t("Account")}>
              <UserAvatar seed={user.email} size={28} />
            </button>
          ) : (
            <button
              type="button"
              className="hover:bg-foreground/[0.035] focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-[3px]"
            >
              <UserAvatar seed={user.email} size={26} />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[13px] font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-[11px]">{user.email}</span>
              </span>
              <ChevronsUpDown className="text-muted-foreground size-3.5" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-56">
          <DropdownMenuLabel className="grid font-normal">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="text-muted-foreground truncate text-xs">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <WorkspaceMenu />
          {canManage && (
            <>
              <DropdownMenuItem onSelect={() => navigatePanel("/admin")}>
                <LayoutDashboard /> {t("Admin console")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => onSettings()}>
            <Settings /> {t("Settings")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSettings("signature")}>
            <PenLine /> {t("Signature")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSettings("account")}>
            <KeyRound /> {t("Change password")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => {
            e.preventDefault()
            window.setThemeMode(window.nextThemeMode())
          }}>
            <Monitor className="hidden in-data-[theme-mode=system]:block" />
            <Sun className="hidden in-data-[theme-mode=light]:block" />
            <Moon className="hidden in-data-[theme-mode=dark]:block" />
            {t("Theme")}
          </DropdownMenuItem>
          {install ? (
            <DropdownMenuItem
              onSelect={async () => {
                tapllEvent("app_install_started")
                await install.prompt()
                tapllEvent((await install.userChoice).outcome === "accepted" ? "app_installed" : "app_install_dismissed")
              }}
            >
              <Download /> {t("Install app")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await authClient.signOut()
              window.tapll?.("reset")
              location.href = "/login"
            }}
          >
            <LogOut /> {t("Sign out")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  )
}
