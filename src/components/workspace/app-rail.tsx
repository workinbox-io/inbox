import * as React from "react"
import { useLocation } from "react-router"
import { t } from "@/lib/i18n/panel"
import { siteConfig } from "@/config/site"
import { WORKSPACE_NAV } from "@/config/nav"
import { withoutDisabled } from "@/config/modules"
import { badgeText, watchUnread, watchChatUnread } from "@/lib/mail/unread-badge"
import { NavigationIndicator } from "./navigation-indicator"

/** User-view navigation stays mounted while the active workspace screen changes. */
export function AppRail({ search, notifications, disabled = [] }: { search: React.ReactNode; notifications: React.ReactNode; disabled?: string[] }) {
  const { pathname } = useLocation()
  const [mailUnread, setMailUnread] = React.useState(0)
  const [chatUnread, setChatUnread] = React.useState(0)
  React.useEffect(() => watchUnread(setMailUnread), [])
  React.useEffect(() => watchChatUnread(setChatUnread), [])
  return (
    <nav aria-label={t("Applications")} className="navigation-motion hidden w-14 shrink-0 flex-col items-center gap-1 border-r py-3 sm:flex">
      <NavigationIndicator pathname={pathname} className="bg-muted" />
      <a href="/app/mail" aria-label={siteConfig.name} className="group relative mb-2 flex size-9 items-center justify-center">
        <img src="/logo.svg" alt="" width="32" height="32" className="size-8" />
        <span role="tooltip" className="bg-foreground text-background pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-md px-3 py-1.5 text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{siteConfig.name}</span>
      </a>
      {search}
      {withoutDisabled(WORKSPACE_NAV, disabled).map((app) => {
        const unread = app.href === "/app/mail" ? mailUnread : app.href === "/app/chat" ? chatUnread : 0
        return <a
          key={app.href}
          href={app.href}
          aria-label={t(app.label)}
          aria-current={pathname === app.href || pathname.startsWith(`${app.href}/`) ? "page" : undefined}
          className="text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground group relative flex size-9 items-center justify-center rounded-md"
        >
          <app.icon className="size-5" aria-hidden />
          <span role="tooltip" className="bg-foreground text-background pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-md px-3 py-1.5 text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{t(app.label)}</span>
          {unread > 0 && <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold tabular-nums">{badgeText(unread)}</span>}
        </a>
      })}
      <div className="mt-auto">{notifications}</div>
    </nav>
  )
}
