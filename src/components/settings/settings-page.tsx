/**
 * Settings as one scrolling page, like Tapll's: every section stacked, a sticky grouped nav marks the one in view
 * (a select on phones); /app/settings/<section> scrolls to it. Mail, calendar, this device, the account and, for members, their
 * organization. Apps go here with `openSettings(section)` (open-settings.ts); `?settings=<section>` on any app address
 * redirects here (legacyRedirect). Owners and admins manage the organization in the admin console: its pages
 * (/admin/people…) render the same sections with `SettingsPage`, and asking for one of them here goes there.
 * Each section loads what it shows from /api/app/settings/<data>.
 */
import * as React from "react"
import {
  Bell,
  Bot,
  Building2,
  CalendarClock,
  Filter,
  Forward,
  HardDrive,
  KeyRound,
  RefreshCw,
  Mail,
  PenLine,
  ScrollText,
  SunMoon,
  Tag,
  UserRound,
  Users,
  FileText,
  Plane,
  LayoutGrid,
  LayoutDashboard,
} from "lucide-react"

import { AccountSettings } from "@/components/app/account-settings"
import { ConnectAiAppSection, ConnectedAppsPanel } from "@/components/app/ai-apps-panel"
import { ApiKeysPanel } from "@/components/app/api-keys-panel"
import { AuditLogPanel } from "@/components/app/audit-log-panel"
import { ModulesPanel } from "@/components/app/modules-panel"
import { CompanyDetailsSection, OrgDangerZone, OrgProfileSection } from "@/components/app/organization-settings"
import { OrganizationSwitcher, TeamPanel } from "@/components/app/team-panel"
import { PeoplePanel } from "@/components/app/people-panel"
import { CalendarFeedSettings, CalendarSettingsForm } from "@/components/calendar/calendar-rail"
import { browserZone, type Prefs } from "@/components/calendar/shared"
import { NativeAccounts } from "@/components/mailbox/native-accounts"
import { ExternalAccounts } from "@/components/mailbox/external-accounts"
import { AppearanceSection, MailboxPicker, NotificationsSection, SignatureSection } from "@/components/mailbox/mail-preferences"
import { FiltersSection, ForwardingSection, LabelsSection, StorageSection, useMailboxRules } from "@/components/mailbox/mail-rules"
import { MailSettings } from "@/components/mailbox/mail-settings"
import { AutoReplySection, TemplatesSection } from "@/components/mailbox/mail-replies"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SETTINGS_CARD, SETTINGS_INSET, SettingsSectionContext } from "@/components/app/settings-section"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/app/page-header"
import { ADMIN_SETTINGS, type AdminSettingsPage } from "@/lib/app-routes"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import type { MailboxSignature, SignatureBrand } from "@/lib/mail/signature"
import { guardLeaving, navigatePanel, PANEL_NAVIGATION, replaceUrl } from "@/lib/panel-history"
import { cn } from "@/lib/utils"
import { notifySaved, type SettingsSection } from "./open-settings"
import { confirmSettingsLeave, SettingsDraftContext } from "./settings-draft"
import { SettingsTabs } from "./settings-tabs"

/** What a section loads (lib/server/settings.ts). */
type DataKey = "mailbox" | "calendar" | "account" | "organization" | "team" | "people" | "api-keys" | "audit" | "mail-admin" | "mail-clients" | "ai-apps" | "modules"

interface SectionDef {
  id: SettingsSection
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  data?: DataKey
  /** Owners and admins only. */
  manage?: boolean
  /** One mailbox's settings: the header shows the mailbox picker. */
  perMailbox?: boolean
  /** A link out of the dialog instead of a section. */
  href?: string
}

