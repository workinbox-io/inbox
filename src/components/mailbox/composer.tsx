import * as React from "react"
import { AtSign, ChevronDown, FileText, Plus, Reply, ReplyAll, Forward, Settings2, Type, User, Users, Clock, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { tapllEvent } from "@/lib/tapll"
import { forwardSubject, replyRecipients, splitAddresses } from "@/lib/admin-mail/rules"
import { signaturePreview, type MailboxSignature, type SignatureBrand } from "@/lib/mail/signature"
import { Checkbox } from "@/components/ui/checkbox"
import { SignatureHtml } from "./signature-preview"
import { replySubject } from "@/lib/mail/threading"
import { cn } from "@/lib/utils"
import { guardLeaving } from "@/lib/panel-history"
import { Button } from "@/components/ui/button"
import { DateTimePicker, type DateTimePreset } from "@/components/ui/date-time-picker"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AttachmentDropZone, uploadWithProgress, useAttachments, type Attachments, type UploadFn } from "@/components/uploads/attachments"
import { AddressInput, ComposeBody, ComposeFrame, EMAIL, FieldRow, type AddressSuggestion } from "@/components/mail/compose"
import { useMentionAccess } from "@/components/workspace/mentions"
import { docRefs, docToText, withRefUrls } from "@/lib/mail/doc-render"
import type { Value } from "platejs"
import { MailEditor, type MailEditorHandle } from "./mail-editor"
import { MailAttachmentMenu } from "@/components/drive/attach-from-drive"
import { NEW_DRAFT, readDraft, writeDraft, flushDraft, useRemoteDraft, resolveDraftConflict } from "./drafts"
import { useTemplates, type MailTemplate } from "./mail-replies"
import { openSettings } from "@/components/settings/open-settings"
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
        toast.info(scheduled ? "Scheduled" : "Queued for sending", {
          id, duration: UNDO_MS,
          // Ding's onClick is sync: returning a patch keeps the pill, so show progress and morph it when the DELETE lands.
          action: { label: "Undo", onClick: () => {
            void (async () => {
              try {
                await api("DELETE", `/api/app/mail/outbox/${result.id}`)
                cancelled = true
                toast.success("Send cancelled", { id })
                job.undo()
              } catch (e) { toast.error((e as Error).message, { id }) }
            })()
            return { type: "loading", title: "Cancelling…", duration: 0 }
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

/**
 * Recipients who can't open a mentioned file, note or event: the sender picks access or a link first
 * (components/workspace/mentions.tsx). The draft with the links on its mentions, or null when cancelled.
 */
async function checkMentions(check: ReturnType<typeof useMentionAccess>["check"], d: Draft): Promise<Draft | null> {
  if (!d.doc) return d
  try {
    const linked = await check(docRefs(d.doc), { emails: [...d.to, ...d.cc] })
    if (!linked) return null
    const doc = withRefUrls(d.doc, linked)
    return { ...d, doc, text: docToText(doc, location.origin) }
  } catch (e) {
    toast.error((e as Error).message)
    return null
  }
}

const invalid = (d: Draft) => [...d.to, ...d.cc].filter((a) => !EMAIL.test(a))

/** The request that sends a draft: a reply in its thread, a forward, or a new e-mail. */
async function sendRequest(d: Draft, files: { url: string; mediaType: string; filename: string }[], threadId?: string, key = NEW_DRAFT) {
  const kind = d.mode === "forward" ? "forward" : d.mode === "reply" || d.mode === "replyAll" ? "reply" : "new"
  tapllEvent("mail_send_started", { kind })
  try {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ ...d, files })))
    const digest = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("")
    const requestKey = `${d.idempotencyKey ?? crypto.randomUUID()}:${digest}`
    const expectedUpdatedAt = await flushDraft(key, d)
    const base = { draftKey: key, expectedUpdatedAt, sendAt: d.sendAt, idempotencyKey: requestKey, to: d.to[0], cc: [...d.to.slice(1), ...d.cc], text: d.text.trim(), doc: d.doc, signature: !d.noSignature, files }
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
  signatureHtml,
  onSend,
  onDiscard,
}: {
  focusSignal?: number
  /** The sender's signature as the server will append it (lib/mail/signature.ts), or null. */
  signatureHtml?: string | null
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
  const body = React.useRef<MailEditorHandle>(null)
  const disabled = !draft.to.length || attachments.uploading || (!draft.text.trim() && draft.mode !== "forward")
  // Start in the body when the form opens, and again whenever the shortcut asks (r / a / f with the reply open). Not
  // when a recipient is added: that flips autoFocusTo and would pull a Tab from the To field into the body.
  const focusTo = React.useRef(autoFocusTo)
  focusTo.current = autoFocusTo
  React.useEffect(() => {
    if (focusTo.current) return
    // The editor mounts after hydration: focus on the next frame.
    requestAnimationFrame(() => body.current?.focus())
  }, [focusSignal])
  const ccToggle = showCc ? null : (
    // Out of the Tab order, like Gmail: Tab goes from To straight to Subject.
    <button type="button" tabIndex={-1} onClick={() => setShowCc(true)} className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-sm">
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
        value={draft.text}
        onChange={(text) => set({ text })}
        editor={<MailEditor ref={body} initial={draft.doc as Value | undefined} initialText={draft.text} onChange={(doc, text) => set({ doc, text })} onSubmit={() => !disabled && onSend()} placeholder="Write your e-mail… (@ to mention people, files, notes, events)" className={bodyClassName} />}
        bodyClassName={bodyClassName}
        note={note}
        footer={signatureHtml ? <SignaturePreview html={signatureHtml} on={!draft.noSignature} onChange={(on) => set({ noSignature: !on })} /> : null}
        actions={
          <>
            <MailAttachmentMenu attachments={attachments} />
            <TemplatesMenu
              mailbox={draft.from}
              onPick={(tpl) => {
                body.current?.insertText(tpl.text)
                if (showSubject && !draft.subject.trim() && tpl.subject) set({ subject: tpl.subject })
              }}
            />
          </>
        }
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

/** Inserts one of the sending mailbox's templates (Settings → Mail → Templates); loaded when first opened. */
function TemplatesMenu({ mailbox, onPick }: { mailbox: string; onPick: (t: MailTemplate) => void }) {
  const [open, setOpen] = React.useState(false)
  const { templates } = useTemplates(open)
  const mine = templates?.filter((t) => t.mailbox === mailbox)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="Templates" title="Templates">
          <FileText data-icon="inline-start" /><span className="hidden sm:inline">Templates</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
        {!mine ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : mine.length ? (
          mine.map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => onPick(t)} className="flex-col items-start gap-0">
              <span className="truncate">{t.name}</span>
              <span className="text-muted-foreground w-full truncate text-xs">{t.text.split("\n")[0]}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No templates for {mailbox}</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openSettings("templates", { mailbox })}>
          <Settings2 /> Manage templates
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The signature under the text, as recipients will see it (on white), with a box to leave it out. */
function SignaturePreview({ html, on, onChange }: { html: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="grid gap-1.5 px-4 pb-2">
      <label className="text-muted-foreground flex w-fit items-center gap-1.5 text-xs">
        <Checkbox checked={on} onCheckedChange={(v) => onChange(v === true)} /> Signature
      </label>
      {on ? <SignatureHtml html={html} /> : null}
    </div>
  )
}

function DraftConflict({ draftKey }: { draftKey: string }) {
  const resolve = (mine: boolean) => void resolveDraftConflict(draftKey, mine).catch(e => toast.error((e as Error).message))
  return <div role="alert" className="flex flex-wrap items-center gap-2 p-3 text-sm">
    <span>This draft changed or was deleted elsewhere. Your text is kept.</span>
    <Button variant="outline" size="sm" onClick={() => resolve(false)}>Load server version</Button>
    <Button variant="outline" size="sm" onClick={() => resolve(true)}>Save my version</Button>
  </div>
}

/** A fresh draft for replying to or forwarding `source` in `thread`. */
export function replyDraft(mode: ReplyMode, thread: MailThread, source: MailMessage, mailboxes: string[]): Draft {
  const text = ""
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
  signatureHtml,
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
  signatureHtml: string | null
  schedule: (job: SendJob) => void
  onClose: () => void
}) {
  const attachments = useAttachments(upload)
  const mentionAccess = useMentionAccess()
  const [draft, setDraft] = React.useState(initial)
  const [pending, setPending] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch, idempotencyKey: undefined }))
  const remoteLoad = React.useRef(false)
  const conflict = useRemoteDraft(thread.id, next => {
    remoteLoad.current = true
    if (next) { setDraft(next); attachments.restore(next.files ?? []) } else onClose()
  })
  React.useEffect(() => { attachments.restore(initial.files ?? []) }, [])
  const fileState = JSON.stringify(attachments.ready)
  const filesMounted = React.useRef(false)
  React.useEffect(() => {
    if (!filesMounted.current) { filesMounted.current = true; return }
    if (!attachments.items.length && !draft.files?.length) return
    setDraft(d => JSON.stringify(d.files ?? []) === fileState ? d : { ...d, files: attachments.ready })
  }, [attachments.items])
  // Kept per thread while it's being written (an effect: writing notifies the list's "Draft" labels).
  const closed = React.useRef(false)
  React.useEffect(() => {
    if (remoteLoad.current) { remoteLoad.current = false; return }
    if (!closed.current) writeDraft(thread.id, draft)
  }, [thread.id, draft])
  React.useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [])
  const source = messages.find((x) => x.id === draft.messageId) ?? messages.at(-1)!
  const switchMode = (mode: ReplyMode) => {
    const next = replyDraft(mode, thread, source, mailboxes)
    // Keep what was written; only the recipients and subject change.
    setDraft((d) => ({ ...next, text: d.text, doc: d.doc, files: d.files }))
  }
  function discard() {
    closed.current = true
    writeDraft(thread.id, null)
    attachments.clear()
    onClose()
  }
  async function send() {
    const bad = invalid(draft)
    if (bad.length) return void toast.error(`Check ${bad.join(", ")}`)
    if (draft.mode === "forward" && !draft.messageId) return
    const linked = await checkMentions(mentionAccess.check, draft)
    if (!linked) return
    const files = attachments.ready
    const sending = { ...linked, files, idempotencyKey: draft.idempotencyKey ?? crypto.randomUUID() }
    setDraft(sending)
    setPending(true)
    schedule({
      run: () => sendRequest(sending, files, thread.id, thread.id),
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
      {conflict && <DraftConflict draftKey={thread.id} />}
      {mentionAccess.dialog}
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
        signatureHtml={signatureHtml}
        onSend={() => void send()}
        onDiscard={discard}
      />
    </div>
  )
}

/** A new e-mail in the docked window (`ComposeFrame`); the draft is kept when the window is closed. */
export function ComposeWindow({
  open,
  prefill,
  draftKey = NEW_DRAFT,
  inline = false,
  mailboxes,
  mailbox,
  contacts,
  signatures,
  signatureBrand,
  schedule,
  onClose,
}: {
  open: boolean
  /** Recipient from "New e-mail to …" in the sender panel. */
  prefill: { to?: string; nonce: number } | null
  /** Which draft this window edits: NEW_DRAFT, or one from Drafts (e.g. an AI app's "d-…"). */
  draftKey?: string
  /** In the detail pane (a draft opened from Drafts) instead of the docked window. */
  inline?: boolean
  mailboxes: string[]
  mailbox: string
  contacts: string[]
  signatures: Record<string, MailboxSignature>
  signatureBrand: SignatureBrand
  schedule: (job: SendJob) => void
  onClose: () => void
}) {
  const attachments = useAttachments(upload)
  const mentionAccess = useMentionAccess()
  const fresh = React.useCallback(
    (from: string, to: string[] = []): Draft => ({ mode: "new", from, to, cc: [], subject: "", text: "" }),
    [],
  )
  const [draft, setDraft] = React.useState<Draft>(() => fresh(mailbox))
  const [pending, setPending] = React.useState(false)
  const [focusKey, setFocusKey] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    const saved = readDraft(draftKey)
    const to = splitAddresses(prefill?.to)
    touched.current = false
    attachments.restore(saved?.files ?? [])
    setDraft(saved && mailboxes.includes(saved.from) ? { ...saved, to: [...new Set([...saved.to, ...to])] } : fresh(mailbox, to))
    setFocusKey((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.nonce, draftKey])

  const touched = React.useRef(false)
  const conflict = useRemoteDraft(draftKey, next => {
    touched.current = false
    if (next) { setDraft(next); attachments.restore(next.files ?? []) }
    else { setDraft(fresh(mailbox)); attachments.clear(); onClose() }
  })
  const fileState = JSON.stringify(attachments.ready)
  const filesMounted = React.useRef(false)
  React.useEffect(() => {
    if (!filesMounted.current) { filesMounted.current = true; return }
    setDraft(d => {
      if (JSON.stringify(d.files ?? []) === fileState) return d
      touched.current = true
      return { ...d, files: attachments.ready }
    })
  }, [attachments.items])
  const set = (patch: Partial<Draft>) => {
    touched.current = true
    setDraft((d) => ({ ...d, ...patch, idempotencyKey: undefined }))
  }
  // Saved once something was typed, so opening and closing an empty window leaves no draft.
  React.useEffect(() => {
    if (touched.current) writeDraft(draftKey, draft)
  }, [draft])

  function discard() {
    touched.current = false
    writeDraft(draftKey, null)
    attachments.clear()
    setDraft(fresh(mailbox))
    onClose()
  }
  async function send() {
    const bad = invalid(draft)
    if (bad.length) return void toast.error(`Check ${bad.join(", ")}`)
    if (!draft.subject.trim()) return void toast.error("Add a subject")
    const linked = await checkMentions(mentionAccess.check, draft)
    if (!linked) return
    const files = attachments.ready
    const sending = { ...linked, files, idempotencyKey: draft.idempotencyKey ?? crypto.randomUUID() }
    setDraft(sending)
    setPending(true)
    schedule({
      run: () => sendRequest(sending, files, undefined, draftKey),
      undo: () => { setDraft(d => ({ ...d, idempotencyKey: undefined })); setPending(false) },
      failed: () => setPending(false),
      done: () => {
        touched.current = false
        writeDraft(draftKey, null)
        attachments.clear()
        setPending(false)
        setDraft(fresh(mailbox))
        onClose()
      },
    })
  }

  const title = draft.subject.trim() || "New e-mail"
  const form = (
    <>
      {conflict && <DraftConflict draftKey={draftKey} />}
      {mentionAccess.dialog}
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
        signatureHtml={signaturePreview(signatures[draft.from], signatureBrand, draft.from)}
        onSend={() => void send()}
        onDiscard={discard}
      />
    </>
  )
  if (!inline) return <ComposeFrame open={open && !pending} title={title} openKey={focusKey} onClose={onClose}>{form}</ComposeFrame>
  if (!open || pending) return null
  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close (the draft is kept)" title="Close (the draft is kept)">
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{form}</div>
    </section>
  )
}
