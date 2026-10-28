import * as React from "react"
import { AtSign, ChevronDown, Maximize2, Minimize2, Minus, Plus, Reply, ReplyAll, Forward, Send, Trash2, Type, User, Users, X, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api-client"
import { forwardSubject, replyRecipients, splitAddresses, withSignature } from "@/lib/admin-mail/rules"
import { replySubject } from "@/lib/mail/threading"
import { cn } from "@/lib/utils"
import { guardLeaving } from "@/lib/panel-history"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/app/user-avatar"
import { AttachButton, AttachmentDropZone, AttachmentStrip, uploadWithProgress, useAttachments, type Attachments, type UploadFn } from "@/components/uploads/attachments"
import { NEW_DRAFT, readDraft, writeDraft } from "./drafts"
import type { Draft, MailMessage, MailThread, ReplyMode } from "./types"

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/
const UNDO_MS = 5000

const upload: UploadFn = (file, mediaType, onProgress) => uploadWithProgress("/api/app/attachments", {}, file, mediaType, onProgress, "Upload failed")

export interface SendJob {
  run: () => Promise<{ threadId: string }>
  /** Undo pressed: show the message again. */
  undo: () => void
  failed: () => void
  done: (threadId: string) => void
}

/**
 * Sending waits a few seconds with an "Undo" toast, like Gmail; leaving the page meanwhile asks first.
 * onSent runs after the server took the mail (refreshes the list and thread).
 */
export function useUndoSend(onSent: (threadId: string) => void) {
  const pending = React.useRef(0)
  const sent = React.useRef(onSent)
  sent.current = onSent
  React.useEffect(() => guardLeaving(() => pending.current > 0), [])
  return React.useCallback((job: SendJob) => {
    pending.current++
    const timer = setTimeout(async () => {
      try {
        const res = await job.run()
        toast.success("Sent", { id })
        job.done(res.threadId)
        sent.current(res.threadId)
      } catch (e) {
        toast.error((e as Error).message, { id })
        job.failed()
      } finally {
        pending.current--
      }
    }, UNDO_MS)
    const id = toast("Sending…", {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer)
          pending.current--
          job.undo()
        },
      },
    })
  }, [])
}

/** One labelled line of the mail header (From, To, Subject), like a mail app. */
function FieldRow({ label, icon: Icon, htmlFor, end, children }: { label: string; icon: LucideIcon; htmlFor?: string; end?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-b px-4">
      <label htmlFor={htmlFor} className="text-muted-foreground flex w-20 shrink-0 items-center gap-1.5 text-sm">
        <Icon className="size-3.5" />
        {label}
      </label>
      <div className="min-w-0 flex-1 py-1">{children}</div>
      {end}
    </div>
  )
}

/**
 * Recipients as chips: Enter, comma or space (or leaving the field) adds the typed address,
 * Backspace in the empty field removes the last one, pasted lists are split. Suggestions come
 * from the people in the mailbox.
 */