/** The organization's sections: the admin console's pages for owners and admins, the dialog's for members. */
function orgSections(): SectionDef[] {
  return [
    { id: "organization", label: t("Organization"), icon: Building2, data: "organization", description: t("Your organization's name and company details.") },
    { id: "team", label: t("Team"), icon: Users, data: "team", description: t("Who's in your organization, their roles and invitations.") },
    { id: "modules", label: t("Apps"), icon: LayoutGrid, data: "modules", manage: true, description: t("Turn apps on or off for everyone in the organization. Turning one off keeps its data.") },
    { id: "people", label: t("People"), icon: Users, data: "people", manage: true, description: t("Everyone in the organization with their mailbox, and the shared mailboxes.") },
    { id: "mail-admin", label: t("Mail"), icon: Mail, data: "mail-admin", manage: true, description: t("Your domains, importing mail, and the signature and sending rules for everyone.") },
    { id: "api-keys", label: t("API keys"), icon: KeyRound, data: "api-keys", manage: true, description: t("Keys for the public API and MCP.") },
    { id: "audit", label: t("Audit log"), icon: ScrollText, data: "audit", manage: true, description: t("Who changed what, newest first.") },
  ]
}

function groups(canManage: boolean): [string, SectionDef[]][] {
  const all: [string, SectionDef[]][] = [
    [
      t("Mail"),
      [
        { id: "signature", label: t("Signature"), icon: PenLine, data: "mailbox", perMailbox: true, description: t("Goes under new e-mails, replies and forwards, with your organization's logo and colours. Untick it in a message to send without it.") },
        { id: "labels", label: t("Labels"), icon: Tag, data: "mailbox", perMailbox: true, description: t("Group threads your own way. Apply them from the list or with a filter.") },
        { id: "filters", label: t("Filters"), icon: Filter, data: "mailbox", perMailbox: true, description: t("Run top to bottom on every new message. A filter acts when all its conditions match.") },
        { id: "auto-reply", label: t("Out of office"), icon: Plane, data: "mailbox", perMailbox: true, description: t("Answer new mail automatically while you're away.") },
        { id: "templates", label: t("Templates"), icon: FileText, data: "mailbox", perMailbox: true, description: t("Answers you write often, ready to insert in the composer. Everyone on this mailbox shares them.") },
        { id: "forwarding", label: t("Forwarding"), icon: Forward, data: "mailbox", perMailbox: true, description: t("Addresses a filter may forward mail to, once their owner confirms.") },
        { id: "storage", label: t("Storage"), icon: HardDrive, data: "mailbox", perMailbox: true, description: t("How much of the mailbox's space is in use.") },
      ],
    ],
    [
      t("Calendar"),
      [
        { id: "calendar", label: t("Time zones and week"), icon: CalendarClock, data: "calendar", description: t("Your time zone, up to two more next to the hours, the time format and the first day of the week.") },
        { id: "calendar-feed", label: t("Google Calendar"), icon: RefreshCw, description: t("See your Google calendars here, and this calendar in Google.") },
      ],
    ],
    [
      t("This device"),
      [
        { id: "appearance", label: t("Appearance"), icon: SunMoon, description: t("How the app looks on this device.") },
      ],
    ],
    [
      t("Account"),
      [
        { id: "account", label: t("Account"), icon: UserRound, data: "account", description: t("How you sign in, where you're signed in, and your account.") },
        { id: "notifications", label: t("Notifications"), icon: Bell, description: t("What lands in the bell, the e-mail summary, and notifications on this device.") },
        { id: "mail-clients", label: t("Mail clients"), icon: Mail, data: "mail-clients", description: t("Connect mail clients and external accounts.") },
        { id: "ai-apps", label: t("AI apps"), icon: Bot, data: "ai-apps", description: t("Use your data from Claude, ChatGPT and other AI apps.") },
      ],
    ],
    [
      t("Organization"),
      canManage
        ? [{ id: "organization", label: t("Admin console"), icon: LayoutDashboard, href: "/admin", description: "" }]
        : orgSections().filter((s) => !s.manage),
    ],
  ]
  return all
}

const saved = notifySaved

const PATH = /^\/app\/settings(?:\/([^/]+))?/

/** Same-key loads on one page share one request (Mail's seven sections, for one). */
const DataCache = React.createContext<Map<string, Promise<unknown>> | null>(null)

