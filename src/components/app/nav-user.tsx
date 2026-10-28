import * as React from "react"
import {
  Bell,
  BookOpen,
  ChevronsUpDown,
  Code,
  CreditCard,
  KeyRound,
  LifeBuoy,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
} from "lucide-react"
import { siteConfig } from "@/config/site"

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
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { UserAvatar } from "./user-avatar"

const THEMES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
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
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href="/app/settings/account">
                  <UserRound />
                  Account
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/app/settings/account#two-factor-authentication">
                  <ShieldCheck />
                  Two-factor authentication
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/app/settings/organization#team">
                  <Users />
                  Team
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/app/settings/organization#api-keys">
                  <KeyRound />
                  API keys
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/app/settings/notifications">
                  <Bell />
                  Notifications
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/app/billing">
                  <CreditCard />
                  Billing
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href="/docs">
                  <BookOpen />
                  Documentation
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/docs/api">
                  <Code />
                  API reference
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`mailto:${siteConfig.supportEmail}`}>
                  <LifeBuoy />
                  Contact support
                </a>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {React.createElement(THEMES.find((t) => t.value === theme)?.icon ?? Monitor, { className: "text-muted-foreground size-4" })}
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={theme}
                    onValueChange={(v) => {
                      window.setThemeMode(v as ThemeMode)
                      setTheme(v as ThemeMode)
                    }}
                  >
                    {THEMES.map((t) => (
                      <DropdownMenuRadioItem key={t.value} value={t.value}>
                        {t.label}
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
                Sign out
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
