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

/** Out of office and canned replies of one mailbox (Settings → Mail). */

type AutoReply = { enabled: boolean; subject: string; text: string; startsAt: string | number | null; endsAt: string | number | null }
export type MailTemplate = { id: string; mailboxId: string; mailbox: string; name: string; subject: string; text: string }
const ms = (v: string | number | null) => (v === null ? undefined : new Date(v).getTime())

export function AutoReplySection({ rules: { box } }: { rules: MailboxRules }) {
  const [value, setValue] = React.useState<AutoReply | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (box) api<AutoReply>("GET", `/api/app/mail/auto-reply?mailbox=${box.id}`).then(setValue, (e) => toast.error(e.message))
  }, [box])
  if (!box || !value) return <div className="bg-muted h-40 animate-pulse rounded-xl" aria-busy="true" />
  const set = (patch: Partial<AutoReply>) => setValue({ ...value, ...patch })
  const save = async (next: AutoReply) => {
    setBusy(true)
    try {
      setValue(await api<AutoReply>("PUT", "/api/app/mail/auto-reply", { mailboxId: box.id, enabled: next.enabled, subject: next.subject, text: next.text, startsAt: ms(next.startsAt) ?? null, endsAt: ms(next.endsAt) ?? null }))
      toast.success(next.enabled ? "Out of office is on" : "Out of office saved")
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
      <PrefList>
        <PrefRow title="Reply automatically" description={`Each sender gets it once every 4 days. Lists, newsletters and automatic mail never do.`}>
          <Switch checked={value.enabled} onCheckedChange={(enabled) => (enabled ? set({ enabled }) : save({ ...value, enabled }))} aria-label="Reply automatically" disabled={busy} />
        </PrefRow>
      </PrefList>
      {/* Still editable while off, so the reply can be prepared before turning it on. */}
      <FieldGroup className={value.enabled ? "transition-opacity" : "opacity-55 transition-opacity focus-within:opacity-100 hover:opacity-100"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>From</FieldLabel>
            <DateTimePicker value={ms(value.startsAt)} onChange={(v) => set({ startsAt: v ?? null })} placeholder="Now" clearLabel="Start now" />
          </Field>
          <Field>
            <FieldLabel>Until</FieldLabel>
            <DateTimePicker value={ms(value.endsAt)} onChange={(v) => set({ endsAt: v ?? null })} placeholder="I turn it off" clearLabel="No end date" />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="auto-reply-subject">Subject</FieldLabel>
          <Input id="auto-reply-subject" value={value.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={300} placeholder="Re: their subject" />
        </Field>
        <Field>
          <FieldLabel htmlFor="auto-reply-text">Message</FieldLabel>
          <Textarea id="auto-reply-text" value={value.text} onChange={(e) => set({ text: e.target.value })} maxLength={10000} className="min-h-40" placeholder="I'm away until Monday and will reply when I'm back." />
          <FieldDescription>Sent from {box.address} in the same thread, with your signature.</FieldDescription>
        </Field>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={busy || (value.enabled && !value.text.trim())}>
          {value.enabled ? "Save and turn on" : "Save"}
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
  if (!box || !templates) return <div className="bg-muted h-24 animate-pulse rounded-xl" aria-busy="true" />
  const mine = templates.filter((t) => t.mailboxId === box.id)
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
            <FieldLabel htmlFor="template-name">Name</FieldLabel>
            <Input id="template-name" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} required autoFocus placeholder="e.g. Pricing question" />
          </Field>
          <Field>
            <FieldLabel htmlFor="template-subject">Subject</FieldLabel>
            <Input id="template-subject" value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} maxLength={300} />
            <FieldDescription>Optional. Fills an empty subject of a new e-mail; replies keep theirs.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="template-text">Text</FieldLabel>
            <Textarea id="template-text" value={editing.text ?? ""} onChange={(e) => setEditing({ ...editing, text: e.target.value })} maxLength={20000} rows={8} required />
          </Field>
        </FieldGroup>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !editing.name?.trim() || !editing.text?.trim()}>
            Save template
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </form>
    )
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="outline" onClick={() => setEditing({})}>
          <Plus /> New template
        </Button>
      </div>
      {mine.length ? (
        <PrefList>
          {mine.map((t) => (
            <PrefRow key={t.id} icon={FileText} title={t.name} description={t.text.split("\n")[0]} onClick={() => setEditing(t)}>
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${t.name}`}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  run(() => api("DELETE", `/api/app/mail/templates?id=${t.id}`))
                }}
              >
                <Trash2 />
              </Button>
            </PrefRow>
          ))}
        </PrefList>
      ) : (
        <EmptyState variant="plain" density="compact" className="rounded-xl border border-dashed" icon={<FileText />} title="No templates yet" description="Answers you write often. Insert them from the composer." />
      )}
    </div>
  )
}