export function AddressInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  autoFocus,
}: {
  id: string
  value: string[]
  onChange: (v: string[]) => void
  suggestions: string[]
  placeholder?: string
  autoFocus?: boolean
}) {
  const [text, setText] = React.useState("")
  const add = (raw: string) => {
    const found = splitAddresses(raw).filter((a) => !value.includes(a))
    if (found.length) onChange([...value, ...new Set(found)])
    setText("")
  }
  const matches = text.length > 1 ? suggestions.filter((s) => s.includes(text.toLowerCase()) && !value.includes(s)).slice(0, 6) : []
  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {value.map((a) => (
        <span
          key={a}
          className={cn("inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-1 text-sm", EMAIL.test(a) ? "bg-muted" : "bg-destructive/10 text-destructive")}
          title={EMAIL.test(a) ? a : "Not a valid e-mail address"}
        >
          <UserAvatar seed={a} size={18} />
          <span className="truncate">{a}</span>
          <button type="button" onClick={() => onChange(value.filter((x) => x !== a))} className="hover:bg-foreground/10 rounded-full p-0.5" aria-label={`Remove ${a}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => {
          const v = e.target.value
          if (/[,;\s]$/.test(v)) add(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            e.preventDefault()
            add(matches[0] && !EMAIL.test(text) ? matches[0] : text)
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text")
          if (/[,;\s]/.test(pasted.trim())) {
            e.preventDefault()
            add(pasted)
          }
        }}
        onBlur={() => text.trim() && add(text)}
        className="placeholder:text-muted-foreground h-7 min-w-32 flex-1 bg-transparent text-sm outline-none"
      />
      {matches.length ? (
        <ul className="bg-popover absolute top-full left-0 z-20 mt-1 w-80 max-w-full overflow-hidden rounded-xl border shadow-md">
          {matches.map((s) => (
            <li key={s}>
              <button
                type="button"
                // mousedown: before the input's blur turns the half-typed text into a chip.
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(s)
                }}
                className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
              >
                <UserAvatar seed={s} size={20} />
                <span className="truncate">{s}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const invalid = (d: Draft) => [...d.to, ...d.cc].filter((a) => !EMAIL.test(a))

/** The request that sends a draft: a reply in its thread, a forward, or a new e-mail. */
function sendRequest(d: Draft, files: { url: string; mediaType: string; filename: string }[], threadId?: string) {
  const base = { to: d.to[0], cc: [...d.to.slice(1), ...d.cc], text: d.text.trim(), files }
  if ((d.mode === "reply" || d.mode === "replyAll") && threadId) return api<{ threadId: string }>("POST", `/api/app/admin/mail/${threadId}/reply`, base)
  if (d.mode === "forward") return api<{ threadId: string }>("POST", "/api/app/admin/mail", { ...base, forwardOf: d.messageId, subject: d.subject })
  return api<{ threadId: string }>("POST", "/api/app/admin/mail", { ...base, mailbox: d.from, subject: d.subject })
}

/** Header fields, body, files and the send row, shared by the inline reply and the new e-mail window. */
function MailForm({
  draft,
  set,
  contacts,
  mailboxes,
  attachments,
  showFrom,
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
  showSubject?: boolean
  note?: string
  bodyClassName?: string
  autoFocusTo?: boolean
  onSend: () => void
  onDiscard: () => void
}) {
  const [showCc, setShowCc] = React.useState(draft.cc.length > 0)
  const body = React.useRef<HTMLTextAreaElement>(null)
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
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
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm">
              Luxivo <span className="text-muted-foreground">&lt;{draft.from}&gt;</span>
            </span>
          )}
        </FieldRow>
      ) : null}
      <FieldRow label="To" icon={User} htmlFor="mail-to" end={ccToggle}>
        <AddressInput id="mail-to" value={draft.to} onChange={(to) => set({ to })} suggestions={contacts} placeholder="name@company.com" autoFocus={autoFocusTo} />
      </FieldRow>
      {showCc ? (
        <FieldRow label="Cc" icon={Users} htmlFor="mail-cc">
          <AddressInput id="mail-cc" value={draft.cc} onChange={(cc) => set({ cc })} suggestions={contacts} autoFocus={!draft.cc.length} />
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
      <Textarea
        ref={body}
        value={draft.text}
        onChange={(e) => set({ text: e.target.value })}
        placeholder="Write your e-mail…"
        aria-label="Message"
        className={cn("min-h-32 flex-1 resize-none rounded-none border-0 px-4 py-3 text-[15px] leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent", bodyClassName)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.nativeEvent.isComposing) return
          e.preventDefault()
          if (!disabled) onSend()
        }}
      />
      {note ? <p className="text-muted-foreground px-4 pb-2 text-xs">{note}</p> : null}
      <AttachmentStrip attachments={attachments} removeLabel="Remove" className="px-4" />
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <span className="flex items-center gap-1">
          <Button type="button" size="sm" className="rounded-full px-4" disabled={disabled} onClick={onSend}>
            <Send /> Send
          </Button>
          <span className="text-muted-foreground ml-1 hidden text-xs sm:inline">{mac ? "⌘" : "Ctrl"}+Enter</span>
        </span>
        <span className="flex items-center gap-1">
          <AttachButton attachments={attachments} label="Attach a file" />
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDiscard} aria-label="Discard draft" title="Discard draft">
            <Trash2 />
          </Button>
        </span>
      </div>
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
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
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
    setPending(true)
    schedule({
      run: () => sendRequest(draft, files, thread.id),
      undo: () => setPending(false),
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

/**
 * A new e-mail in a window docked at the bottom right (Gmail), so the mailbox stays readable while
 * writing. It can be minimized to its title bar or made large; on a phone it fills the screen. The
 * draft is kept when the window is closed.
 */
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
  signatures: Record<string, { signature: string }>
  schedule: (job: SendJob) => void
  onClose: () => void
}) {
  const attachments = useAttachments(upload)
  const fresh = React.useCallback(
    (from: string, to: string[] = []): Draft => ({ mode: "new", from, to, cc: [], subject: "", text: withSignature("", signatures[from]?.signature ?? "") }),
    [signatures],
  )
  const [draft, setDraft] = React.useState<Draft>(() => fresh(mailbox))
  const [size, setSize] = React.useState<"normal" | "min" | "max">("normal")
  const [pending, setPending] = React.useState(false)
  const [focusKey, setFocusKey] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    const saved = readDraft(NEW_DRAFT)
    const to = prefill?.to ? [prefill.to] : []
    setDraft(saved && mailboxes.includes(saved.from) ? { ...saved, to: [...new Set([...saved.to, ...to])] } : fresh(mailbox, to))
    setSize("normal")
    setFocusKey((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.nonce])

  const touched = React.useRef(false)
  const set = (patch: Partial<Draft>) => {
    touched.current = true
    setDraft((d) => {
      const next = { ...d, ...patch }
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
    const sending = draft
    setPending(true)
    schedule({
      run: () => sendRequest(sending, files),
      undo: () => setPending(false),
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
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        "bg-background fixed z-50 flex flex-col overflow-hidden border shadow-2xl",
        "max-md:inset-0",
        size === "max" ? "md:inset-6 md:rounded-2xl" : "md:right-6 md:bottom-0 md:w-[600px] md:rounded-t-2xl",
        size === "min" ? "md:h-auto" : size === "normal" ? "md:h-[min(640px,85svh)]" : "",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        className="bg-muted/60 flex cursor-default items-center gap-2 px-4 py-2"
        onDoubleClick={() => setSize((s) => (s === "min" ? "normal" : "min"))}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <Button variant="ghost" size="icon-xs" className="max-md:hidden" onClick={() => setSize((s) => (s === "min" ? "normal" : "min"))} aria-label={size === "min" ? "Expand" : "Minimize"}>
          <Minus />
        </Button>
        <Button variant="ghost" size="icon-xs" className="max-md:hidden" onClick={() => setSize((s) => (s === "max" ? "normal" : "max"))} aria-label={size === "max" ? "Smaller" : "Full screen"}>
          {size === "max" ? <Minimize2 /> : <Maximize2 />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close (the draft is kept)" title="Close (the draft is kept)">
          <X />
        </Button>
      </div>
      {size === "min" ? null : (
        <MailForm
          key={focusKey}
          draft={draft}
          set={set}
          contacts={contacts}
          mailboxes={mailboxes}
          attachments={attachments}
          showFrom
          showSubject
          autoFocusTo={!draft.to.length}
          onSend={send}
          onDiscard={discard}
        />
      )}
    </div>
  )
}
