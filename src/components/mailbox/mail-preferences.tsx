import * as React from "react"
import { Activity, AtSign, Bell, CalendarDays, ImagePlus, Mail, MessageSquare, Share2, SunMoon, UserCheck, Zap } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { t } from "@/lib/i18n/panel"
import { KIND_LABELS, NOTIFY_KINDS, type NotifyKind } from "@/lib/notifications"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { mailboxColor } from "./mail-ui"
import { PushControl } from "./push-control"
import { PrefList, PrefRow } from "./pref-ui"
import { SignatureHtml } from "./signature-preview"
import { isImageType } from "@/lib/uploads"
import { uploadWithProgress } from "@/components/uploads/attachments"
import { signaturePreview, type MailboxSignature, type SignatureBrand } from "@/lib/mail/signature"
import { useSettingsDraft } from "@/components/settings/settings-draft"

type Signatures = Record<string, MailboxSignature>

/**
 * Mail's sections of the settings page (components/settings/settings-page.tsx): the mailbox picker, signature,
 * notifications and appearance. Labels, filters, forwarding and storage are in mail-rules.tsx.
 */
export function MailboxPicker({ mailboxes, value, onChange }: { mailboxes: string[]; value: string; onChange: (m: string) => void }) {
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
        aria-label={t("Mailbox")}
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

/** A photo of the person, or their own logo, for the signature (an upload; round in the signature). */
function SignaturePhoto({ url, round, hasOrgLogo, onChange, onRound }: { url: string; round: boolean; hasOrgLogo: boolean; onChange: (url: string) => void; onRound: (round: boolean) => void }) {
  const input = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  async function pick(file: File | undefined) {
    if (!file) return
    if (!isImageType(file.type)) return void toast.error(t("Use a PNG, JPEG, GIF or WebP image"))
    setUploading(true)
    try {
      onChange((await uploadWithProgress("/api/app/attachments", {}, file, file.type, () => {}, t("Upload failed"))).url)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ""
    }
  }
  return (
    <div className="flex items-center gap-3">
      {url ? <img src={url} alt="" className={cn("size-12 border", round ? "rounded-full object-cover" : "rounded-lg object-contain")} /> : <div className="bg-muted size-12 rounded-full border border-dashed" />}
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
            <ImagePlus /> {uploading ? t("Uploading…") : url ? t("Change photo") : t("Add photo or logo")}
          </Button>
          {url ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              {t("Remove")}
            </Button>
          ) : null}
        </div>
        {url ? (
          <label className="flex w-fit items-center gap-1.5 text-xs">
            <Checkbox checked={round} onCheckedChange={(v) => onRound(v === true)} /> {t("Crop to a circle")}
          </label>
        ) : null}
        <p className="text-muted-foreground text-xs">{hasOrgLogo ? t("Shown instead of your organization's logo.") : t("Shown next to your name.")}</p>
      </div>
    </div>
  )
}

