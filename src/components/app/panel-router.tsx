import * as React from "react"
import { createBrowserRouter, isRouteErrorResponse, Outlet, redirect, RouterProvider, ScrollRestoration, useBlocker, useLoaderData, useLocation, useMatches, useNavigation, useNavigationType, useRevalidator, useRouteError, type LoaderFunctionArgs, type RouteObject } from "react-router"
import { useIsMobile } from "@/hooks/use-mobile"
import { AppShell, SearchButton, SidebarToggle } from "./app-shell"
import { ThemeToggle } from "./theme-toggle"
import { AppNotFound } from "./not-found"
import { AppLoading } from "./app-loading"
import { AppRail } from "@/components/workspace/app-rail"
import { AppSearch } from "@/components/workspace/app-search"
import { NotificationCenter } from "@/components/mailbox/notification-center"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/toaster"
import { appScreenKey } from "@/lib/app-routes"
import { isChunkLoadError, recoverChunkLoad } from "@/lib/panel-load-error"
import { connectPanelHistory, isPanelLink, navigatePanel, PANEL_NAVIGATION, panelSavePending } from "@/lib/panel-history"
import { ADMIN_NAV, STAFF_NAV } from "@/config/nav"
import { setDisabledInBrowser } from "@/config/modules"
import { siteConfig } from "@/config/site"
import { t } from "@/lib/i18n/panel"
import type { AppContext, AppPage } from "@/lib/server/app-page"
import { WorkspacesProvider } from "@/components/workspace/workspace-menu"

const screens = {
  overview: React.lazy(() => import("./overview-panel").then((m) => ({ default: m.OverviewPanel }))),
  mail: React.lazy(() => import("@/components/mailbox/mailbox-app").then((m) => ({ default: m.MailboxApp }))),
  externalMail: React.lazy(() => import("@/components/mailbox/external-mailbox").then((m) => ({ default: m.ExternalMailbox }))),
  chat: React.lazy(() => import("@/components/chat/chat-app").then((m) => ({ default: m.ChatApp }))),
  calendar: React.lazy(() => import("@/components/calendar/calendar-app").then((m) => ({ default: m.CalendarApp }))),
  notes: React.lazy(() => import("@/components/notes/notes-app").then((m) => ({ default: m.NotesApp }))),
  contacts: React.lazy(() => import("@/components/contacts/contacts-app").then((m) => ({ default: m.ContactsApp }))),
  drive: React.lazy(() => import("@/components/drive/drive-app").then((m) => ({ default: m.DriveApp }))),
  collections: React.lazy(() => import("@/components/collections/collections-app").then((m) => ({ default: m.CollectionsApp }))),
  billing: React.lazy(() => import("./billing-panel").then((m) => ({ default: m.BillingPanel }))),
  adminSettings: React.lazy(() => import("@/components/settings/settings-page").then((m) => ({ default: m.SettingsPage }))),
  settings: React.lazy(() => import("@/components/settings/settings-page").then((m) => ({ default: m.SettingsScreen }))),
  staff: React.lazy(() => import("./admin-panel").then((m) => ({ default: m.AdminPanel }))),
  staffMail: React.lazy(() => import("@/components/admin-mail/admin-mail").then((m) => ({ default: m.AdminMail }))),
  changePassword: React.lazy(() => import("@/components/mailbox/security-settings").then((m) => ({ default: m.RequiredPasswordChange }))),
  recoveryEmail: React.lazy(() => import("@/components/mailbox/security-settings").then((m) => ({ default: m.VerifyRecoveryEmail }))),
}

/** Check the screen/props relationship when server loaders or existing components change. */
function Screen() {
  const page = useLoaderData() as AppPage
  const location = useLocation()
  let screen: React.ReactNode
  switch (page.screen) {
    case "not-found": screen = <AppNotFound />; break
    case "overview": screen = <screens.overview {...page.props} />; break
    case "mail": screen = <screens.mail {...page.props} />; break
    case "external-mail": screen = <screens.externalMail key={page.props.connectionId} {...page.props} />; break
    case "chat": screen = <screens.chat {...page.props} />; break
    case "calendar": screen = <screens.calendar {...page.props} />; break
    case "notes": screen = <screens.notes {...page.props} />; break
    case "contacts": screen = <screens.contacts {...page.props} />; break
    case "drive": screen = <screens.drive {...page.props} />; break
    case "collections": screen = <screens.collections key={page.props.collectionId ?? ""} {...page.props} />; break
    case "billing": screen = <screens.billing {...page.props} />; break
    case "admin-settings": screen = <screens.adminSettings key={page.props.page} {...page.props} />; break
    case "settings": screen = <screens.settings {...page.props} />; break
    case "staff": screen = <screens.staff {...page.props} />; break
    case "staff-mail": screen = <screens.staffMail {...page.props} />; break
    case "change-password": screen = <screens.changePassword />; break
    case "recovery-email": screen = <screens.recoveryEmail token={new URLSearchParams(location.search).get("token") ?? ""} />; break
  }
  return <React.Suspense fallback={<AppLoading />}>{screen}</React.Suspense>
}