/**
 * The settings page, like Tapll's: every section on one scroll, the nav marks the one in view. /app/settings/<section>
 * (openSettings) scrolls to it; the mailbox for Mail's sections lives in ?mailbox=.
 */
export function SettingsScreen({ canManage }: { canManage: boolean }) {
  const list = React.useMemo(() => groups(canManage), [canManage])
  const sections = list.flatMap(([, s]) => s).filter((s) => !s.href)
  const asked = () => sections.find((s) => s.id === PATH.exec(location.pathname)?.[1])?.id
  const [active, setActive] = React.useState<SettingsSection>(() => asked() ?? sections[0]!.id)
  const [mailbox, setMailbox] = React.useState(() => new URLSearchParams(location.search).get("mailbox") ?? undefined)
  const [cache] = React.useState(() => new Map<string, Promise<unknown>>())
  const drafts = React.useRef(new Set<() => { dirty: boolean; saving: boolean }>())
  React.useEffect(() => guardLeaving(() => [...drafts.current].some(read => { const state = read(); return state.dirty || state.saving })), [])
  const scroller = React.useRef<HTMLDivElement>(null)
  const content = React.useRef<HTMLDivElement>(null)
  const blocks = React.useRef(new Map<string, HTMLElement>())
  const register = (id: string) => (el: HTMLElement | null) => { if (el) blocks.current.set(id, el); else blocks.current.delete(id) }
  // While sections above the target load and grow, keep the target in place until the person scrolls.
  const pinned = React.useRef<string | null>(null)
  const scrollTo = (id: string, smooth = false) => {
    setActive(id as SettingsSection)
    blocks.current.get(id)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" })
  }

  React.useEffect(() => {
    const root = scroller.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (pinned.current) return
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        const id = visible && (visible.target as HTMLElement).dataset.section
        if (id) setActive(id as SettingsSection)
      },
      { root, rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    )
    for (const el of blocks.current.values()) observer.observe(el)
    // Scrolled to the bottom: the last sections never reach the band, mark the last one.
    const bottom = () => { if (!pinned.current && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) setActive(sections.at(-1)!.id) }
    root.addEventListener("scroll", bottom, { passive: true })
    const unpin = () => { pinned.current = null }
    for (const name of ["wheel", "touchmove", "keydown", "pointerdown"]) root.addEventListener(name, unpin, { passive: true })
    const grow = new ResizeObserver(() => { if (pinned.current) blocks.current.get(pinned.current)?.scrollIntoView({ block: "start" }) })
    if (content.current) grow.observe(content.current)
    const go = () => { const id = asked(); if (id) { pinned.current = id; scrollTo(id) } }
    go()
    const stop = window.setTimeout(unpin, 4000)
    // openSettings() while the page is open, and back/forward.
    window.addEventListener(PANEL_NAVIGATION, go)
    return () => {
      observer.disconnect(); grow.disconnect(); window.clearTimeout(stop)
      root.removeEventListener("scroll", bottom)
      for (const name of ["wheel", "touchmove", "keydown", "pointerdown"]) root.removeEventListener(name, unpin)
      window.removeEventListener(PANEL_NAVIGATION, go)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (id: string) => {
    const href = id.startsWith("href:") && list.flatMap(([, s]) => s).find((s) => s.href && s.id === id.slice(5))?.href
    if (href) return navigatePanel(href)
    pinned.current = null
    scrollTo(id, !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    const url = new URL(location.href)
    url.pathname = `/app/settings/${id}`
    replaceUrl(url)
  }
  const changeMailbox = (next: string) => {
    if (next === mailbox || !confirmSettingsLeave(drafts.current)) return
    setMailbox(next)
    const url = new URL(location.href)
    url.searchParams.set("mailbox", next)
    replaceUrl(url)
  }

  return (
    <SettingsDraftContext value={drafts.current}>
      <DataCache value={cache}>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-[40vh] md:grid-cols-[13rem_minmax(0,1fr)] md:gap-12 md:px-8">
            <nav aria-label={t("Settings")} className="bg-background sticky top-0 z-10 -mx-4 border-b px-4 py-3 md:mx-0 md:border-0 md:px-0 md:py-10 md:self-start">
              <h1 className="mb-3 text-lg font-semibold tracking-tight md:mb-5 md:px-2">{t("Settings")}</h1>
              <Select value={active} onValueChange={pick}>
                <SelectTrigger aria-label={t("Settings section")} className="w-full md:hidden"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {list.map(([label, items]) => (
                    <SelectGroup key={label}>
                      <SelectLabel>{label}</SelectLabel>
                      {items.map((item) => <SelectItem key={item.id + (item.href ?? "")} value={item.href ? `href:${item.id}` : item.id}>{item.label}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <div className="hidden flex-col gap-5 md:flex">
                {list.map(([label, items]) => (
                  <div key={label} className="grid gap-px">
                    <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">{label}</p>
                    {items.map((item) => {
                      const current = !item.href && item.id === active
                      return (
                        <a
                          key={item.id + (item.href ?? "")}
                          href={item.href ?? `/app/settings/${item.id}`}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                            e.preventDefault()
                            pick(item.href ? `href:${item.id}` : item.id)
                          }}
                          aria-current={current ? "location" : undefined}
                          className={cn(
                            "focus-visible:ring-ring/50 flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] outline-none focus-visible:ring-[3px]",
                            current ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                          )}
                        >
                          <item.icon className="size-4 shrink-0" />
                          {item.label}
                        </a>
                      )
                    })}
                  </div>
                ))}
              </div>
            </nav>
            <div ref={content} className="flex min-w-0 max-w-3xl flex-col gap-14 md:py-10">
              {list.map(([label, items]) => {
                const defs = items.filter((s) => !s.href)
                if (!defs.length) return null
                return defs.some((d) => d.perMailbox)
                  ? <MailGroup key={label} label={label} defs={defs} mailbox={mailbox} onMailbox={changeMailbox} register={register} />
                  : defs.map((def) => <Section key={def.id} def={def} register={register} />)
              })}
            </div>
          </div>
        </div>
      </DataCache>
    </SettingsDraftContext>
  )
}

/** An admin console page (/admin/people…): one organization section as a page, with the dialog's leave guard. */
export function SettingsPage({ page }: { page: AdminSettingsPage }) {
  const def = orgSections().find((s) => s.id === ADMIN_SETTINGS[page])!
  const { data, error, retry } = useSectionData<Record<string, unknown>>(def.data)
  const drafts = React.useRef(new Set<() => { dirty: boolean; saving: boolean }>())
  React.useEffect(() => guardLeaving(() => [...drafts.current].some(read => { const state = read(); return state.dirty || state.saving })), [])
  return (
    <SettingsDraftContext value={drafts.current}>
      <PageHeader title={def.label} description={def.description} />
      <div className="flex max-w-3xl flex-col gap-6">
        {error ? (
          <div className="flex flex-col items-start gap-3"><p role="alert" className="text-destructive text-sm">{error}</p><Button variant="outline" onClick={retry}>{t("Try again")}</Button></div>
        ) : !data ? (
          <div role="status" className="flex flex-col gap-4"><span className="sr-only">{t("Loading…")}</span><Skeleton className="h-12 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <SettingsSectionContext value={def.label}><Body def={def} data={data} /></SettingsSectionContext>
        )}
      </div>
    </SettingsDraftContext>
  )
}

/** Loads what a section shows; `undefined` while loading. */
function useSectionData<T>(key: DataKey | undefined) {
  const cache = React.useContext(DataCache)
  const [state, setState] = React.useState<{ data?: T; error?: string }>({})
  const [attempt, setAttempt] = React.useState(0)
  const retry = () => { if (key) cache?.delete(key); setAttempt(n => n + 1) }
  React.useEffect(() => {
    if (!key) return
    setState({})
    let live = true
    const load = (cache?.get(key) as Promise<T> | undefined) ?? api<T>("GET", `/api/app/settings/${key}`)
    cache?.set(key, load)
    load
      .then((data) => live && setState({ data }))
      .catch((e) => live && setState({ error: (e as Error).message }))
    return () => {
      live = false
    }
  }, [key, attempt])
  return { ...state, retry }
}

type MailboxData = { mailboxes: string[]; signatures: Record<string, MailboxSignature>; signatureBrand: SignatureBrand }

type Register = (id: string) => (el: HTMLElement | null) => void

/** One failing section shows its error; the rest of the page keeps working. */
class SectionBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-destructive text-sm">{t("This section could not be shown.")}</p>
        <Button variant="outline" onClick={() => this.setState({ failed: false })}>{t("Try again")}</Button>
      </div>
    )
  }
}

/**
 * One section on the scroll, on the template's Card. A section built from cards (SettingsSection) keeps its heading above
 * them with the card styles switched off; one built from rows and fields (Mail's) is itself the card.
 */
function Block({ def, register, error, retry, loading, children }: { def: SectionDef; register: Register; error?: string; retry?: () => void; loading?: boolean; children?: React.ReactNode }) {
  return (
    <section ref={register(def.id)} data-section={def.id} aria-labelledby={`settings-${def.id}`} className="scroll-mt-24 md:scroll-mt-10">
      <Card className={cn(SETTINGS_CARD, "group/block has-[[data-slot=settings-section]]:gap-5 has-[[data-slot=settings-section]]:overflow-visible has-[[data-slot=settings-section]]:rounded-none has-[[data-slot=settings-section]]:bg-transparent has-[[data-slot=settings-section]]:[&>*+*]:border-t-0")}>
        <CardHeader className={cn(SETTINGS_INSET, "group-has-[[data-slot=settings-section]]/block:p-0")}>
          <CardTitle id={`settings-${def.id}`} role="heading" aria-level={2} className="text-base group-has-[[data-slot=settings-section]]/block:text-lg group-has-[[data-slot=settings-section]]/block:font-semibold">{def.label}</CardTitle>
          <CardDescription className="text-pretty">{def.description}</CardDescription>
        </CardHeader>
        {/* Fades in when its data arrives. */}
        <CardContent key={loading ? "loading" : "ready"} className={cn(SETTINGS_INSET, "flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 group-has-[[data-slot=settings-section]]/block:p-0")}>
        {error ? (
          <div className="flex flex-col items-start gap-3"><p role="alert" className="text-destructive text-sm">{error}</p><Button variant="outline" onClick={retry}>{t("Try again")}</Button></div>
        ) : loading ? (
          <div role="status" className="flex flex-col gap-4"><span className="sr-only">{t("Loading…")}</span><Skeleton className="h-12 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <SectionBoundary><SettingsSectionContext value={def.label}>{children}</SettingsSectionContext></SectionBoundary>
        )}
        </CardContent>
      </Card>
    </section>
  )
}

function Section({ def, register }: { def: SectionDef; register: Register }) {
  const { data, error, retry } = useSectionData<Record<string, unknown>>(def.data)
  return <Block def={def} register={register} error={error} retry={retry} loading={!!def.data && !data}><Body def={def} data={data ?? {}} /></Block>
}

/** Mail's sections share one mailbox (picked once, above them) and one load of its rules. */
function MailGroup({ label, defs, mailbox, onMailbox, register }: { label: string; defs: SectionDef[]; mailbox?: string; onMailbox: (m: string) => void; register: Register }) {
  const { data, error, retry } = useSectionData<MailboxData>("mailbox")
  const box = data ? (mailbox && data.mailboxes.includes(mailbox) ? mailbox : data.mailboxes[0]) : undefined
  return (
    <div className="flex flex-col gap-14">
      <div className="bg-background/95 z-[5] -mb-8 flex items-center justify-between gap-3 py-2 backdrop-blur md:sticky md:top-0">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        {data && box ? <MailboxPicker mailboxes={data.mailboxes} value={box} onChange={onMailbox} /> : null}
      </div>
      {data && box ? (
        <MailSections key={box} defs={defs} data={data} mailbox={box} register={register} />
      ) : (
        defs.map((def) => (
          <Block key={def.id} def={def} register={register} error={error} retry={retry} loading={!data}>
            <p className="text-muted-foreground text-sm">{t("You don't have a mailbox yet.")}</p>
          </Block>
        ))
      )}
    </div>
  )
}

function MailSections({ defs, data, mailbox, register }: { defs: SectionDef[]; data: MailboxData; mailbox: string; register: Register }) {
  const [signatures, setSignatures] = React.useState(data.signatures)
  const rules = useMailboxRules(mailbox)
  const body = (id: SettingsSection) => {
    if (id === "signature")
      return (
        <SignatureSection
          mailbox={mailbox}
          signatures={signatures}
          brand={data.signatureBrand}
          onSaved={(s) => {
            setSignatures(s)
            saved({ kind: "signatures", signatures: s })
          }}
        />
      )
    if (id === "labels") return <LabelsSection rules={rules} />
    if (id === "filters") return <FiltersSection rules={rules} />
    if (id === "forwarding") return <ForwardingSection rules={rules} />
    if (id === "auto-reply") return <AutoReplySection rules={rules} />
    if (id === "templates") return <TemplatesSection rules={rules} />
    return <StorageSection rules={rules} />
  }
  return defs.map((def) => <Block key={def.id} def={def} register={register}>{body(def.id)}</Block>)
}

/* eslint-disable @typescript-eslint/no-explicit-any -- each section's data matches the panel it feeds (lib/server/settings.ts). */
function Body({ def, data }: { def: SectionDef; data: Record<string, any> }) {
  switch (def.id) {
    case "calendar":
      return <CalendarSettingsForm prefs={data.prefs as Prefs} tz={(data.prefs as Prefs).timezones[0] ?? browserZone()} onSaved={(prefs) => saved({ kind: "calendar-prefs", prefs })} />
    case "calendar-feed":
      return <CalendarFeedSettings />
    case "notifications":
      return <NotificationsSection />
    case "appearance":
      return <AppearanceSection />
    case "account":
      // The e-mail change confirmation lands here with ?email=changed (kept by settingsRedirect).
      return <AccountSettings {...(data as any)} emailChanged={new URLSearchParams(location.search).get("email") === "changed"} />
    case "ai-apps":
      return (
        <>
          <ConnectAiAppSection mcpUrl={data.mcpUrl} upsell={data.upsell} />
          <ConnectedAppsPanel apps={data.apps} />
        </>
      )
    case "organization":
      return <SettingsTabs label={t("Organization settings")} tabs={[
        { id: "general", label: t("General"), content: <><OrgProfileSection id={data.orgId} name={data.name} canManage={data.canManage} /><OrganizationSwitcher orgs={data.orgs} /></> },
        { id: "company-details", label: t("Company details"), content: <CompanyDetailsSection initial={data.billingDetails} canManage={data.canManage} /> },
        { id: "danger-zone", label: t("Danger zone"), content: <OrgDangerZone orgId={data.orgId} orgName={data.name} role={data.role} others={data.others} /> },
      ]} />
    case "team":
      return <TeamPanel {...(data as any)} />
    case "people":
      return <PeoplePanel {...(data as any)} />
    case "mail-admin":
      return (
        <>
          <MailSettings initial={data.setup} />
        </>
      )
    case "mail-clients":
      return data.configured ? <SettingsTabs label={t("Mail connections")} tabs={[
        { id: "mail-apps", label: t("Mail apps"), content: <NativeAccounts /> },
        { id: "external-accounts", label: t("External accounts"), content: <ExternalAccounts /> },
      ]} /> : <p>{t("External mail is not configured")}</p>
    case "modules":
      return <ModulesPanel modules={data.modules} />
    case "api-keys":
      return <ApiKeysPanel keys={data.keys} />
    case "audit":
      return <AuditLogPanel initial={data.initial} />
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
