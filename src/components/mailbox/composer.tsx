import * as React from "react"
import { AtSign, ChevronDown, Plus, Reply, ReplyAll, Forward, Type, User, Users, Clock } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api-client"
import { tapllEvent } from "@/lib/tapll"
import { forwardSubject, replyRecipients, splitAddresses, withSignature } from "@/lib/admin-mail/rules"
import { replySubject } from "@/lib/mail/threading"
import { cn } from "@/lib/utils"
import { guardLeaving } from "@/lib/panel-history"
import { Button } from "@/components/ui/button"
import { DateTimePicker, type DateTimePreset } from "@/components/ui/date-time-picker"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AttachmentDropZone, uploadWithProgress, useAttachments, type Attachments, type UploadFn } from "@/components/uploads/attachments"
import { AddressInput, ComposeBody, ComposeFrame, EMAIL, FieldRow, type AddressSuggestion } from "@/components/mail/compose"
import { NEW_DRAFT, readDraft, writeDraft } from "./drafts"
import type { Draft, MailMessage, MailThread, ReplyMode } from "./types"

/** The team address book (/api/app/contacts/suggest) behind the To and Cc fields. */
const searchContacts = (q: string) => api<{ suggestions: AddressSuggestion[] }>("GET", `/api/app/contacts/suggest?q=${encodeURIComponent(q)}`).then((r) => r.suggestions)

const UNDO_MS = 10_000

interface QueuedSend { id: string; threadId: string; sendAt: number; status: string }

const upload: UploadFn = (file, mediaType, onProgress) => uploadWithProgress("/api/app/attachments", {}, file, mediaType, onProgress, "Upload failed")

export interface SendJob {
  run: () => Promise<QueuedSend>
  /** Undo pressed: show the message again. */
  undo: () => void
  failed: () => void
  done: (threadId: string) => void
}

/**
 * Sending waits a few seconds with an "Undo" toast, like Gmail; leaving the page meanwhile asks first.
 * onSent runs after the server took the mail (refreshes the list and thread).
 */
/** Scheduled-send shortcuts: tomorrow morning and afternoon, and Monday morning. */
function sendPresets(now = new Date()): DateTimePreset[] {
  const at = (days: number, hour: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d
  }
  const toMonday = ((8 - now.getDay()) % 7) || 7
  return [
    { id: "tomorrow-am", label: "Tomorrow morning", at: at(1, 8) },
    { id: "tomorrow-pm", label: "Tomorrow afternoon", at: at(1, 13) },
    ...(toMonday > 1 ? [{ id: "monday", label: "Monday morning", at: at(toMonday, 8) }] : []),
  ]
}

export function useUndoSend(onSent: (threadId: string) => void) {
  const pending = React.useRef(0)
  const sent = React.useRef(onSent)
  sent.current = onSent
  React.useEffect(() => guardLeaving(() => pending.current > 0), [])
  return React.useCallback((job: SendJob) => {
    pending.current++
    const id = toast.loading("Saving to outbox…")
    void (async () => {
      try {
        const result = await job.run()
        const scheduled = result.sendAt > Date.now() + UNDO_MS + 1000
        let cancelled = false
        toast(scheduled ? "Scheduled" : "Queued for sending", {
          id, duration: UNDO_MS,
          action: { label: "Undo", onClick: async () => {
            try {
              await api("DELETE", `/api/app/mail/outbox/${result.id}`)
              cancelled = true
              toast.success("Send cancelled", { id })
              job.undo()
            } catch (e) { toast.error((e as Error).message, { id }) }
          } },
        })
        // The server owns the timer. Leaving after this response is safe.
        setTimeout(() => {
          if (cancelled) return
          job.done(result.threadId)
          sent.current(result.threadId)
        }, UNDO_MS)
      } catch (e) {
        toast.error((e as Error).message, { id })
        job.failed()
      } finally { pending.current-- }
    })()
  }, [])
}

const invalid = (d: Draft) => [...d.to, ...d.cc].filter((a) => !EMAIL.test(a))

