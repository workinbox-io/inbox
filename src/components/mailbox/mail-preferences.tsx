import * as React from "react"
import { Bell, ImagePlus, SunMoon } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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

type Signatures = Record<string, MailboxSignature>

/**
 * Mail's sections of the settings dialog (components/settings/settings-dialog.tsx): the mailbox picker, signature,
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

/** A photo of the person, or their own logo, for the signature (an upload; round in the signature). */
function SignaturePhoto({ url, round, hasOrgLogo, onChange, onRound }: { url: string; round: boolean; hasOrgLogo: boolean; onChange: (url: string) => void; onRound: (round: boolean) => void }) {
  const input = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  async function pick(file: File | undefined) {
    if (!file) return
    if (!isImageType(file.type)) return void toast.error("Use a PNG, JPEG, GIF or WebP image")
    setUploading(true)
    try {
      onChange((await uploadWithProgress("/api/app/attachments", {}, file, file.type, () => {}, "Upload failed")).url)
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
            <ImagePlus /> {uploading ? "Uploading…" : url ? "Change photo" : "Add photo or logo"}
          </Button>
          {url ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              Remove
            </Button>
          ) : null}
        </div>
        {url ? (
          <label className="flex w-fit items-center gap-1.5 text-xs">
            <Checkbox checked={round} onCheckedChange={(v) => onRound(v === true)} /> Crop to a circle
          </label>
        ) : null}
        <p className="text-muted-foreground text-xs">{hasOrgLogo ? "Shown instead of your organization's logo." : "Shown next to your name."}</p>
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
  const preview = signaturePreview({ signature: form.note, name: current?.name, card: form }, brand, mailbox)
  async function save() {
    setSaving(true)
    try {
      const card = { name: form.name, role: form.role, phone: form.phone, photoUrl: form.photoUrl, photoRound: form.photoRound }
      await api("PUT", "/api/app/mail/mailboxes", { mailbox, signature: form.note, signatureCard: card })
      onSaved({ ...signatures, [mailbox]: { ...current, signature: form.note, card } })
      toast.success("Signature saved")
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
        {field("name", "Name", current?.name || "Anna Kowalska")}
        {field("role", "Role", "Head of Support")}
        {field("phone", "Phone", "+48 600 100 200")}
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="sig-note">More lines</FieldLabel>
        <Textarea id="sig-note" className="min-h-20" value={form.note} maxLength={2000} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Office hours: Mon–Fri, 9–17" />
        <FieldDescription>
          {brand.company || brand.logoUrl ? "Company, website, logo and colour come from your organization's template." : "Your admin can add the company, website, logo and colour in Settings → Mail."}
        </FieldDescription>
      </Field>
      <div className="grid gap-1.5">
        <span className="text-muted-foreground text-xs">Preview</span>
        {preview ? (
          <SignatureHtml html={preview} />
        ) : (
          <p className="text-muted-foreground text-sm">No signature yet.</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        {changed ? (
          <Button variant="ghost" size="sm" onClick={() => setForm(saved)}>
            Discard
          </Button>
        ) : null}
        <Button size="sm" onClick={save} loading={saving} disabled={saving || !changed}>
          Save
        </Button>
      </div>
    </div>
  )
}

export function NotificationsSection() {
  return (
    <PrefList>
      <PrefRow icon={Bell} title="New mail on this device" description="Your browser asks for permission the first time.">
        <PushControl variant="outline" stateful />
      </PrefRow>
    </PrefList>
  )
}

export function AppearanceSection() {
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
