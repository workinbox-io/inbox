import * as React from "react"
import { Maximize2, Minimize2, Minus, Send, Trash2, Users, X, type LucideIcon } from "lucide-react"

import { splitAddresses } from "@/lib/admin-mail/rules"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/app/user-avatar"
import { AttachButton, AttachmentStrip, type Attachments } from "@/components/uploads/attachments"

/**
 * The parts of writing an e-mail like a mail app, shared by the staff mailboxes (admin-mail) and anything
 * else that sends one e-mail (a product's "new conversation"): the docked window, the From / To / Subject
 * rows, recipients as chips and the body with its send row.
 */

export interface AddressSuggestion {
  /** A name, or a group's name; empty shows the address. */
  label: string
  emails: string[]
}

export const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/

/** One labelled line of the mail header (From, To, Subject), like a mail app. */
export function FieldRow({ label, icon: Icon, htmlFor, end, children }: { label: string; icon: LucideIcon; htmlFor?: string; end?: React.ReactNode; children: React.ReactNode }) {
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
 * from the people the caller knows.
 */
export function AddressInput({
  id,
  value,
  onChange,
  suggestions,
  search,
  placeholder,
  autoFocus,
}: {
  id: string
  value: string[]
  onChange: (v: string[]) => void
  suggestions: string[]
  /** More suggestions from the server (an address book); a group suggestion adds all its addresses. */
  search?: (q: string) => Promise<AddressSuggestion[]>
  placeholder?: string
  autoFocus?: boolean
}) {
  const [text, setText] = React.useState("")
  const [remote, setRemote] = React.useState<AddressSuggestion[]>([])
  const add = (raw: string) => {
    const found = splitAddresses(raw).filter((a) => !value.includes(a))
    if (found.length) onChange([...value, ...new Set(found)])
    setText("")
  }
  React.useEffect(() => {
    const q = text.trim()
    if (!search || q.length < 2) return setRemote([])
    let live = true
    const timer = setTimeout(() => void search(q).then((r) => live && setRemote(r)).catch(() => live && setRemote([])), 150)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [text, search])
  const q = text.toLowerCase()
  const fromServer = text.length > 1 ? remote.filter((s) => s.emails.some((e) => !value.includes(e))) : []
  const known = new Set(fromServer.flatMap((s) => s.emails))
  const local = text.length > 1 ? suggestions.filter((s) => s.includes(q) && !value.includes(s) && !known.has(s)).map((s) => ({ label: "", emails: [s] })) : []
  const matches: AddressSuggestion[] = [...fromServer, ...local].slice(0, 8)
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
            add(matches[0] && !EMAIL.test(text) ? matches[0].emails.join(",") : text)
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
            <li key={s.label + s.emails.join(",")}>
              <button
                type="button"
                // mousedown: before the input's blur turns the half-typed text into a chip.
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(s.emails.join(","))
                }}
                className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
              >
                {s.emails.length > 1 ? (
                  <span className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full">
                    <Users className="size-3" />
                  </span>
                ) : (
                  <UserAvatar seed={s.emails[0]!} size={20} />
                )}
                <span className="grid min-w-0">
                  <span className="truncate">{s.label || s.emails[0]}</span>
                  {s.label ? <span className="text-muted-foreground truncate text-xs">{s.emails.length > 1 ? `${s.emails.length} · ${s.emails.slice(0, 3).join(", ")}` : s.emails[0]}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** The text, an optional note, the files and the send row (Send, Cmd/Ctrl+Enter, attach, discard). */
export function ComposeBody({
  value,
  onChange,
  bodyRef,
  placeholder = "Write your e-mail…",
  bodyClassName,
  note,
  attachments,
  disabled,
  sendLabel = "Send",
  onSend,
  onDiscard,
}: {
  value: string
  onChange: (text: string) => void
  bodyRef?: React.Ref<HTMLTextAreaElement>
  placeholder?: string
  bodyClassName?: string
  note?: React.ReactNode
  attachments: Attachments
  disabled: boolean
  sendLabel?: string
  onSend: () => void
  onDiscard: () => void
}) {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <>
      <Textarea
        ref={bodyRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
            <Send /> {sendLabel}
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
    </>
  )
}

/**
 * A window docked at the bottom right (Gmail), so the page stays readable while writing. It can be
 * minimized to its title bar or made large; on a phone it fills the screen. `openKey` changes on every
 * open, which brings it back to its normal size.
 */
export function ComposeFrame({
  title,
  openKey,
  closeLabel = "Close (the draft is kept)",
  onClose,
  children,
}: {
  title: string
  openKey?: React.Key
  closeLabel?: string
  onClose: () => void
  children: React.ReactNode
}) {
  const [size, setSize] = React.useState<"normal" | "min" | "max">("normal")
  React.useEffect(() => setSize("normal"), [openKey])
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
      <div className="bg-muted/60 flex cursor-default items-center gap-2 px-4 py-2" onDoubleClick={() => setSize((s) => (s === "min" ? "normal" : "min"))}>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <Button variant="ghost" size="icon-xs" className="max-md:hidden" onClick={() => setSize((s) => (s === "min" ? "normal" : "min"))} aria-label={size === "min" ? "Expand" : "Minimize"}>
          <Minus />
        </Button>
        <Button variant="ghost" size="icon-xs" className="max-md:hidden" onClick={() => setSize((s) => (s === "max" ? "normal" : "max"))} aria-label={size === "max" ? "Smaller" : "Full screen"}>
          {size === "max" ? <Minimize2 /> : <Maximize2 />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <X />
        </Button>
      </div>
      {size === "min" ? null : children}
    </div>
  )
}
