import * as React from "react"
import { api } from "@/lib/api-client"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel, FieldGroup, FieldDescription, FieldError } from "@/components/ui/field"
import { ConfirmButton } from "@/components/app/confirm-button"
import { externalDraft, newExternalDraft, type ExternalDraft } from "./external-draft"
import { t } from "@/lib/i18n/panel"

export interface ExternalSendJob { id: string; state: string; subject: string; sendAt: number; createdAt: number; error: string | null; draftAvailable?: boolean }
export interface ExternalSendInput { id: string; to: string[]; cc: string[]; subject: string; text: string; replyToId?: string; files: { name: string; type: string; content: string }[] }
const encodedFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(",", 2)[1])
  reader.onerror = () => reject(new Error(t("Could not read {name}", { name: file.name })))
  reader.readAsDataURL(file)
})
export async function restoreExternalDraft(key: string, input: ExternalSendInput) {
  await externalDraft(key, { ...input, id: crypto.randomUUID(), to: input.to.join(", "), cc: input.cc.join(", "), files: input.files.map(file => new File([Uint8Array.from(atob(file.content), c => c.charCodeAt(0))], file.name, { type: file.type })) })
}

export function ExternalCompose({ base, draftKey, address, onClose, onQueued }: { base: string; draftKey: string; address: string; onClose: () => void; onQueued: (job: ExternalSendJob) => void }) {
  const [draft, setDraft] = React.useState<ExternalDraft | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const writes = React.useRef(Promise.resolve<unknown>(undefined))
  const storageFailed = React.useRef(false)
  React.useEffect(() => {
    let live = true
    void externalDraft(draftKey).then(saved => { if (live) setDraft(saved ?? newExternalDraft()) }).catch(e => { if (live) setError((e as Error).message) })
    return () => { live = false }
  }, [draftKey])
  React.useEffect(() => {
    if (!draft) return
    writes.current = writes.current.catch(() => {}).then(() => externalDraft(draftKey, draft)).then(() => { storageFailed.current = false }).catch(e => { storageFailed.current = true; setError((e as Error).message) })
  }, [draftKey, draft])
  const patch = (value: Partial<ExternalDraft>) => setDraft(previous => previous ? { ...previous, ...value } : previous)
  async function close() {
    await writes.current
    if (!storageFailed.current) onClose()
  }
  async function discard() {
    setBusy(true)
    try { await writes.current; await externalDraft(draftKey, null); onClose() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (!draft || busy) return
    setBusy(true); setError("")
    try {
      await writes.current
      if (draft.files.length > 5 || draft.files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) throw new Error(t("Attach up to five files, totaling 10 MB."))
      const files = await Promise.all(draft.files.map(async file => ({ name: file.name, type: file.type || "application/octet-stream", content: await encodedFile(file) })))
      const job = await api<ExternalSendJob>("POST", `${base}/send`, { ...draft, to: draft.to.split(",").map(value => value.trim()).filter(Boolean), cc: draft.cc.split(",").map(value => value.trim()).filter(Boolean), files })
      await externalDraft(draftKey, null)
      onQueued(job); onClose()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  if (!draft) return <div>{error ? <FieldError>{error}</FieldError> : <p role="status">{t("Loading draft…")}</p>}<Button variant="outline" onClick={onClose}>{t("Close")}</Button></div>
  return <form onSubmit={send} className="flex flex-col gap-4" aria-busy={busy}>
    <h2>{t("New message")}</h2>
    <p>{t("From: {address}", { address })}</p>
    {error && <FieldError>{error}</FieldError>}
    <fieldset disabled={busy}><FieldGroup>
      <Field><FieldLabel htmlFor="external-to">{t("To")}</FieldLabel><Input id="external-to" type="email" multiple required value={draft.to} onChange={event => patch({ to: event.target.value })} /><FieldDescription>{t("Separate email addresses with commas.")}</FieldDescription></Field>
      <Field><FieldLabel htmlFor="external-cc">{t("Cc")}</FieldLabel><Input id="external-cc" type="email" multiple value={draft.cc} onChange={event => patch({ cc: event.target.value })} /></Field>
      <Field><FieldLabel htmlFor="external-subject">{t("Subject")}</FieldLabel><Input id="external-subject" required maxLength={300} value={draft.subject} onChange={event => patch({ subject: event.target.value })} /></Field>
      <Field><FieldLabel htmlFor="external-body">{t("Message")}</FieldLabel><Textarea id="external-body" required maxLength={50000} value={draft.text} onChange={event => patch({ text: event.target.value })} /></Field>
      <Field><FieldLabel htmlFor="external-files">{t("Attachments")}</FieldLabel><Input id="external-files" type="file" multiple onChange={event => {
        const files = [...draft.files, ...Array.from(event.target.files ?? [])]
        if (files.length > 5 || files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) setError(t("Attach up to five files, totaling 10 MB."))
        else { patch({ files }); setError("") }
        event.target.value = ""
      }} /><FieldDescription>{t("Up to five files, totaling 10 MB.")}</FieldDescription></Field>
      {draft.files.map((file, index) => <div key={index} className="flex items-center gap-3"><span>{file.name}</span><Button type="button" variant="outline" onClick={() => patch({ files: draft.files.filter((_, i) => i !== index) })}>{t("Remove {name}", { name: file.name })}</Button></div>)}
    </FieldGroup></fieldset>
    <div className="flex gap-3"><Button type="submit" disabled={busy}><Send data-icon="inline-start" />{busy ? t("Queuing…") : t("Send")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>{t("Save and close")}</Button>
      <ConfirmButton title={t("Discard draft?")} description={t("This removes this draft and its saved attachments. Already queued messages are not cancelled.")} onConfirm={discard}><Button type="button" variant="outline" disabled={busy}>{t("Discard draft")}</Button></ConfirmButton>
    </div>
  </form>
}
