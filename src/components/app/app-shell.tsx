import * as React from "react"
import { ChartLine, Mail, PanelLeftIcon, Search } from "lucide-react"
import { navigate } from "astro:transitions/client"

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
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  CommandPalette,
  useCommandPaletteShortcut,
  type CommandPaletteGroup,
} from "@/components/ui/command-palette"
import { APP_HELP, APP_NAV, APP_ACTIONS } from "@/config/nav"
import { siteConfig } from "@/config/site"
import { NavUser } from "./nav-user"
import { t } from "@/lib/i18n/panel"

/**
 * The dashboard's sidebar, command palette and toasts: one island that AppLayout keeps across
 * ClientRouter navigations (transition:persist), with each page's props. The page itself, header
 * included, is rendered by AppLayout next to it.
 */
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

/** The header's toggle and search (AppLayout) live outside the island, so they ask it by event. */
const TOGGLE_EVENT = "app:toggle-sidebar"
const SEARCH_EVENT = "app:open-search"

const ADMIN_NAV = { href: "/app/admin", label: "Analytics", icon: ChartLine }
const ADMIN_MAIL_NAV = { href: "/app/admin-mail", label: "Mail", icon: Mail }

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

/** The page on screen: the island stays across navigations, and pages may change the address themselves. */
function usePathname(initial: string) {
  const [pathname, setPathname] = React.useState(initial)
  React.useEffect(() => {
    const sync = () => setPathname(location.pathname)
    window.addEventListener("popstate", sync)
    document.addEventListener("astro:after-swap", sync)
    return () => {
      window.removeEventListener("popstate", sync)
      document.removeEventListener("astro:after-swap", sync)
    }
  }, [])
  return pathname
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

/** The sidebar's side of the persisted island: the header's toggle, and closing the phone sheet after each navigation. */
function SidebarSync() {
  const { setOpenMobile, toggleSidebar } = useSidebar()
  React.useEffect(() => {
    window.addEventListener(TOGGLE_EVENT, toggleSidebar)
    return () => window.removeEventListener(TOGGLE_EVENT, toggleSidebar)
  }, [toggleSidebar])
  React.useEffect(() => {
    const close = () => setOpenMobile(false)
    document.addEventListener("astro:after-swap", close)
    return () => document.removeEventListener("astro:after-swap", close)
  }, [setOpenMobile])
  return null
}

export function AppShell({ pathname: initialPathname, user, isAdmin, adminMail, sidebarOpen = true }: AppShellProps) {
  const pathname = usePathname(initialPathname)
  const nav = isAdmin ? [...APP_NAV, ADMIN_NAV, ...(adminMail ? [ADMIN_MAIL_NAV] : [])] : APP_NAV
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  useCommandPaletteShortcut(setPaletteOpen)
  React.useEffect(() => {
    const open = () => setPaletteOpen(true)
    // The palette lives in the persisted island: close it once the next page is in, however it was reached.
    const close = () => setPaletteOpen(false)
    window.addEventListener(SEARCH_EVENT, open)
    document.addEventListener("astro:after-swap", close)
    return () => {
      window.removeEventListener(SEARCH_EVENT, open)
      document.removeEventListener("astro:after-swap", close)
    }
  }, [])
  const go = (href: string) => () => {
    setPaletteOpen(false)
    void navigate(href)
  }

  const groups: CommandPaletteGroup[] = [
    {
      heading: "Navigate",
      items: [...nav, ...APP_HELP].map((n) => ({ id: n.href, label: t(n.label), icon: <n.icon />, onSelect: go(n.href) })),
    },
    {
      heading: "Actions",
      items: APP_ACTIONS.map((a) => ({ id: a.href, label: t(a.label), icon: <a.icon />, onSelect: go(a.href) })),
    },
  ]

  return (
    <TooltipProvider>
      {/* No box of its own: the sidebar sits in AppLayout's wrapper, next to the page. */}
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
              <SidebarGroupContent>
                <SidebarMenu>
                  {nav.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={t(item.label)}>
                        <a href={item.href}>
                          <item.icon />
                          <span>{t(item.label)}</span>
                        </a>
                      </SidebarMenuButton>
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
          groups={groups}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          placeholder="Search pages and actions…"
        />
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  )
}
