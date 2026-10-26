import * as React from "react"
import { ChartLine, Search } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  CommandPalette,
  useCommandPaletteShortcut,
  type CommandPaletteGroup,
} from "@/components/ui/command-palette"
import { APP_HELP, APP_NAV, APP_ACTIONS } from "@/config/nav"
import { siteConfig } from "@/config/site"
import { NavUser } from "./nav-user"
import { ThemeToggle } from "./theme-toggle"

interface AppShellProps {
  pathname: string
  breadcrumbs: { label: string; href?: string }[]
  user: { name: string; email: string } | null
  /** Staff (ADMIN_EMAILS) also get the Analytics page. */
  isAdmin?: boolean
  children?: React.ReactNode
}

const ADMIN_NAV = { href: "/app/admin", label: "Analytics", icon: ChartLine }

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname.startsWith(href)
}

export function AppShell({ pathname, breadcrumbs, user, isAdmin, children }: AppShellProps) {
  const nav = isAdmin ? [...APP_NAV, ADMIN_NAV] : APP_NAV
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  useCommandPaletteShortcut(setPaletteOpen)
  const go = (href: string) => () => window.location.assign(href)

  const groups: CommandPaletteGroup[] = [
    {
      heading: "Navigate",
      items: [...nav, ...APP_HELP].map((n) => ({ id: n.href, label: n.label, icon: <n.icon />, onSelect: go(n.href) })),
    },
    {
      heading: "Actions",
      items: APP_ACTIONS.map((a) => ({ id: a.href, label: a.label, icon: <a.icon />, onSelect: go(a.href) })),
    },
  ]

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar variant="inset">
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
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground justify-start gap-2"
              onClick={() => setPaletteOpen(true)}
            >
              <Search />
              Search…
              <kbd className="bg-muted ml-auto rounded px-1.5 font-mono text-[10px]">⌘K</kbd>
            </Button>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {nav.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(pathname, item.href)}>
                        <a href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </a>
                      </SidebarMenuButton>
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
                      <SidebarMenuButton asChild size="sm">
                        <a href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
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
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <nav className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
              {breadcrumbs.map((b, i) => (
                <React.Fragment key={i}>
                  {i > 0 ? <span>/</span> : null}
                  {b.href ? (
                    <a href={b.href} className="hover:text-foreground truncate">
                      {b.label}
                    </a>
                  ) : (
                    <span className="text-foreground truncate font-medium">{b.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 md:p-8">{children}</main>
        </SidebarInset>
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
