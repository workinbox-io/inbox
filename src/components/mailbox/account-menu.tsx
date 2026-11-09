import * as React from "react"
import { ChevronsUpDown, KeyRound, LayoutDashboard, LogOut, Monitor, Moon, PenLine, Settings, Sun } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { PreferenceSection } from "./mail-preferences"
import { UserAvatar } from "@/components/app/user-avatar"

export interface MailUser {
  name: string
  email: string
}

/**
 * The account corner of the mail-only view (members): settings, theme, sign out.
 * `compact` is the avatar alone, for the phone layout's list header.
 */
export function AccountMenu({ user, onSettings, compact = false, canManage = false }: { user: MailUser; onSettings?: (section?: PreferenceSection) => void; compact?: boolean; canManage?: boolean }) {
  return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {compact ? (
            <button type="button" className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]" aria-label="Account">
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
          {canManage && <DropdownMenuItem asChild><a href="/app/mail?view=console"><LayoutDashboard /> Admin console</a></DropdownMenuItem>}
          {onSettings ? (
            <>
              <DropdownMenuItem onSelect={() => onSettings()}>
                <Settings /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSettings("signature")}>
                <PenLine /> Signature
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSettings("password")}>
                <KeyRound /> Change password
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem onSelect={(e) => {
            e.preventDefault()
            window.setThemeMode(window.nextThemeMode())
          }}>
            <Monitor className="hidden in-data-[theme-mode=system]:block" />
            <Sun className="hidden in-data-[theme-mode=light]:block" />
            <Moon className="hidden in-data-[theme-mode=dark]:block" />
            Theme
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await authClient.signOut()
              location.href = "/login"
            }}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  )
}