function PageError() {
  const error = useRouteError()
  const revalidator = useRevalidator()
  const missing = isRouteErrorResponse(error) && error.status === 404
  const chunkFailed = isChunkLoadError(error)
  React.useEffect(() => { recoverChunkLoad(error) }, [error])
  if (missing) return <AppNotFound />
  return <div role="alert" className="flex flex-col items-start gap-4 p-6">
    <p>{chunkFailed ? t("The app could not finish loading. Reload the page to try again.") : t("Could not load this page.")}</p>
    <Button variant="outline" onClick={() => chunkFailed ? window.location.reload() : void revalidator.revalidate()}>{t("Retry")}</Button>
    <a href="/app/mail">{t("Back to mail")}</a>
  </div>
}

function PanelLayout({ initial }: { initial: AppPage }) {
  const mobile = useIsMobile(640)
  const matches = useMatches()
  const page = matches.at(-1)?.loaderData as AppPage | undefined
  const context = page?.context ?? initial.context
  setDisabledInBrowser(context.disabled)
  const location = useLocation()
  const navigation = useNavigation()
  const navigationType = useNavigationType()
  const screen = appScreenKey(location.pathname)
  const standalone = screen === "change-password" || screen === "recovery-email"
  // The apps get the rail; the admin console and staff tools the sidebar (lib/app-routes.ts).
  const userView = context.area === "app"
  const fullBleed = userView || screen === "staff-mail"
  const nav = context.area === "staff" ? STAFF_NAV : context.isAdmin ? [...ADMIN_NAV, STAFF_NAV[0]!] : ADMIN_NAV
  const title = page?.title ?? t("Not found")
  const firstNavigation = React.useRef(true)
  const previousScreen = React.useRef(screen)
  const mainRef = React.useRef<HTMLElement>(null)
  const blocker = useBlocker(({ nextLocation, historyAction }) =>
    panelSavePending() && !(historyAction !== "POP" && nextLocation.state?.panelLocal))
  React.useEffect(() => {
    if (blocker.state !== "blocked") return
    if (window.confirm(t("You have unsaved changes or a save in progress. Leave this page?"))) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  React.useEffect(() => {
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element)?.closest<HTMLAnchorElement>("a[href]")
      if (!link || link.hasAttribute("download") || link.hasAttribute("data-astro-reload") || (link.target && link.target !== "_self")) return
      const url = new URL(link.href)
      if (url.origin !== window.location.origin || !isPanelLink(url)) return
      event.preventDefault()
      navigatePanel(url)
    }
    document.addEventListener("click", click)
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/mail-sw.js", { scope: "/app/" }).catch(() => {})
    return () => document.removeEventListener("click", click)
  }, [])

  React.useEffect(() => {
    document.title = `${title} · ${siteConfig.name}`
    // Local state writes already updated their app; links read the new address.
    if (!firstNavigation.current && (navigationType === "POP" || !location.state?.panelLocal)) window.dispatchEvent(new Event(PANEL_NAVIGATION))
    if (previousScreen.current !== screen) mainRef.current?.focus({ preventScroll: true })
    previousScreen.current = screen
    firstNavigation.current = false
  }, [location.key, title, navigationType])

  const content = <><Outlet /><ScrollRestoration /></>
  if (standalone) return <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
    <a href="/" className="flex items-center gap-2 text-base font-medium"><img src="/logo.svg" alt="" className="size-7" />{siteConfig.name}</a>{content}<Toaster />
  </div>
  return <WorkspacesProvider value={context}><div data-browser-theme-surface data-slot={userView ? undefined : "sidebar-wrapper"} className={userView ? "bg-background md:bg-(--frame) flex h-svh overflow-hidden" : "group/sidebar-wrapper bg-background md:bg-sidebar flex min-h-svh w-full"}>
    {userView ? <AppRail disabled={context.disabled} search={!mobile && <AppSearch compact disabled={context.disabled} admin={context.canManage} />} notifications={!mobile && <NotificationCenter side="right" />} /> : <AppShell nav={nav} badges={{ "/staff/mail": context.adminMail?.unread ?? 0 }} user={context.user} disabled={context.disabled} pathname={location.pathname} sidebarOpen={context.sidebarOpen} />}
    <div data-slot="sidebar-inset" className={userView ? "flex min-w-0 flex-1 flex-col" : "bg-background relative flex w-full min-w-0 flex-1 flex-col md:m-2 md:ml-0 md:rounded-2xl md:group-has-[[data-slot=sidebar][data-state=collapsed]]/sidebar-wrapper:ml-2"}>
      {(!userView || mobile) && <header className={userView ? "bg-background grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-3 py-1" : "flex h-14 shrink-0 items-center gap-2 px-4"}>
        {userView ? <><span className="truncate text-sm font-medium">{title}</span><AppSearch disabled={context.disabled} admin={context.canManage} /><div className="flex justify-end"><NotificationCenter /></div></> : <>
          <SidebarToggle /><Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" /><span className="truncate text-sm font-medium">{title}</span>
          <div className="ml-auto flex items-center gap-2"><NotificationCenter /><SearchButton /><ThemeToggle /></div>
        </>}
      </header>}
      <main ref={mainRef} tabIndex={-1} aria-busy={navigation.state !== "idle"} data-workspace-main={userView || undefined} className={userView ? "relative flex min-h-0 flex-1 flex-col outline-none" : fullBleed ? "relative flex min-h-0 w-full flex-1 flex-col p-2 pt-0 outline-none" : "relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 outline-none md:p-8"}>
        {navigation.state !== "idle" && <div role="status" className="absolute inset-x-0 top-0"><Skeleton className="h-0.5 w-full" /><span className="sr-only">{t("Loading…")}</span></div>}{content}
      </main>
    </div>
    <Toaster />
  </div></WorkspacesProvider>
}

