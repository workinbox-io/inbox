import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import { FileText, Pencil, Plus, Trash2 } from "lucide-react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { EmptyState } from "@/components/app/empty-state"
import { PrefList, PrefRow } from "./pref-ui"
import type { MailboxRules } from "./mail-rules"
import { Badge } from "@/components/ui/badge"
import { ConfirmButton } from "@/components/app/confirm-button"
import { useSettingsDraft } from "@/components/settings/settings-draft"
import { t } from "@/lib/i18n/panel"

/** Out of office and canned replies of one mailbox (Settings → Mail). */

type AutoReply = { enabled: boolean; subject: string; text: string; startsAt: string | number | null; endsAt: string | number | null }
export type MailTemplate = { id: string; mailboxId: string; mailbox: string; name: string; subject: string; text: string }
const ms = (v: string | number | null) => (v === null ? undefined : new Date(v).getTime())

export function AutoReplySection({ rules: { box } }: { rules: MailboxRules }) {
  const [value, setValue] = React.useState<AutoReply | null>(null)
  const [saved, setSaved] = React.useState<AutoReply | null>(null)
  const [busy, setBusy] = React.useState(false)
  const changed = JSON.stringify(value) !== JSON.stringify(saved)
  useSettingsDraft(changed, busy)
  React.useEffect(() => {
    if (box) api<AutoReply>("GET", `/api/app/mail/auto-reply?mailbox=${box.id}`).then(next => { setValue(next); setSaved(next) }, (e) => toast.error(e.message))
  }, [box])
  if (!box || !value) return <div className="bg-muted h-40 animate-pulse rounded-xl" aria-busy="true" />
  const set = (patch: Partial<AutoReply>) => setValue({ ...value, ...patch })
  const save = async (next: AutoReply) => {
    setBusy(true)
    try {
      const result = await api<AutoReply>("PUT", "/api/app/mail/auto-reply", { mailboxId: box.id, enabled: next.enabled, subject: next.subject, text: next.text, startsAt: ms(next.startsAt) ?? null, endsAt: ms(next.endsAt) ?? null })
      setValue(result); setSaved(result)
      toast.success(t("Out of office saved"))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save(value)
      }}
    >
      <div className="flex flex-wrap items-center gap-2" role="status">
        <Badge variant={saved?.enabled ? "info" : "secondary"}>{!saved?.enabled ? t("Off") : (ms(saved.endsAt) ?? Infinity) <= Date.now() ? t("Ended") : (ms(saved.startsAt) ?? 0) > Date.now() ? t("Scheduled") : t("Active")}</Badge>
        {changed && <span className="text-muted-foreground text-xs">{t("Unsaved changes")}</span>}
      </div>
      <PrefList>
        <PrefRow title={t("Reply automatically")} description={t("Each sender gets it once every 4 days. Lists, newsletters and automatic mail never do.")}>
          <Switch checked={value.enabled} onCheckedChange={(enabled) => set({ enabled })} aria-label={t("Reply automatically")} disabled={busy} />
        </PrefRow>
      </PrefList>
      {/* Still editable while off, so the reply can be prepared before turning it on. */}
      <fieldset disabled={busy} className="min-w-0">
      <FieldGroup className={value.enabled ? "transition-opacity" : "opacity-55 transition-opacity focus-within:opacity-100 hover:opacity-100"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>{t("From")}</FieldLabel>
            <DateTimePicker value={ms(value.startsAt)} onChange={(v) => set({ startsAt: v ?? null })} placeholder={t("Now")} clearLabel={t("Start now")} />
          </Field>
          <Field>
            <FieldLabel>{t("Until")}</FieldLabel>
            <DateTimePicker value={ms(value.endsAt)} onChange={(v) => set({ endsAt: v ?? null })} placeholder={t("I turn it off")} clearLabel={t("No end date")} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="auto-reply-subject">{t("Subject")}</FieldLabel>
          <Input id="auto-reply-subject" value={value.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={300} placeholder={t("Re: their subject")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="auto-reply-text">{t("Message")}</FieldLabel>
          <Textarea id="auto-reply-text" value={value.text} onChange={(e) => set({ text: e.target.value })} maxLength={10000} className="min-h-40" placeholder={t("I'm away until Monday and will reply when I'm back.")} />
          <FieldDescription>{t("Sent from {address} in the same thread, with your signature.", { address: box.address })}</FieldDescription>
        </Field>
      </FieldGroup>
      </fieldset>
      <div>
        <Button type="submit" loading={busy} disabled={!changed || (value.enabled && !value.text.trim())}>
          {t("Save changes")}
        </Button>
      </div>
    </form>
  )
}

/** The templates of every mailbox the viewer has (one request, filtered per mailbox by the caller). */
export function useTemplates(enabled = true) {
  const [templates, setTemplates] = React.useState<MailTemplate[] | null>(null)
  const refresh = React.useCallback(() => api<{ templates: MailTemplate[] }>("GET", "/api/app/mail/templates").then((r) => setTemplates(r.templates)), [])
  React.useEffect(() => {
    if (enabled && !templates) refresh().catch((e) => toast.error(e.message))
  }, [enabled, templates, refresh])
  return { templates, refresh }
}

export function TemplatesSection({ rules: { box } }: { rules: MailboxRules }) {
  const { templates, refresh } = useTemplates()
  const [editing, setEditing] = React.useState<Partial<MailTemplate> | null>(null)
  const [busy, setBusy] = React.useState(false)
  const original = templates?.find(template => template.id === editing?.id)
  useSettingsDraft(!!editing && ["name", "subject", "text"].some(key => (editing[key as keyof MailTemplate] ?? "") !== (original?.[key as keyof MailTemplate] ?? "")), busy)
  if (!box || !templates) return <div className="bg-muted h-24 animate-pulse rounded-xl" aria-busy="true" />
  const mine = templates.filter((tpl) => tpl.mailboxId === box.id)
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      await refresh()
      setEditing(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (editing)
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => api("POST", "/api/app/mail/templates", { ...editing, mailboxId: box.id }))
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="template-name">{t("Name")}</FieldLabel>
            <Input id="template-name" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} required autoFocus placeholder={t("e.g. Pricing question")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="template-subject">{t("Subject")}</FieldLabel>
            <Input id="template-subject" value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} maxLength={300} />
            <FieldDescription>{t("Optional. Fills an empty subject of a new e-mail; replies keep theirs.")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="template-text">{t("Text")}</FieldLabel>
            <Textarea id="template-text" value={editing.text ?? ""} onChange={(e) => setEditing({ ...editing, text: e.target.value })} maxLength={20000} rows={8} required />
          </Field>
        </FieldGroup>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !editing.name?.trim() || !editing.text?.trim()}>
            {t("Save template")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            {t("Cancel")}
          </Button>
        </div>
      </form>
    )
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="outline" onClick={() => setEditing({})}>
          <Plus /> {t("New template")}
        </Button>
      </div>
      {mine.length ? (
        <PrefList>
          {mine.map((tpl) => (
            <PrefRow key={tpl.id} icon={FileText} title={tpl.name} description={tpl.text.split("\n")[0]} onClick={() => setEditing(tpl)}>
              <Button variant="ghost" size="icon-sm" aria-label={t("Edit {name}", { name: tpl.name })} onClick={() => setEditing(tpl)}>
                <Pencil />
              </Button>
              <ConfirmButton title={t("Delete {name}?", { name: tpl.name })} description={t("This template will be removed for everyone using this mailbox.")} confirmLabel={t("Delete template")} onConfirm={() => run(() => api("DELETE", `/api/app/mail/templates?id=${tpl.id}`))}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("Delete {name}", { name: tpl.name })}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
              </ConfirmButton>
            </PrefRow>
          ))}
        </PrefList>
      ) : (
        <EmptyState variant="plain" density="compact" className="rounded-xl border border-dashed" icon={<FileText />} title={t("No templates yet")} description={t("Answers you write often. Insert them from the composer.")} />
      )}
    </div>
  )
}