/** The mailbox's signature: a few fields and free lines, shown under the org's template (logo, company, colour). */
export function SignatureSection({ mailbox, signatures, brand, onSaved }: { mailbox: string; signatures: Signatures; brand: SignatureBrand; onSaved: (s: Signatures) => void }) {
  const current = signatures[mailbox]
  const saved = { name: current?.card?.name ?? "", role: current?.card?.role ?? "", phone: current?.card?.phone ?? "", photoUrl: current?.card?.photoUrl ?? "", photoRound: current?.card?.photoRound !== false, note: current?.signature ?? "" }
  const [form, setForm] = React.useState(saved)
  const [saving, setSaving] = React.useState(false)
  const changed = JSON.stringify(form) !== JSON.stringify(saved)
  useSettingsDraft(changed, saving)
  const preview = signaturePreview({ signature: form.note, name: current?.name, card: form }, brand, mailbox)
  async function save() {
    setSaving(true)
    try {
      const card = { name: form.name, role: form.role, phone: form.phone, photoUrl: form.photoUrl, photoRound: form.photoRound }
      await api("PUT", "/api/app/mail/mailboxes", { mailbox, signature: form.note, signatureCard: card })
      onSaved({ ...signatures, [mailbox]: { ...current, signature: form.note, card } })
      toast.success(t("Signature saved"))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const field = (key: "name" | "role" | "phone", label: string, placeholder: string) => (
    <Field>
      <FieldLabel htmlFor={`sig-${key}`}>{label}</FieldLabel>
      <Input id={`sig-${key}`} value={form[key]} placeholder={placeholder} maxLength={key === "phone" ? 40 : 100} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  )
  return (
    <div className="grid gap-5">
      <SignaturePhoto
        url={form.photoUrl}
        round={form.photoRound}
        hasOrgLogo={!!brand.logoUrl}
        onChange={(photoUrl) => setForm({ ...form, photoUrl })}
        onRound={(photoRound) => setForm({ ...form, photoRound })}
      />
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        {field("name", t("person|Name"), current?.name || "Anna Kowalska")}
        {field("role", t("signature|Role"), t("Head of Support"))}
        {field("phone", t("Phone"), "+48 600 100 200")}
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="sig-note">{t("More lines")}</FieldLabel>
        <Textarea id="sig-note" className="min-h-20" value={form.note} maxLength={2000} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("Office hours: Mon–Fri, 9–17")} />
        <FieldDescription>
          {brand.company || brand.logoUrl ? t("Company, website, logo and colour come from your organization's template.") : t("Your admin can add the company, website, logo and colour in Admin console → Mail → Signature and sending.")}
        </FieldDescription>
      </Field>
      <div className="grid gap-1.5">
        <span className="text-muted-foreground text-xs">{t("Preview")}</span>
        {preview ? (
          <SignatureHtml html={preview} />
        ) : (
          <p className="text-muted-foreground text-sm">{t("No signature yet.")}</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        {changed ? (
          <Button variant="ghost" size="sm" onClick={() => setForm(saved)}>
            {t("Discard")}
          </Button>
        ) : null}
        <Button size="sm" onClick={save} loading={saving} disabled={saving || !changed}>
          {t("Save")}
        </Button>
      </div>
    </div>
  )
}

type NotifyPrefs = { digest: boolean; muted: NotifyKind[] }
const KIND_ICON: Record<NotifyKind, typeof Bell> = { share: Share2, invite: CalendarDays, assign: UserCheck, mention: AtSign, comment: MessageSquare, update: Activity, automation: Zap }

/** This device's browser notifications, then what notifies you in the bell and the e-mail summary (saved per person). */
export function NotificationsSection() {
  const [prefs, setPrefs] = React.useState<NotifyPrefs | null>(null)
  React.useEffect(() => {
    api<NotifyPrefs>("GET", "/api/app/notifications/prefs").then(setPrefs, () => toast.error(t("Could not load your notification settings")))
  }, [])
  async function save(next: NotifyPrefs) {
    const before = prefs
    setPrefs(next)
    try {
      await api("PUT", "/api/app/notifications/prefs", next)
    } catch (e) {
      setPrefs(before)
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="grid gap-6">
      <PrefList>
        <PrefRow icon={Bell} title={t("Browser notifications on this device")} description={t("New mail, even while the app isn't open. Your browser asks for permission the first time.")}>
          <PushControl variant="outline" stateful />
        </PrefRow>
      </PrefList>
      <div className="grid gap-2">
        <h3 className="text-muted-foreground px-1 text-xs font-medium">{t("In the bell")}</h3>
        <PrefList>
          {NOTIFY_KINDS.map((kind) => (
            <PrefRow key={kind} icon={KIND_ICON[kind]} title={t(KIND_LABELS[kind].title)} description={t(KIND_LABELS[kind].hint)}>
              <Switch
                checked={prefs ? !prefs.muted.includes(kind) : true}
                disabled={!prefs}
                aria-label={t(KIND_LABELS[kind].title)}
                onCheckedChange={(on) => prefs && void save({ ...prefs, muted: on ? prefs.muted.filter((k) => k !== kind) : [...prefs.muted, kind] })}
              />
            </PrefRow>
          ))}
        </PrefList>
        <p className="text-muted-foreground px-1 text-xs">{t("Mail, direct messages and mentions in chat always show.")}</p>
      </div>
      <PrefList>
        <PrefRow icon={Mail} title={t("E-mail summary")} description={t("What stays unread in the bell for a few hours, in one e-mail, at most once a day.")}>
          <Switch checked={prefs?.digest ?? true} disabled={!prefs} aria-label={t("E-mail summary")} onCheckedChange={(on) => prefs && void save({ ...prefs, digest: on })} />
        </PrefRow>
      </PrefList>
    </div>
  )
}

export function AppearanceSection() {
  const [mode, setMode] = React.useState<ThemeMode>(() => (document.documentElement.dataset.themeMode as ThemeMode) ?? "system")
  return (
    <PrefList>
      <PrefRow icon={SunMoon} title={t("Theme")} description={mode === "system" ? t("Follows your system setting.") : undefined}>
        <SegmentedControl<ThemeMode>
          aria-label={t("Theme")}
          value={mode}
          onValueChange={(m) => {
            setMode(m)
            window.setThemeMode(m)
          }}
          options={[
            { value: "system", label: t("System") },
            { value: "light", label: t("Light") },
            { value: "dark", label: t("Dark") },
          ]}
        />
      </PrefRow>
    </PrefList>
  )
}