/** The request that sends a draft: a reply in its thread, a forward, or a new e-mail. */
async function sendRequest(d: Draft, files: { url: string; mediaType: string; filename: string }[], threadId?: string) {
  const kind = d.mode === "forward" ? "forward" : d.mode === "reply" || d.mode === "replyAll" ? "reply" : "new"
  tapllEvent("mail_send_started", { kind })
  try {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ ...d, files })))
    const digest = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("")
    const requestKey = `${d.idempotencyKey ?? crypto.randomUUID()}:${digest}`
    const base = { sendAt: d.sendAt, idempotencyKey: requestKey, to: d.to[0], cc: [...d.to.slice(1), ...d.cc], text: d.text.trim(), files }
    const result = await ((d.mode === "reply" || d.mode === "replyAll") && threadId
      ? api<QueuedSend>("POST", `/api/app/mail/threads/${threadId}/reply`, base)
      : api<QueuedSend>("POST", "/api/app/mail/threads", d.mode === "forward"
        ? { ...base, forwardOf: d.messageId, subject: d.subject }
        : { ...base, mailbox: d.from, subject: d.subject }))
    tapllEvent("mail_send_queued", { kind, scheduled: !!d.sendAt })
    return result
  } catch (error) {
    tapllEvent("mail_send_failed", { kind, reason: "request_failed" })
    throw error
  }
}

