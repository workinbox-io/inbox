/**
 * All settings in one dialog, on Mail's settings UI (sidebar of sections, a header with the section's description,
 * PrefList rows): mail, calendar, this device, the account and, for owners and admins, the organization. Mounted once
 * in the panel shell; any app opens it with `openSettings(section)` (open-settings.ts), and
 * `?settings=<section>` in the address opens it on load (the old /app/settings/* pages redirect there).
 * Each section loads what the old page loaded on the server from /api/app/settings/<data>.
 */
import * as React from "react"
import {
  Bell,
  Bot,
  Building2,
  CalendarClock,
  ChevronLeft,
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
} from "lucide-react"

import { AccountSettings } from "@/components/app/account-settings"
import { ConnectAiAppSection, ConnectedAppsPanel } from "@/components/app/ai-apps-panel"
import { ApiKeysPanel } from "@/components/app/api-keys-panel"
import { AuditLogPanel } from "@/components/app/audit-log-panel"
import { CompanyDetailsSection, OrgDangerZone, OrgProfileSection } from "@/components/app/organization-settings"
import { OrganizationSwitcher, TeamPanel } from "@/components/app/team-panel"
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
import { SettingsSectionContext } from "@/components/app/settings-section"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import type { MailboxSignature, SignatureBrand } from "@/lib/mail/signature"
import { guardLeaving, PANEL_NAVIGATION, replaceUrl } from "@/lib/panel-history"
import { cn } from "@/lib/utils"
import { notifySaved, OPEN_SETTINGS, type SettingsSection } from "./open-settings"
import { confirmSettingsLeave, SettingsDraftContext } from "./settings-draft"
import { SettingsTabs } from "./settings-tabs"

/** What a section loads (lib/server/settings.ts). */
type DataKey = "mailbox" | "calendar" | "account" | "organization" | "team" | "api-keys" | "audit" | "mail-admin" | "mail-clients" | "ai-apps"

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
        { id: "notifications", label: t("Notifications"), icon: Bell, description: t("Hear about new mail on this device while the app isn't open.") },
        { id: "appearance", label: t("Appearance"), icon: SunMoon, description: t("How the app looks on this device.") },
      ],
    ],
    [
      t("Account"),
      [
        { id: "account", label: t("Account"), icon: UserRound, data: "account", description: t("How you sign in, where you're signed in, and your account.") },
        { id: "mail-clients", label: t("Mail clients"), icon: Mail, data: "mail-clients", description: t("Connect mail clients and external accounts.") },
        { id: "ai-apps", label: t("AI apps"), icon: Bot, data: "ai-apps", description: t("Use your data from Claude, ChatGPT and other AI apps.") },
      ],
    ],
    [
      t("Organization"),
      [
        { id: "organization", label: t("Organization"), icon: Building2, data: "organization", description: t("Your organization's name and company details.") },
        { id: "team", label: t("Team"), icon: Users, data: "team", description: t("Who's in your organization, their roles and invitations.") },
        { id: "mail-admin", label: t("Domains and mailboxes"), icon: Mail, data: "mail-admin", manage: true, description: t("Your domains, mailboxes and aliases.") },
        { id: "api-keys", label: t("API keys"), icon: KeyRound, data: "api-keys", manage: true, description: t("Keys for the public API and MCP.") },
        { id: "audit", label: t("Audit log"), icon: ScrollText, data: "audit", manage: true, description: t("Who changed what, newest first.") },
      ],
    ],
  ]
  return all.map(([label, items]) => [label, items.filter((s) => canManage || !s.manage)] as [string, SectionDef[]]).filter(([, items]) => items.length)
}

const saved = notifySaved

