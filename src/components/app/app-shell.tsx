import * as React from "react"
import { ChartLine, Mail, PanelLeftIcon, Search } from "lucide-react"
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
import { APP_HELP, APP_NAV, APP_ACTIONS } from "@/config/nav"
import { siteConfig } from "@/config/site"
import { NavUser } from "./nav-user"
import { t } from "@/lib/i18n/panel"
import { badgeText, watchChatUnread, watchUnread } from "@/lib/mail/unread-badge"
import { usePaletteGroups } from "@/components/workspace/app-commands"
import { NavigationIndicator } from "@/components/workspace/navigation-indicator"

/** The dashboard navigation, mounted once alongside the routed content. */
interface AppShellProps {
  pathname: string
  user: { name: string; email: string } | null
  /** Staff (ADMIN_EMAILS) also get the Analytics page. */
  isAdmin?: boolean
  /** Staff with mailboxes set up (ADMIN_MAILBOXES) get Mail; `unread` threads show as a badge. */
  adminMail?: { unread: number } | null
  /** Open or collapsed to icons, as the viewer left it (the `sidebar_state` cookie of components/ui/sidebar.tsx). */
  sidebarOpen?: boolean
}

/** The header's toggle and search live outside the sidebar, so they ask it by event. */
const TOGGLE_EVENT = "app:toggle-sidebar"
const SEARCH_EVENT = "app:open-search"

const ADMIN_NAV = { href: "/app/admin", label: "Analytics", icon: ChartLine }
const ADMIN_MAIL_NAV = { href: "/app/admin-mail", label: "Mail", icon: Mail }

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

/** Opens or closes the sidebar from the header. */
export function SidebarToggle() {
  return (
    <Button variant="ghost" size="icon" className="-ml-1 size-7" onClick={() => window.dispatchEvent(new Event(TOGGLE_EVENT))}>
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
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
      <span className="max-sm:sr-only">Search…</span>
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

export function AppShell({ pathname, user, isAdmin, adminMail, sidebarOpen = true }: AppShellProps) {
  const nav = isAdmin ? [...APP_NAV, ADMIN_NAV, ...(adminMail ? [ADMIN_MAIL_NAV] : [])] : APP_NAV
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [mailUnread, setMailUnread] = React.useState(0)
  React.useEffect(() => watchUnread(setMailUnread), [])
  const [chatUnread, setChatUnread] = React.useState(0)
  React.useEffect(() => watchChatUnread(setChatUnread), [])
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
      heading: "Navigate",
      items: [...nav, ...APP_HELP].map((n) => ({ id: n.href, label: t(n.label), icon: <n.icon />, onSelect: go(n.href) })),
    },
    {
      heading: "Actions",
      items: APP_ACTIONS.map((a) => ({ id: a.href, label: t(a.label), icon: <a.icon />, onSelect: go(a.href) })),
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
                  <a href="/app">
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
                      <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={t(item.label)}>
                        <a href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
                          <item.icon />
                          <span>{t(item.label)}</span>
                        </a>
                      </SidebarMenuButton>
                      {item.href === "/app/mail" && mailUnread ? (
                        <SidebarMenuBadge className="text-primary-foreground bg-primary">{badgeText(mailUnread)}</SidebarMenuBadge>
                      ) : null}
                      {item.href === "/app/chat" && chatUnread ? (
                        <SidebarMenuBadge className="text-primary-foreground bg-primary">{badgeText(chatUnread)}</SidebarMenuBadge>
                      ) : null}
                      {item.href === ADMIN_MAIL_NAV.href && adminMail?.unread ? (
                        <SidebarMenuBadge className="text-primary-foreground bg-primary">{adminMail.unread > 99 ? "99+" : adminMail.unread}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
                <SidebarMenu>
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
          onSelect={() => setPaletteOpen(false)}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          placeholder={palette.placeholder ?? "Search pages and actions…"}
        />
      </SidebarProvider>
    </TooltipProvider>
  )
}
