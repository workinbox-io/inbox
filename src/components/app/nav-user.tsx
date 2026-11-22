import * as React from "react"
import {
  Bell,
  BookOpen,
  ChevronsUpDown,
  Code,
  LifeBuoy,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react"
import { siteConfig } from "@/config/site"
import { t } from "@/lib/i18n/panel"
import { openSettings } from "@/components/settings/open-settings"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { WorkspaceMenu } from "@/components/workspace/workspace-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { UserAvatar } from "./user-avatar"

const THEMES = [
  { value: "system", label: () => t("System"), icon: Monitor },
  { value: "light", label: () => t("Light"), icon: Sun },
  { value: "dark", label: () => t("Dark"), icon: Moon },
] as const

/** The account menu at the bottom of the sidebar: settings shortcuts, help, theme and sign out. */
export function NavUser({ user }: { user: { name: string; email: string } }) {
  const { isMobile } = useSidebar()
  const [theme, setTheme] = React.useState<ThemeMode>("system")

  const identity = (
    <>
      <UserAvatar seed={user.email} size={32} />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="text-muted-foreground truncate text-xs">{user.email}</span>
      </div>
    </>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) setTheme((document.documentElement.dataset.themeMode as ThemeMode | undefined) ?? "system")
          }}
        >
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              {identity}
              <ChevronsUpDown className="text-muted-foreground ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">{identity}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <WorkspaceMenu />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => openSettings("account")}>
                <UserRound />
                {t("Account")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openSettings("account")}>
                <ShieldCheck />
                {t("Two-factor authentication")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openSettings("notifications")}>
                <Bell />
                {t("Notifications")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href="/docs">
                  <BookOpen />
                  {t("Documentation")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/docs/api">
                  <Code />
                  {t("API reference")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`mailto:${siteConfig.supportEmail}`}>
                  <LifeBuoy />
                  {t("Contact support")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {React.createElement(THEMES.find((th) => th.value === theme)?.icon ?? Monitor, { className: "text-muted-foreground size-4" })}
                  {t("Theme")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={theme}
                    onValueChange={(v) => {
                      window.setThemeMode(v as ThemeMode)
                      setTheme(v as ThemeMode)
                    }}
                  >
                    {THEMES.map((th) => (
                      <DropdownMenuRadioItem key={th.value} value={th.value}>
                        {th.label()}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a data-astro-reload href="/api/auth/sign-out-redirect">
                <LogOut />
                {t("Sign out")}
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
