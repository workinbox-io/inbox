import * as React from "react"
import { Bell, ChevronLeft, Filter, Forward, HardDrive, KeyRound, LifeBuoy, PenLine, SunMoon, Tag } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FiltersSection, ForwardingSection, LabelsSection, StorageSection, useMailboxRules } from "./mail-rules"
import { mailboxColor } from "./mail-ui"
import { PushControl } from "./push-control"
import { RecoveryEmailSettings } from "./security-settings"
import { PrefList, PrefRow } from "./pref-ui"

export type PreferenceSection = "signature" | "labels" | "filters" | "forwarding" | "storage" | "notifications" | "appearance" | "password" | "recovery"

type Signatures = Record<string, { signature: string; name?: string }>

interface SectionDef {
  id: PreferenceSection
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  /** Settings of one mailbox: the header shows the mailbox picker. */
  perMailbox?: boolean
}

const MAILBOX_SECTIONS: SectionDef[] = [
  { id: "signature", label: "Signature", icon: PenLine, perMailbox: true, description: "Goes under new e-mails, replies and forwards. You can still edit it in each message." },
  { id: "labels", label: "Labels", icon: Tag, perMailbox: true, description: "Group threads your own way. Apply them from the list or with a filter." },
  { id: "filters", label: "Filters", icon: Filter, perMailbox: true, description: "Run top to bottom on every new message. A filter acts when all its conditions match." },
  { id: "forwarding", label: "Forwarding", icon: Forward, perMailbox: true, description: "Addresses a filter may forward mail to, once their owner confirms." },
  { id: "storage", label: "Storage", icon: HardDrive, perMailbox: true, description: "How much of the mailbox's space is in use." },
]
const GENERAL_SECTIONS: SectionDef[] = [
  { id: "notifications", label: "Notifications", icon: Bell, description: "Hear about new mail while Mail isn't open." },
  { id: "appearance", label: "Appearance", icon: SunMoon, description: "How Mail looks on this device." },
]
const ACCOUNT_SECTIONS: SectionDef[] = [
  { id: "password", label: "Password", icon: KeyRound, description: "Got a temporary one from your admin? Pick your own here." },
  { id: "recovery", label: "Recovery email", icon: LifeBuoy, description: "Recover your account through a verified private address if you can't open your work mailbox." },
]

/**
 * Mail settings as one dialog with a sidebar, like shadcn's settings dialog block: mailbox
 * settings (signature, labels, filters, forwarding, storage), device ones, and, in the mail-only
 * view, the account (password, recovery). On a phone the nav is the first screen.
 */