/** The dialog, listening for openSettings() and ?settings=. */
export function SettingsHost({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [section, setSection] = React.useState<SettingsSection>("account")
  const [mailbox, setMailbox] = React.useState<string | undefined>()
  const drafts = React.useRef(new Set<() => { dirty: boolean; saving: boolean }>())
  const canLeave = () => confirmSettingsLeave(drafts.current)
  React.useEffect(() => guardLeaving(() => [...drafts.current].some(read => { const state = read(); return state.dirty || state.saving })), [])
  // Phones show the nav or a section, not both.
  const [showNav, setShowNav] = React.useState(false)
  const list = React.useMemo(() => groups(canManage), [canManage])
  const all = list.flatMap(([, s]) => s)

  React.useEffect(() => {
    const show = (next?: string, box?: string) => {
      if (!canLeave()) return
      const known = all.find((s) => s.id === next)
      setSection(known?.id ?? "account")
      if (box) setMailbox(box)
      setShowNav(!known && window.matchMedia("(max-width: 767px)").matches)
      setOpen(true)
    }
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ section?: string; mailbox?: string }>).detail
      show(d.section, d.mailbox)
    }
    // Open settings links once, then remove the consumed query parameter.
    const fromUrl = () => {
      const url = new URL(location.href)
      const asked = url.searchParams.get("settings")
      if (asked === null) return
      show(asked)
      url.searchParams.delete("settings")
      replaceUrl(url)
    }
    window.addEventListener(OPEN_SETTINGS, onOpen)
    window.addEventListener(PANEL_NAVIGATION, fromUrl)
    fromUrl()
    return () => {
      window.removeEventListener(OPEN_SETTINGS, onOpen)
      window.removeEventListener(PANEL_NAVIGATION, fromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = all.find((s) => s.id === section) ?? all[0]!
  return (
    <SettingsDraftContext value={drafts.current}>
    <Dialog open={open} onOpenChange={next => { if (next || canLeave()) setOpen(next) }}>
      <DialogContent className="h-[min(680px,calc(100dvh-2rem))] gap-0 overflow-hidden p-0 md:max-w-[920px] lg:max-w-[1000px]">
        <DialogTitle className="sr-only">{t("Settings")}</DialogTitle>
        <DialogDescription className="sr-only">{t("Mail, calendar, device, account and organization settings.")}</DialogDescription>
        <div className="flex min-h-0 flex-1">
          <nav aria-label={t("Settings")} className={cn("bg-sidebar text-sidebar-foreground w-full shrink-0 flex-col gap-5 overflow-y-auto border-r p-3 md:flex md:w-56", showNav ? "flex" : "hidden")}>
            <p className="px-2 pt-1 text-sm font-medium">{t("Settings")}</p>
            {list.map(([label, items]) => (
              <div key={label} className="grid gap-px">
                <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">{label}</p>
                {items.map((item) => {
                  const active = item.id === current.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id !== section && !canLeave()) return
                        setSection(item.id)
                        setShowNav(false)
                      }}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "focus-visible:ring-ring/50 flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-[13px] outline-none focus-visible:ring-[3px]",
                        active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                      )}
                    >
                      <item.icon className={cn("size-4 shrink-0", active ? "" : "text-muted-foreground")} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
          <main className={cn("min-w-0 flex-1 flex-col md:flex", showNav ? "hidden" : "flex")}>
            {/* Keyed by section: each opens fresh, with its own data. */}
            <Section key={current.id} def={current} mailbox={mailbox} onMailbox={next => { if (next === mailbox || canLeave()) setMailbox(next) }} onNav={() => setShowNav(true)} />
          </main>
        </div>
      </DialogContent>
    </Dialog>
    </SettingsDraftContext>
  )
}

/** Loads what a section shows; `undefined` while loading. */
function useSectionData<T>(key: DataKey | undefined) {
  const [state, setState] = React.useState<{ data?: T; error?: string }>({})
  const [attempt, retry] = React.useReducer(n => n + 1, 0)
  React.useEffect(() => {
    if (!key) return
    setState({})
    let live = true
    api<T>("GET", `/api/app/settings/${key}`)
      .then((data) => live && setState({ data }))
      .catch((e) => live && setState({ error: (e as Error).message }))
    return () => {
      live = false
    }
  }, [key, attempt])
  return { ...state, retry }
}

type MailboxData = { mailboxes: string[]; signatures: Record<string, MailboxSignature>; signatureBrand: SignatureBrand }

function Section({ def, mailbox, onMailbox, onNav }: { def: SectionDef; mailbox?: string; onMailbox: (m: string) => void; onNav: () => void }) {
  const { data, error, retry } = useSectionData<Record<string, unknown>>(def.data)
  const mail = def.perMailbox ? (data as MailboxData | undefined) : undefined
  const box = mail ? (mailbox && mail.mailboxes.includes(mailbox) ? mailbox : mail.mailboxes[0]) : undefined
  return (
    <>
      <header className="flex shrink-0 flex-wrap items-start gap-x-3 gap-y-2.5 border-b py-3.5 pr-12 pl-3 md:pl-6">
        <Button variant="ghost" size="icon-sm" className="mt-0.5 md:hidden" aria-label={t("All settings")} onClick={onNav}>
          <ChevronLeft />
        </Button>
        <div className="grid min-w-0 flex-1 basis-48 gap-1">
          <h2 className="text-[15px] leading-6 font-medium">{def.label}</h2>
          <p className="text-muted-foreground text-[13px] leading-snug text-pretty">{def.description}</p>
        </div>
        {mail && box ? <MailboxPicker mailboxes={mail.mailboxes} value={box} onChange={onMailbox} /> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        {/* Fades in when the section opens and again when its data arrives. */}
        <div key={data ? "ready" : "loading"} className="mx-auto flex max-w-2xl flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          {error ? (
            <div className="flex flex-col items-start gap-3"><p role="alert" className="text-destructive text-sm">{error}</p><Button variant="outline" onClick={retry}>Try again</Button></div>
          ) : def.data && !data ? (
            <div role="status" className="flex flex-col gap-4"><span className="sr-only">{t("Loading…")}</span><Skeleton className="h-12 w-full" /><Skeleton className="h-40 w-full" /></div>
          ) : (
            <SettingsSectionContext value={def.label}><Body def={def} data={data ?? {}} mailbox={box} /></SettingsSectionContext>
          )}
        </div>
      </div>
    </>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any -- each section's data matches the panel it feeds (lib/server/settings.ts). */
function Body({ def, data, mailbox }: { def: SectionDef; data: Record<string, any>; mailbox?: string }) {
  switch (def.id) {
    case "signature":
    case "labels":
    case "filters":
    case "forwarding":
    case "auto-reply":
    case "templates":
    case "storage":
      return mailbox ? <MailboxBody section={def.id} data={data as MailboxData} mailbox={mailbox} /> : <p className="text-muted-foreground text-sm">{t("You don't have a mailbox yet.")}</p>
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
      return <SettingsTabs label="Organization settings" tabs={[
        { id: "general", label: "General", content: <><OrgProfileSection id={data.orgId} name={data.name} canManage={data.canManage} /><OrganizationSwitcher orgs={data.orgs} /></> },
        { id: "company-details", label: "Company details", content: <CompanyDetailsSection initial={data.billingDetails} canManage={data.canManage} /> },
        { id: "danger-zone", label: "Danger zone", content: <OrgDangerZone orgId={data.orgId} orgName={data.name} role={data.role} others={data.others} /> },
      ]} />
    case "team":
      return <TeamPanel {...(data as any)} />
    case "mail-admin":
      return (
        <>
          <MailSettings initial={data.setup} />
        </>
      )
    case "mail-clients":
      return data.configured ? <SettingsTabs label="Mail connections" tabs={[
        { id: "mail-apps", label: "Mail apps", content: <NativeAccounts /> },
        { id: "external-accounts", label: "External accounts", content: <ExternalAccounts /> },
      ]} /> : <p>{t("External mail is not configured")}</p>
    case "api-keys":
      return <ApiKeysPanel keys={data.keys} />
    case "audit":
      return <AuditLogPanel initial={data.initial} />
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function MailboxBody({ section, data, mailbox }: { section: SettingsSection; data: MailboxData; mailbox: string }) {
  const [signatures, setSignatures] = React.useState(data.signatures)
  const rules = useMailboxRules(mailbox)
  if (section === "signature")
    return (
      <SignatureSection
        key={mailbox}
        mailbox={mailbox}
        signatures={signatures}
        brand={data.signatureBrand}
        onSaved={(s) => {
          setSignatures(s)
          saved({ kind: "signatures", signatures: s })
        }}
      />
    )
  if (section === "labels") return <LabelsSection rules={rules} />
  if (section === "filters") return <FiltersSection rules={rules} />
  if (section === "forwarding") return <ForwardingSection rules={rules} />
  if (section === "auto-reply") return <AutoReplySection key={mailbox} rules={rules} />
  if (section === "templates") return <TemplatesSection key={mailbox} rules={rules} />
  return <StorageSection rules={rules} />
}