export async function loadPanelPage({ request }: LoaderFunctionArgs, initialContext: AppContext): Promise<AppPage> {
  const url = new URL(request.url)
  const response = await fetch(`/api/app/page?path=${encodeURIComponent(url.pathname + url.search)}`, { signal: request.signal, cache: "no-store" })
  const data = await response.json() as AppPage | { redirect: string }
  if (response.status === 401) { window.location.assign(`/login?next=${encodeURIComponent(url.pathname + url.search)}`); throw new Response(null, { status: 401 }) }
  if ("redirect" in data && data.redirect) {
    throw redirect(data.redirect)
  }
  if (!response.ok) throw new Response(null, { status: response.status })
  const context = (data as AppPage).context
  if (context.orgId !== initialContext.orgId || context.user.id !== initialContext.user.id || context.locale !== initialContext.locale) {
    window.location.assign(url.href)
    throw new Response(null, { status: 409 })
  }
  return data as AppPage
}

export default function PanelRouter({ initial }: { initial: AppPage }) {
  const [router] = React.useState(() => {
    const screenRoute = {
        element: <Screen />, errorElement: <PageError />,
        loader: (args) => loadPanelPage(args, initial.context),
        shouldRevalidate: ({ currentUrl, nextUrl, defaultShouldRevalidate }) => {
          const same = appScreenKey(currentUrl.pathname) !== null && appScreenKey(currentUrl.pathname) === appScreenKey(nextUrl.pathname)
          return same && currentUrl.href !== nextUrl.href ? false : defaultShouldRevalidate
        },
    } satisfies RouteObject
    const router = createBrowserRouter([{
      // One router for /app, /admin and /staff (isPanelLink): moving between them keeps the page, the frame follows context.area.
      id: "panel", path: "/", element: <PanelLayout initial={initial} />,
      children: [{ ...screenRoute, id: "screen", path: "*" }],
    }], { hydrationData: { loaderData: { screen: initial } } })
    connectPanelHistory((url, options) => { void router.navigate(url, options) })
    return router
  })
  React.useEffect(() => () => { router.dispose() }, [router])
  return <RouterProvider router={router} />
}