export function MailPreferences({
  open,
  onOpenChange,
  section: initialSection,
  mailboxes,
  mailbox: initialMailbox,
  signatures,
  onSignatures,
  account,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: PreferenceSection
  mailboxes: string[]
  mailbox: string
  signatures: Signatures
  onSignatures: (s: Signatures) => void
  /** The mail-only view: no dashboard account settings, so password and recovery live here. */
  account: boolean
}) {
  const [section, setSection] = React.useState<PreferenceSection>(initialSection)
  const [mailbox, setMailbox] = React.useState(initialMailbox)
  // Phones show the nav or a section, not both.
  const [showNav, setShowNav] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setSection(initialSection)
    setMailbox(initialMailbox)
    setShowNav(false)
  }, [open, initialSection, initialMailbox])

  const groups: [string, SectionDef[]][] = [
    ["Mailbox", MAILBOX_SECTIONS],
    ["General", GENERAL_SECTIONS],
    ...(account ? ([["Account", ACCOUNT_SECTIONS]] as [string, SectionDef[]][]) : []),
  ]
  const current = groups.flatMap(([, s]) => s).find((s) => s.id === section) ?? MAILBOX_SECTIONS[0]!
  const rules = useMailboxRules(open ? mailbox : "")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(640px,calc(100dvh-2rem))] gap-0 overflow-hidden p-0 md:max-w-[880px] lg:max-w-[960px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Mailbox, device and account settings.</DialogDescription>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Settings" className={cn("bg-sidebar text-sidebar-foreground w-full shrink-0 flex-col gap-5 overflow-y-auto border-r p-3 md:flex md:w-56", showNav ? "flex" : "hidden")}>
            <p className="px-2 pt-1 text-sm font-medium">Settings</p>
            {groups.map(([label, items]) => (
              <div key={label} className="grid gap-px">
                <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">{label}</p>
                {items.map((item) => {
                  const active = item.id === current.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
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
            <header className="flex shrink-0 flex-wrap items-start gap-x-3 gap-y-2.5 border-b py-3.5 pr-12 pl-3 md:pl-6">
              <Button variant="ghost" size="icon-sm" className="mt-0.5 md:hidden" aria-label="All settings" onClick={() => setShowNav(true)}>
                <ChevronLeft />
              </Button>
              <div className="grid min-w-0 flex-1 basis-48 gap-1">
                <h2 className="text-[15px] leading-6 font-medium">{current.label}</h2>
                <p className="text-muted-foreground text-[13px] leading-snug text-pretty">{current.description}</p>
              </div>
              {current.perMailbox ? <MailboxPicker mailboxes={mailboxes} value={mailbox} onChange={setMailbox} /> : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
              <div className="mx-auto flex max-w-2xl flex-col gap-6">
                {current.id === "signature" ? <SignatureSection key={mailbox} mailbox={mailbox} signatures={signatures} onSaved={onSignatures} /> : null}
                {current.id === "labels" ? <LabelsSection rules={rules} /> : null}
                {current.id === "filters" ? <FiltersSection rules={rules} /> : null}
                {current.id === "forwarding" ? <ForwardingSection rules={rules} /> : null}
                {current.id === "storage" ? <StorageSection rules={rules} /> : null}
                {current.id === "notifications" ? <NotificationsSection /> : null}
                {current.id === "appearance" ? <AppearanceSection /> : null}
                {current.id === "password" ? <PasswordForm onDone={() => onOpenChange(false)} /> : null}
                {current.id === "recovery" ? <RecoveryEmailSettings /> : null}
              </div>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MailboxPicker({ mailboxes, value, onChange }: { mailboxes: string[]; value: string; onChange: (m: string) => void }) {
  const dot = (m: string) => <span className="size-2 shrink-0 rounded-full" style={{ background: mailboxColor(m) }} />
  if (mailboxes.length < 2)
    return (
      <span className="text-muted-foreground flex h-8 shrink-0 items-center gap-2 text-[13px] max-md:hidden">
        {dot(value)}
        {value}
      </span>
    )
  // One width for every mailbox (fits the longest address, up to 16rem), so switching doesn't resize the trigger.
  const longest = Math.max(...mailboxes.map((m) => m.length))
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className="shrink-0 max-md:w-full! md:w-(--picker-w) *:data-[slot=select-value]:min-w-0"
        style={{ "--picker-w": `min(16rem, calc(${longest}ch + 3.25rem))` } as React.CSSProperties}
        aria-label="Mailbox"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {mailboxes.map((m) => (
          <SelectItem key={m} value={m}>
            {dot(m)}
            <span className="truncate">{m}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SignatureSection({ mailbox, signatures, onSaved }: { mailbox: string; signatures: Signatures; onSaved: (s: Signatures) => void }) {
  const saved = signatures[mailbox]?.signature ?? ""
  const [text, setText] = React.useState(saved)
  const [saving, setSaving] = React.useState(false)
  async function save() {
    setSaving(true)
    try {
      await api("PUT", "/api/app/mail/mailboxes", { mailbox, signature: text })
      onSaved({ ...signatures, [mailbox]: { ...signatures[mailbox], signature: text } })
      toast.success("Signature saved")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="overflow-hidden rounded-xl border focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      <Textarea
        aria-label="Signature"
        className="min-h-44 rounded-none border-0 font-[inherit] shadow-none focus-visible:ring-0 dark:bg-transparent"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text !== saved) save()
        }}
        placeholder={"Anna Kowalska\nAcme · acme.com"}
      />
      <div className="bg-muted/40 flex items-center justify-between gap-3 border-t px-3 py-2">
        <p className="text-muted-foreground text-xs">{text === saved ? (saved ? "Saved" : "No signature") : "Unsaved changes"}</p>
        <div className="flex gap-2">
          {text !== saved ? (
            <Button variant="ghost" size="sm" onClick={() => setText(saved)}>
              Discard
            </Button>
          ) : null}
          <Button size="sm" onClick={save} loading={saving} disabled={saving || text === saved}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function NotificationsSection() {
  return (
    <PrefList>
      <PrefRow icon={Bell} title="New mail on this device" description="Your browser asks for permission the first time.">
        <PushControl variant="outline" stateful />
      </PrefRow>
    </PrefList>
  )
}

function AppearanceSection() {
  const [mode, setMode] = React.useState<ThemeMode>(() => (document.documentElement.dataset.themeMode as ThemeMode) ?? "system")
  return (
    <PrefList>
      <PrefRow icon={SunMoon} title="Theme" description={mode === "system" ? "Follows your system setting." : undefined}>
        <SegmentedControl<ThemeMode>
          aria-label="Theme"
          value={mode}
          onValueChange={(m) => {
            setMode(m)
            window.setThemeMode(m)
          }}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </PrefRow>
    </PrefList>
  )
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [signOutOthers, setSignOutOthers] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <form className="max-w-md"
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        setError(null)
        const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: signOutOthers })
        setPending(false)
        if (error) return setError(error.message ?? "Couldn't change the password")
        toast.success("Password changed")
        onDone()
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pw-current">Current password</FieldLabel>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="pw-next">New password</FieldLabel>
          <Input id="pw-next" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
          <FieldDescription>At least 10 characters.</FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="pw-others" checked={signOutOthers} onCheckedChange={(v) => setSignOutOthers(v === true)} />
          <FieldLabel htmlFor="pw-others">Sign out on other devices</FieldLabel>
        </Field>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={pending || !current || next.length < 10}>
            Change password
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
