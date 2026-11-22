import * as React from "react"
import type { EngineMessage, EngineSummary } from "@/lib/mail/jmap"
import { api } from "@/lib/api-client"
import { PenSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmButton } from "@/components/app/confirm-button"
import { RailNav } from "@/components/workspace/rail"
import { HtmlFrame, TextBody } from "./message-view"
import { ExternalCompose, restoreExternalDraft, type ExternalSendJob, type ExternalSendInput } from "./external-compose"
import { externalDraft, newExternalDraft } from "./external-draft"
import { appLocale, t } from "@/lib/i18n/panel"

interface Folder { id: string; name: string; role: string | null }
export function ExternalMailbox({ connectionId, draftScope }: { connectionId: string; draftScope: string }) {
  const base = `/api/app/mail/external-accounts/${encodeURIComponent(connectionId)}/mail`
  const [folders, setFolders] = React.useState<Folder[]>([])
  const [folder, setFolder] = React.useState("")
  const [messages, setMessages] = React.useState<EngineSummary[]>([])
  const [selected, setSelected] = React.useState<EngineMessage | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [remoteImages, setRemoteImages] = React.useState(false)
  const [more, setMore] = React.useState(false)
  const [readOnly, setReadOnly] = React.useState(false)
  const [canSend, setCanSend] = React.useState(false)
  const [hasOutbox, setHasOutbox] = React.useState(false)
  const [address, setAddress] = React.useState("")
  const [compose, setCompose] = React.useState(false)
  const [outbox, setOutbox] = React.useState<ExternalSendJob[] | null>(null)
  const [notice, setNotice] = React.useState("")
  const draftKey = `external-mail:${draftScope}`
  const generation = React.useRef(0)
  const foldersReady = React.useCallback(async () => {
    const [result, profile] = await Promise.all([
      api<{ list: Folder[]; readOnly?: boolean; canSend?: boolean; hasOutbox?: boolean }>("GET", `${base}/folders`),
      api<{ address: string }>("GET", base.replace(/\/mail$/, "")),
    ])
    setFolders(result.list)
    setReadOnly(!!result.readOnly)
    setCanSend(!!result.canSend); setAddress(profile.address)
    setHasOutbox(!!result.hasOutbox)
    setFolder(current => current || result.list.find(item => item.role === "inbox")?.id || result.list[0]?.id || "")
  }, [base])
  const refreshOutbox = React.useCallback(async () => setOutbox((await api<{ jobs: ExternalSendJob[] }>("GET", `${base}/outbox`)).jobs), [base])
  React.useEffect(() => {
    if (outbox === null) return
    const timer = window.setInterval(() => { void refreshOutbox().catch(e => setError((e as Error).message)) }, 3000)
    return () => window.clearInterval(timer)
  }, [outbox, refreshOutbox])
  React.useEffect(() => { void foldersReady().catch(e => setError((e as Error).message)).finally(() => setLoading(false)) }, [foldersReady])
  const load = React.useCallback(async (position = 0) => {
    if (!folder) return
    const current = ++generation.current
    setLoading(true)
    try {
      const result = await api<{ list: EngineSummary[]; hasMore: boolean }>("GET", `${base}/messages?folder=${encodeURIComponent(folder)}&position=${position}`)
      if (current !== generation.current) return
      setMessages(previous => position ? [...new Map([...previous, ...result.list].map(message => [message.id, message])).values()] : result.list)
      setMore(result.hasMore); setError("")
    } catch (e) { if (current === generation.current) setError((e as Error).message) }
    finally { if (current === generation.current) setLoading(false) }
  }, [base, folder])
  React.useEffect(() => { setSelected(null); setMessages([]); void load(); return () => { generation.current++ } }, [load])
  async function open(message: EngineSummary) {
    const current = ++generation.current
    setBusy(true); setError(""); setRemoteImages(false)
    try {
      const detail = await api<{ message: EngineMessage }>("GET", `${base}/messages/${message.id}`)
      if (current !== generation.current) return
      setSelected(detail.message)
      if (!readOnly && !detail.message.keywords.$seen) {
        await api("PATCH", `${base}/messages/${message.id}`, { unread: false })
        setMessages(previous => previous.map(row => row.id === message.id ? { ...row, keywords: { ...row.keywords, $seen: true } } : row))
      }
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function change(patch: { starred?: boolean; unread?: boolean; folderId?: string }, remove = false) {
    if (!selected || readOnly) return
    setBusy(true); setError("")
    try {
      await api(remove ? "DELETE" : "PATCH", `${base}/messages/${selected.id}`, remove ? undefined : patch)
      if (patch.folderId || remove) setSelected(null)
      else {
        const detail = await api<{ message: EngineMessage }>("GET", `${base}/messages/${selected.id}`)
        setSelected(detail.message)
      }
      await load()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function startDraft(mode: "new" | "reply" | "replyAll" | "forward") {
    if (!canSend || readOnly) return
    setBusy(true); setError("")
    try {
      const previous = await externalDraft(draftKey)
      if (mode !== "new" && previous && (previous.to || previous.cc || previous.subject || previous.text || previous.files.length)) {
        setNotice(t("Your saved draft is open. Send or discard it before starting another reply.")); setCompose(true); return
      }
      if (mode !== "new" && selected) {
        const draft = newExternalDraft()
        draft.subject = `${mode === "forward" ? "Fwd:" : "Re:"} ${selected.subject}`
        if (mode === "forward") {
          if (selected.size > 10 * 1024 * 1024) throw new Error(t("This message exceeds the 10 MB forwarding limit. Download the original instead."))
          const response = await fetch(`${base}/messages/${selected.id}/raw`)
          if (!response.ok) throw new Error(t("Original message could not be downloaded"))
          const original = await response.blob()
          if (original.size > 10 * 1024 * 1024) throw new Error(t("This message exceeds the 10 MB forwarding limit"))
          draft.files = [new File([original], "forwarded-message.eml", { type: "message/rfc822" })]
          draft.text = t("Forwarded message attached.")
        } else {
          const recipients = selected.replyTo?.length ? selected.replyTo : selected.from ?? []
          draft.to = recipients.map(person => person.email).join(", "); draft.replyToId = selected.id
          if (mode === "replyAll") draft.cc = [...new Set([...(selected.to ?? []), ...(selected.cc ?? [])].map(person => person.email).filter(email => email.toLowerCase() !== address.toLowerCase() && !recipients.some(person => person.email.toLowerCase() === email.toLowerCase())))].join(", ")
        }
        await externalDraft(draftKey, draft)
      }
      setCompose(true)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  const trash = folders.find(item => item.role === "trash")
  const text = selected?.textBody.map(part => selected.bodyValues[part.partId]?.value ?? "").join("\n") ?? ""
  const html = selected?.htmlBody.map(part => selected.bodyValues[part.partId]?.value ?? "").join("\n") ?? ""
  const truncated = selected && Object.values(selected.bodyValues).some(part => part.isTruncated)
  return <div className="flex h-full min-h-0">
    <RailNav label={t("External mail folders")}>
      <Button variant="outline" asChild><a href="/app/mail">{t("Workinbox mail")}</a></Button>
      <Button variant="outline" asChild><a href="/app/settings/mail-clients">{t("Account settings")}</a></Button>
      {canSend && <Button disabled={busy} onClick={() => void startDraft("new")}><PenSquare data-icon="inline-start" />{t("Compose")}</Button>}
      {hasOutbox && <Button variant="outline" disabled={busy} onClick={() => void refreshOutbox().catch(e => setError((e as Error).message))}>{t("Outbox")}</Button>}
      {folders.map(item => <Button key={item.id} variant={item.id === folder ? "secondary" : "ghost"} disabled={busy} onClick={() => setFolder(item.id)} aria-current={item.id === folder ? "page" : undefined}>{item.name}</Button>)}
    </RailNav>
    <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-4" aria-busy={busy || loading}>
      {error && <FieldError>{error}</FieldError>}
      {notice && <p role="status">{notice}</p>}
      {readOnly && <p role="status">{t("Disconnected. This local copy is read-only.")}</p>}
      <div className="flex gap-3"><Button variant="outline" disabled={busy || loading} onClick={() => void (folders.length ? load() : foldersReady()).catch(e => setError((e as Error).message))}>{t("Refresh")}</Button>{selected && <Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>{t("Back to messages")}</Button>}</div>
      {loading && <p role="status">{t("Loading messages…")}</p>}
      {compose && <ExternalCompose base={base} draftKey={draftKey} address={address} onClose={() => setCompose(false)} onQueued={job => {
        setNotice(job.state === "cancelled" ? t("This send was already cancelled.") : t("Message queued. You can undo it in Outbox before sending starts."))
        void refreshOutbox().catch(e => setError((e as Error).message))
      }} />}
      {outbox && <section aria-label={t("Outbox")} className="flex flex-col gap-3"><h2>{t("Outbox")}</h2><Button variant="outline" onClick={() => setOutbox(null)}>{t("Close outbox")}</Button>
        {outbox.length === 0 && <p>{t("No outgoing messages.")}</p>}
        {outbox.map(job => <div key={job.id}><span>{job.subject} · {job.state}</span>{job.error && <p>{job.error}</p>}
          {job.state === "queued" && <Button variant="outline" disabled={busy} onClick={async () => {
            setBusy(true)
            try {
              if (await externalDraft(draftKey)) throw new Error(t("Send or discard your current draft before restoring this message"))
              const result = await api<{ draft: ExternalSendInput }>("DELETE", `${base}/outbox/${job.id}`)
              await restoreExternalDraft(draftKey, result.draft); setCompose(true)
              await api("DELETE", `${base}/outbox/${job.id}/draft`); await refreshOutbox()
            } catch (e) { setError((e as Error).message) }
            finally { setBusy(false) }
          }}>{t("Undo send")}</Button>}
          {job.draftAvailable && ["cancelled", "failed", "uncertain"].includes(job.state) && <Button variant="outline" asChild><a href={`${base}/outbox/${job.id}/draft`} download={`draft-${job.id}.json`}>{t("Download saved draft")}</a></Button>}
          {job.draftAvailable && ["cancelled", "failed", "uncertain"].includes(job.state) && <ConfirmButton title={t("Delete saved draft permanently?")} description={t("Download the draft first if you want to keep it. Deleting this recovery copy cannot recall a message that may already have been delivered.")} onConfirm={async () => {
            setBusy(true); setError("")
            try { await api("DELETE", `${base}/outbox/${job.id}/draft`); await refreshOutbox() }
            catch (e) { setError((e as Error).message) }
            finally { setBusy(false) }
          }}><Button variant="outline" disabled={busy}>{t("Delete saved draft")}</Button></ConfirmButton>}
        </div>)}
      </section>}
      {selected ? <article className="flex flex-col gap-4">
        <h1>{selected.subject || t("(no subject)")}</h1>
        <p>{selected.from?.map(sender => sender.name ? `${sender.name} <${sender.email}>` : sender.email).join(", ")} · {new Date(selected.receivedAt).toLocaleString(appLocale())}</p>
        <div className="flex flex-wrap gap-3">
          {canSend && <><Button variant="outline" disabled={busy} onClick={() => void startDraft("reply")}>{t("Reply")}</Button><Button variant="outline" disabled={busy} onClick={() => void startDraft("replyAll")}>{t("Reply all")}</Button><Button variant="outline" disabled={busy} onClick={() => void startDraft("forward")}>{t("Forward as attachment")}</Button></>}
          <Button variant="outline" disabled={busy || readOnly} onClick={() => void change({ starred: !selected.keywords.$flagged })}>{selected.keywords.$flagged ? t("Unstar") : t("Star")}</Button>
          <Button variant="outline" disabled={busy || readOnly} onClick={() => void change({ unread: true })}>{t("Mark unread")}</Button>
          {!readOnly && trash && !selected.mailboxIds[trash.id] && <Button variant="outline" disabled={busy} onClick={() => void change({ folderId: trash.id })}>{t("Move to Trash")}</Button>}
          {!readOnly && trash && selected.mailboxIds[trash.id] && <ConfirmButton title={t("Delete message permanently?")} description={t("This deletion also synchronizes to your mail server.")} onConfirm={() => change({}, true)}><Button variant="outline" disabled={busy}>{t("Delete permanently")}</Button></ConfirmButton>}
          <Select disabled={busy || readOnly} onValueChange={value => void change({ folderId: value })}><SelectTrigger aria-label={t("Move message")}><SelectValue placeholder={t("Move to folder")} /></SelectTrigger><SelectContent><SelectGroup>{folders.filter(item => !selected.mailboxIds[item.id]).map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select>
          <Button variant="outline" asChild><a href={`${base}/messages/${selected.id}/raw`}>{t("Download original")}</a></Button>
        </div>
        {truncated && <p role="status">{t("This message is shortened. Download the original to read the full content.")}</p>}
        {text ? <TextBody text={text} showQuoted /> : html ? <><Button variant="outline" onClick={() => setRemoteImages(value => !value)}>{remoteImages ? t("Block remote images") : t("Load remote images")}</Button><HtmlFrame key={selected.id} html={html} remoteImages={remoteImages} showQuoted /></> : <p>{t("(no text)")}</p>}
        {selected.attachments.map(part => <Button key={part.blobId} variant="outline" asChild><a href={`${base}/messages/${selected.id}/attachment?blob=${encodeURIComponent(part.blobId)}`}>{part.name || t("Attachment")}</a></Button>)}
      </article> : <>
        {!loading && !messages.length && !error && <p>{t("No messages in this folder.")}</p>}
        <ul className="flex flex-col gap-2">{messages.map(message => <li key={message.id}><Button variant="ghost" disabled={busy} onClick={() => void open(message)} className="h-auto w-full justify-start"><span className="min-w-0 truncate">{!message.keywords.$seen ? t("Unread") + " · " : ""}{message.keywords.$flagged ? "★ " : ""}{message.subject || t("(no subject)")} · {message.from?.[0]?.email}</span></Button></li>)}</ul>
        {more && <Button variant="outline" disabled={busy || loading} onClick={() => void load(messages.length)}>{t("Load more")}</Button>}
      </>}
    </main>
  </div>
}
