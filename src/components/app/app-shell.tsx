import * as React from "react"
import { ArrowLeft, PanelLeftIcon, Search } from "lucide-react"
import { navigatePanel, PANEL_NAVIGATION } from "@/lib/panel-history"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  CommandPalette,
  openAppSearch,
  useCommandPaletteShortcut,
  type CommandPaletteGroup,
} from "@/components/ui/command-palette"
import { APP_HELP, APP_ACTIONS, WORKSPACE_NAV } from "@/config/nav"
import { withoutDisabled } from "@/config/modules"
import { siteConfig } from "@/config/site"
import { NavUser } from "./nav-user"
import { t } from "@/lib/i18n/panel"
import { badgeText } from "@/lib/mail/unread-badge"
import { usePaletteGroups } from "@/components/workspace/app-commands"
import { NavigationIndicator } from "@/components/workspace/navigation-indicator"

export interface ShellNavItem {
  href: string
  label: string
  icon: React.ComponentType
}

/** The admin console's and staff tools' sidebar (the apps have AppRail), mounted once alongside the routed content. */
interface AppShellProps {
  pathname: string
  /** The area's pages (config/nav.ts: ADMIN_NAV or STAFF_NAV); the first one is its home. */
  nav: ShellNavItem[]
  /** Counts shown next to pages, by href. */
  badges?: Record<string, number>
  user: { name: string; email: string } | null
  /** Open or collapsed to icons, as the viewer left it (the `sidebar_state` cookie of components/ui/sidebar.tsx). */
  sidebarOpen?: boolean
  /** Apps the organization turned off (config/modules.ts). */
  disabled?: string[]
}

/** The header's toggle and search live outside the sidebar, so they ask it by event. */
const TOGGLE_EVENT = "app:toggle-sidebar"
const SEARCH_EVENT = "app:open-search"

/** The area's home matches only itself; other pages also match what's below them. */
function isActive(pathname: string, href: string, home: string) {
  return href === home ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

/** Opens or closes the sidebar from the header. */
export function SidebarToggle() {
  return (
    <Button variant="ghost" size="icon" className="-ml-1 size-7" onClick={() => window.dispatchEvent(new Event(TOGGLE_EVENT))}>
      <PanelLeftIcon />
      <span className="sr-only">{t("Toggle sidebar")}</span>
    </Button>
  )
}

/** Opens the command palette from the header. */
export function SearchButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="text-muted-foreground w-9 justify-start gap-2 px-0 max-sm:justify-center sm:w-56 sm:px-3"
      onClick={() => window.dispatchEvent(new Event(SEARCH_EVENT))}
    >
      <Search />
      <span className="max-sm:sr-only">{t("Search…")}</span>
      <kbd className="bg-muted ml-auto rounded px-1.5 font-mono text-[10px] max-sm:hidden">⌘K</kbd>
    </Button>
  )
}

/** The sidebar's shared controls: the header's toggle, and closing the phone sheet after each navigation. */
function SidebarSync() {
  const { setOpenMobile, toggleSidebar } = useSidebar()
  React.useEffect(() => {
    window.addEventListener(TOGGLE_EVENT, toggleSidebar)
    return () => window.removeEventListener(TOGGLE_EVENT, toggleSidebar)
  }, [toggleSidebar])
  React.useEffect(() => {
    const close = () => setOpenMobile(false)
    window.addEventListener(PANEL_NAVIGATION, close)
    return () => window.removeEventListener(PANEL_NAVIGATION, close)
  }, [setOpenMobile])
  return null
}

export function AppShell({ pathname, nav, badges = {}, user, sidebarOpen = true, disabled = [] }: AppShellProps) {
  const home = nav[0]!.href
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  useCommandPaletteShortcut(setPaletteOpen)
  React.useEffect(() => {
    const open = () => openAppSearch(() => setPaletteOpen(true))
    // Close the palette after navigation.
    const close = () => setPaletteOpen(false)
    window.addEventListener(SEARCH_EVENT, open)
    window.addEventListener(PANEL_NAVIGATION, close)
    return () => {
      window.removeEventListener(SEARCH_EVENT, open)
      window.removeEventListener(PANEL_NAVIGATION, close)
    }
  }, [])
  const go = (href: string) => () => {
    setPaletteOpen(false)
    navigatePanel(href)
  }

  const shared: CommandPaletteGroup[] = [
    {
      heading: t("Navigate"),
      items: [...nav, ...withoutDisabled(WORKSPACE_NAV, disabled), ...APP_HELP].map((n) => ({ id: n.href, label: t(n.label), icon: <n.icon />, onSelect: go(n.href) })),
    },
    {
      heading: t("Actions"),
      items: withoutDisabled(APP_ACTIONS, disabled).map((a) => ({ id: a.href, label: t(a.label), icon: <a.icon />, onSelect: go(a.href) })),
    },
  ]

  const palette = usePaletteGroups(shared, paletteOpen)

  return (
    <TooltipProvider>
      {/* The sidebar shares the outer layout with the routed content. */}
      <SidebarProvider defaultOpen={sidebarOpen} className="contents">
        <SidebarSync />
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <a href={home}>
                    <img src="/logo.svg" alt="" className="size-7" />
                    <span className="font-medium tracking-tight">{siteConfig.name}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent className="navigation-motion">
                <NavigationIndicator pathname={pathname} className="bg-sidebar-accent" />
                <SidebarMenu>
                  {nav.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(pathname, item.href, home)} tooltip={t(item.label)}>
                        <a href={item.href} aria-current={isActive(pathname, item.href, home) ? "page" : undefined}>
                          <item.icon />
                          <span>{t(item.label)}</span>
                        </a>
                      </SidebarMenuButton>
                      {badges[item.href] ? (
                        <SidebarMenuBadge className="text-primary-foreground bg-primary">{badgeText(badges[item.href]!)}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild size="sm" tooltip={t("Go to apps")}>
                      <a href="/app/mail">
                        <ArrowLeft />
                        <span>{t("Go to apps")}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {APP_HELP.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild size="sm" tooltip={t(item.label)}>
                        <a href={item.href}>
                          <item.icon />
                          <span>{t(item.label)}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          {user ? (
            <SidebarFooter>
              <NavUser user={user} />
            </SidebarFooter>
          ) : null}
        </Sidebar>
        <CommandPalette
          groups={palette.groups}
          onQueryChange={palette.onQueryChange}
          loading={palette.loading}
          onSelect={() => setPaletteOpen(false)}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          size="wide" placeholder={palette.placeholder ?? t("Search everything…")}
        />
      </SidebarProvider>
    </TooltipProvider>
  )
}