/** Header fields, body, files and the send row, shared by the inline reply and the new e-mail window. */
function MailForm({
  draft,
  set,
  contacts,
  mailboxes,
  attachments,
  showFrom,
  senderNames = {},
  showSubject,
  note,
  bodyClassName,
  autoFocusTo,
  focusSignal = 0,
  onSend,
  onDiscard,
}: {
  focusSignal?: number
  draft: Draft
  set: (patch: Partial<Draft>) => void
  contacts: string[]
  mailboxes: string[]
  attachments: Attachments
  showFrom?: boolean
  /** The name each mailbox sends under (its sender name, or yours). */
  senderNames?: Record<string, string>
  showSubject?: boolean
  note?: string
  bodyClassName?: string
  autoFocusTo?: boolean
  onSend: () => void
  onDiscard: () => void
}) {
  const [showCc, setShowCc] = React.useState(draft.cc.length > 0)
  const body = React.useRef<HTMLTextAreaElement>(null)
  const disabled = !draft.to.length || attachments.uploading || (!draft.text.trim() && draft.mode !== "forward")
  // Start typing above the signature; again whenever the shortcut asks (r / a / f with the reply open).
  React.useEffect(() => {
    if (autoFocusTo || !body.current) return
    body.current.focus()
    body.current.setSelectionRange(0, 0)
    body.current.scrollTop = 0
  }, [autoFocusTo, focusSignal])
  const ccToggle = showCc ? null : (
    <button type="button" onClick={() => setShowCc(true)} className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-sm">
      <Plus className="size-3.5" /> Cc
    </button>
  )
  return (
    <AttachmentDropZone attachments={attachments} label="Drop files to attach" className="flex min-h-0 flex-1 flex-col">
      {showFrom ? (
        <FieldRow label="From" icon={AtSign} htmlFor="mail-from">
          {mailboxes.length > 1 ? (
            <Select value={draft.from} onValueChange={(from) => set({ from })}>
              <SelectTrigger id="mail-from" size="sm" className="-ml-2 h-8 border-0 px-2 shadow-none" aria-label="From">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mailboxes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {senderNames[m] ? (
                      <span>
                        {senderNames[m]} <span className="text-muted-foreground">&lt;{m}&gt;</span>
                      </span>
                    ) : (
                      m
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm">
              {senderNames[draft.from] ? <>{senderNames[draft.from]} </> : null}
              <span className={senderNames[draft.from] ? "text-muted-foreground" : undefined}>&lt;{draft.from}&gt;</span>
            </span>
          )}
        </FieldRow>
      ) : null}
      <FieldRow label="To" icon={User} htmlFor="mail-to" end={ccToggle}>
        <AddressInput id="mail-to" value={draft.to} onChange={(to) => set({ to })} suggestions={contacts} search={searchContacts} placeholder="name@company.com" autoFocus={autoFocusTo} />
      </FieldRow>
      {showCc ? (
        <FieldRow label="Cc" icon={Users} htmlFor="mail-cc">
          <AddressInput id="mail-cc" value={draft.cc} onChange={(cc) => set({ cc })} suggestions={contacts} search={searchContacts} autoFocus={!draft.cc.length} />
        </FieldRow>
      ) : null}
      {showSubject ? (
        <FieldRow label="Subject" icon={Type} htmlFor="mail-subject">
          <input
            id="mail-subject"
            value={draft.subject}
            onChange={(e) => set({ subject: e.target.value })}
            maxLength={300}
            className="h-7 w-full bg-transparent text-sm font-medium outline-none"
          />
        </FieldRow>
      ) : null}
      <FieldRow label="Send at" icon={Clock} htmlFor="mail-send-at">
        <DateTimePicker value={draft.sendAt} onChange={(sendAt) => set({ sendAt })} presets={sendPresets()} placeholder="Now" confirmLabel="Schedule" clearLabel="Send now instead" className="h-7 border-transparent px-2 shadow-none" />
        {draft.sendAt ? <span className="text-muted-foreground text-xs">Your local time</span> : null}
      </FieldRow>
      <ComposeBody
        bodyRef={body}
        value={draft.text}
        onChange={(text) => set({ text })}
        bodyClassName={bodyClassName}
        note={note}
        attachments={attachments}
        disabled={disabled}
        sendLabel={draft.sendAt ? "Schedule" : "Send"}
        onSend={onSend}
        onDiscard={onDiscard}
      />
    </AttachmentDropZone>
  )
}

const MODE_LABEL: Record<ReplyMode, string> = { reply: "Reply", replyAll: "Reply all", forward: "Forward" }
const MODE_ICON = { reply: Reply, replyAll: ReplyAll, forward: Forward }

/** A fresh draft for replying to or forwarding `source` in `thread`. */
export function replyDraft(mode: ReplyMode, thread: MailThread, source: MailMessage, mailboxes: string[], signature: string): Draft {
  const text = withSignature("", signature)
  if (mode === "forward") return { mode, from: thread.mailbox, to: [], cc: [], subject: forwardSubject(source.subject || thread.subject), text, messageId: source.id }
  const r = replyRecipients(source, thread.contactEmail, mailboxes, mode === "replyAll")
  return { mode, from: thread.mailbox, to: r.to, cc: r.cc, subject: replySubject(thread.subject), text, messageId: source.id }
}

/** The reply or forward at the end of a thread, like Gmail; its draft is kept per thread. */
export function InlineComposer({
  thread,
  messages,
  initial,
  mailboxes,
  contacts,
  signature,
  schedule,
  focusSignal,
  onClose,
}: {
  focusSignal: number
  thread: MailThread
  messages: MailMessage[]
  initial: Draft
  mailboxes: string[]
  contacts: string[]
  signature: string
  schedule: (job: SendJob) => void
  onClose: () => void
}) {
  const attachments = useAttachments(upload)
  const [draft, setDraft] = React.useState(initial)
  const [pending, setPending] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch, idempotencyKey: undefined }))
  // Kept per thread while it's being written (an effect: writing notifies the list's "Draft" labels).
  const closed = React.useRef(false)
  React.useEffect(() => {
    if (!closed.current) writeDraft(thread.id, draft)
  }, [thread.id, draft])
  React.useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [])
  const source = messages.find((x) => x.id === draft.messageId) ?? messages.at(-1)!
  const switchMode = (mode: ReplyMode) => {
    const next = replyDraft(mode, thread, source, mailboxes, signature)
    // Keep what was written; only the recipients and subject change.
    setDraft((d) => ({ ...next, text: d.text }))
  }
  function discard() {
    closed.current = true
    writeDraft(thread.id, null)
    attachments.clear()
    onClose()
  }
  function send() {
    const bad = invalid(draft)
    if (bad.length) return void toast.error(`Check ${bad.join(", ")}`)
    if (draft.mode === "forward" && !draft.messageId) return
    const files = attachments.ready
    const sending = { ...draft, idempotencyKey: draft.idempotencyKey ?? crypto.randomUUID() }
    setDraft(sending)
    setPending(true)
    schedule({
      run: () => sendRequest(sending, files, thread.id),
      undo: () => { setDraft(d => ({ ...d, idempotencyKey: undefined })); setPending(false) },
      failed: () => setPending(false),
      done: () => {
        closed.current = true
        writeDraft(thread.id, null)
        attachments.clear()
        onClose()
      },
    })
  }
  const Icon = MODE_ICON[draft.mode as ReplyMode] ?? Reply
  return (
    <div ref={ref} className={cn("bg-background flex flex-col overflow-hidden rounded-xl border shadow-sm", pending && "hidden")}>
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-1 gap-1 px-2">
              <Icon /> {MODE_LABEL[draft.mode as ReplyMode]} <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(MODE_LABEL) as ReplyMode[]).map((mode) => {
              const I = MODE_ICON[mode]
              return (
                <DropdownMenuItem key={mode} onSelect={() => switchMode(mode)}>
                  <I /> {MODE_LABEL[mode]}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-muted-foreground min-w-0 truncate text-xs">
          from {thread.mailbox} · {draft.mode === "forward" ? draft.subject : replySubject(thread.subject)}
        </span>
      </div>
      <MailForm
        draft={draft}
        set={set}
        contacts={contacts}
        mailboxes={mailboxes}
        attachments={attachments}
        showSubject={draft.mode === "forward"}
        autoFocusTo={draft.mode === "forward" && !draft.to.length}
        note={draft.mode === "forward" ? "The original e-mail and its files go below your text." : "The previous e-mail is quoted below your reply."}
        bodyClassName="max-h-[45vh]"
        focusSignal={focusSignal}
        onSend={send}
        onDiscard={discard}
      />
    </div>
  )
}

/** A new e-mail in the docked window (`ComposeFrame`); the draft is kept when the window is closed. */
export function ComposeWindow({
  open,
  prefill,
  mailboxes,
  mailbox,
  contacts,
  signatures,
  schedule,
  onClose,
}: {
  open: boolean
  /** Recipient from "New e-mail to …" in the sender panel. */
  prefill: { to?: string; nonce: number } | null
  mailboxes: string[]
  mailbox: string
  contacts: string[]
  signatures: Record<string, { signature: string; name?: string }>
  schedule: (job: SendJob) => void
  onClose: () => void
}) {
  const attachments = useAttachments(upload)
  const fresh = React.useCallback(
    (from: string, to: string[] = []): Draft => ({ mode: "new", from, to, cc: [], subject: "", text: withSignature("", signatures[from]?.signature ?? "") }),
    [signatures],
  )
  const [draft, setDraft] = React.useState<Draft>(() => fresh(mailbox))
  const [pending, setPending] = React.useState(false)
  const [focusKey, setFocusKey] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    const saved = readDraft(NEW_DRAFT)
    const to = splitAddresses(prefill?.to)
    setDraft(saved && mailboxes.includes(saved.from) ? { ...saved, to: [...new Set([...saved.to, ...to])] } : fresh(mailbox, to))
    setFocusKey((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.nonce])

  const touched = React.useRef(false)
  const set = (patch: Partial<Draft>) => {
    touched.current = true
    setDraft((d) => {
      const next = { ...d, ...patch, idempotencyKey: undefined }
      // A new sender brings their signature, unless the text was already changed.
      if (patch.from && patch.from !== d.from && d.text === withSignature("", signatures[d.from]?.signature ?? "")) return { ...next, text: withSignature("", signatures[patch.from]?.signature ?? "") }
      return next
    })
  }
  // Saved once something was typed, so opening and closing an empty window leaves no draft.
  React.useEffect(() => {
    if (touched.current) writeDraft(NEW_DRAFT, draft)
  }, [draft])

  function discard() {
    touched.current = false
    writeDraft(NEW_DRAFT, null)
    attachments.clear()
    setDraft(fresh(mailbox))
    onClose()
  }
  function send() {
    const bad = invalid(draft)
    if (bad.length) return void toast.error(`Check ${bad.join(", ")}`)
    if (!draft.subject.trim()) return void toast.error("Add a subject")
    const files = attachments.ready
    const sending = { ...draft, idempotencyKey: draft.idempotencyKey ?? crypto.randomUUID() }
    setDraft(sending)
    setPending(true)
    schedule({
      run: () => sendRequest(sending, files),
      undo: () => { setDraft(d => ({ ...d, idempotencyKey: undefined })); setPending(false) },
      failed: () => setPending(false),
      done: () => {
        touched.current = false
        writeDraft(NEW_DRAFT, null)
        attachments.clear()
        setPending(false)
        setDraft(fresh(mailbox))
        onClose()
      },
    })
  }

  if (!open || pending) return null
  const title = draft.subject.trim() || "New e-mail"
  return (
    <ComposeFrame title={title} openKey={focusKey} onClose={onClose}>
      <MailForm
        key={focusKey}
        draft={draft}
        set={set}
        contacts={contacts}
        mailboxes={mailboxes}
        attachments={attachments}
        showFrom
        senderNames={Object.fromEntries(Object.entries(signatures).map(([m, s]) => [m, s.name ?? ""]))}
        showSubject
        autoFocusTo={!draft.to.length}
        onSend={send}
        onDiscard={discard}
      />
    </ComposeFrame>
  )
}
