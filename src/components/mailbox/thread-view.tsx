import * as React from "react"
import { Archive, ArrowLeft, Clock, Forward, Inbox, Info, Mail, MessagesSquare, Paperclip, Reply, ReplyAll, RotateCcw, ShieldAlert, ShieldCheck, Star, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Kbd, mailboxColor, tint } from "./mail-ui"

import { hasOtherRecipients, snoozePresets } from "@/lib/admin-mail/rules"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DateTimePanel } from "@/components/ui/date-time-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmButton } from "@/components/app/confirm-button"
import { InlineComposer, replyDraft, type SendJob } from "./composer"
import { readDraft, writeDraft } from "./drafts"
import { MessageItem } from "./message-view"
import type { Draft, ReplyMode, ThreadDetail, ThreadPatch } from "./types"

const presetTime = (d: Date) => d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })

/** Snooze presets plus a date picker; `onSnooze` gets the time in ms. */
export function SnoozeMenu({ onSnooze, children }: { onSnooze: (at: number) => void; children: React.ReactNode }) {
  const [custom, setCustom] = React.useState(false)
  const presets = React.useMemo(() => snoozePresets(new Date()), [custom])
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Snooze until…</DropdownMenuLabel>
          {presets.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => onSnooze(p.at.getTime())} className="justify-between">
              {p.label} <span className="text-muted-foreground text-xs">{presetTime(p.at)}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCustom(true)}>Pick a date and time…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={custom} onOpenChange={setCustom}>
        <DialogContent className="w-auto gap-0 p-0 sm:max-w-fit">
          <DialogHeader className="border-b px-5 pt-5 pb-4">
            <DialogTitle>Snooze until</DialogTitle>
            <DialogDescription>It comes back to the inbox as unread.</DialogDescription>
          </DialogHeader>
          {custom ? (
            <DateTimePanel
              presets={presets}
              confirmLabel="Snooze"
              onConfirm={(at) => {
                onSnooze(at)
                setCustom(false)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function IconAction({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {/* "Archive (e)" shows as "Archive" with an E key chip. */}
        {label.replace(/\s*\(([^)]+)\)$/, "")}
        {/\(([^)]+)\)$/.exec(label) ? <Kbd className="border-white/20 bg-white/10 text-current shadow-none">{/\(([^)]+)\)$/.exec(label)![1]!.toUpperCase()}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  )
}

export interface ThreadViewHandle {
  reply: (mode: ReplyMode, messageId?: string) => void
}

/** Collapsed rows in the middle of a long thread fold into one "N earlier messages" line, like Gmail. */
const FOLD_AFTER = 4

export const ThreadView = React.forwardRef<
  ThreadViewHandle,
  {
    detail: ThreadDetail
    mailboxes: string[]
    multipleMailboxes: boolean
    contacts: string[]
    signature: string
    schedule: (job: SendJob) => void
    onPatch: (patch: ThreadPatch) => void
    onDelete: () => void
    onBack: () => void
    onInfo?: () => void
  }
>(function ThreadView({ detail, mailboxes, multipleMailboxes, contacts, signature, schedule, onPatch, onDelete, onBack, onInfo }, handle) {
  const { thread, messages } = detail
  const last = messages.at(-1)
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(last ? [last.id] : []))
  const [unfolded, setUnfolded] = React.useState(false)
  const [draft, setDraft] = React.useState<Draft | null>(() => readDraft(thread.id))
  const [focusSignal, setFocusSignal] = React.useState(0)

  React.useImperativeHandle(handle, () => ({ reply: (mode, messageId) => startReply(mode, messageId) }))

  function startReply(mode: ReplyMode, messageId?: string) {
    const source = messages.find((x) => x.id === messageId) ?? last
    if (!source) return
    const next = replyDraft(mode, thread, source, mailboxes, signature)
    // Switching an open draft keeps its text.
    const merged = draft ? { ...next, text: draft.text } : next
    writeDraft(thread.id, merged)
    setDraft(merged)
    setFocusSignal((n) => n + 1)
  }

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const fold = !unfolded && messages.length > FOLD_AFTER
  const hidden = fold ? messages.slice(1, -2).filter((x) => !expanded.has(x.id)) : []
  const replyAll = last ? hasOtherRecipients(last, thread.contactEmail, mailboxes) : false
  const files = messages.reduce((n, x) => n + x.files.length, 0)
  const snoozed = thread.snoozedUntil && new Date(thread.snoozedUntil).getTime() > Date.now()

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex items-center gap-1 border-b px-2 py-2 md:px-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Back to the list" onClick={onBack}>
          <ArrowLeft />
        </Button>
        {thread.trashedAt ? (
          <>
            <IconAction label="Move to inbox" onClick={() => onPatch({ trashed: false, archived: false })}>
              <RotateCcw />
            </IconAction>
            <ConfirmButton
              title="Delete forever?"
              description="The thread and its files are removed. This can't be undone."
              confirmLabel="Delete forever"
              onConfirm={onDelete}
            >
              <Button variant="ghost" size="sm" className="text-destructive">
                <Trash2 /> Delete forever
              </Button>
            </ConfirmButton>
          </>
        ) : (
          <>
            {thread.archivedAt || snoozed ? (
              <IconAction label="Move to inbox (e)" onClick={() => onPatch({ archived: false, snoozedUntil: null })}>
                <Inbox />
              </IconAction>
            ) : (
              <IconAction label="Archive (e)" onClick={() => onPatch({ archived: true })}>
                <Archive />
              </IconAction>
            )}
            <SnoozeMenu onSnooze={(at) => onPatch({ snoozedUntil: at })}>
              <Button variant="ghost" size="icon-sm" aria-label="Snooze">
                <Clock />
              </Button>
            </SnoozeMenu>
            <IconAction label="Move to trash (#)" onClick={() => onPatch({ trashed: true })}>
              <Trash2 />
            </IconAction>
            <IconAction label="Mark unread (u)" onClick={() => onPatch({ unread: true })}>
              <Mail />
            </IconAction>
            <IconAction label={thread.starred ? "Unstar (s)" : "Star (s)"} onClick={() => onPatch({ starred: !thread.starred })}>
              <Star className={cn(thread.starred && "fill-amber-400 text-amber-500")} />
            </IconAction>
            {thread.spam ? (
              <IconAction label="Not spam" onClick={() => onPatch({ spam: false })}>
                <ShieldCheck />
              </IconAction>
            ) : (
              <IconAction label="Report spam (!)" onClick={() => onPatch({ spam: true })}>
                <ShieldAlert />
              </IconAction>
            )}
          </>
        )}
        <span className="flex-1" />
        {onInfo ? (
          <IconAction label="About the sender" onClick={onInfo}>
            <Info />
          </IconAction>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-3 py-5 md:px-6">
          <div className="grid gap-1.5 px-1">
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-balance">{thread.subject || "(no subject)"}</h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {multipleMailboxes ? (
                <span className="text-foreground/80 flex items-center gap-1.5 rounded px-1.5 py-0.5" style={{ background: tint(mailboxColor(thread.mailbox), 14) }}>
                  <span className="size-2 rounded-[3px]" style={{ background: mailboxColor(thread.mailbox) }} aria-hidden /> {thread.mailbox}
                </span>
              ) : null}
              <span className="flex items-center gap-1 px-0.5">
                <MessagesSquare className="size-3" /> {messages.length} {messages.length === 1 ? "message" : "messages"}
              </span>
              {files ? (
                <span className="flex items-center gap-1 px-0.5">
                  <Paperclip className="size-3" /> {files} {files === 1 ? "file" : "files"}
                </span>
              ) : null}
              {snoozed ? (
                <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                  <Clock className="size-3" /> Snoozed until {new Date(thread.snoozedUntil!).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : null}
              {thread.spam && !thread.trashedAt ? (
                <span className="bg-destructive/10 text-destructive flex items-center gap-1 rounded px-1.5 py-0.5" title={messages.flatMap((x) => x.spamReasons ?? []).join(", ")}>
                  <ShieldAlert className="size-3" /> Spam
                </span>
              ) : null}
              {thread.trashedAt ? (
                <span className="bg-destructive/10 text-destructive flex items-center gap-1 rounded px-1.5 py-0.5">
                  <Trash2 className="size-3" /> In the trash
                </span>
              ) : null}
              {thread.archivedAt && !thread.trashedAt ? (
                <span className="bg-muted flex items-center gap-1 rounded px-1.5 py-0.5">
                  <Archive className="size-3" /> Archived
                </span>
              ) : null}
            </p>
          </div>
          <ol className="grid grid-cols-1 gap-2">
            {messages.map((msg, i) => {
              if (fold && hidden.some((h) => h.id === msg.id)) {
                return hidden[0]!.id === msg.id ? (
                  <li key="fold">
                    <button type="button" onClick={() => setUnfolded(true)} className="text-muted-foreground hover:text-foreground flex w-full items-center gap-3 px-3 py-1 text-sm">
                      <span className="bg-muted grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-medium">{hidden.length}</span>
                      earlier messages
                    </button>
                  </li>
                ) : null
              }
              return (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  expanded={expanded.has(msg.id) || i === messages.length - 1}
                  onToggle={() => i !== messages.length - 1 && toggle(msg.id)}
                  onReply={startReply}
                />
              )
            })}
          </ol>
          {draft ? (
            <InlineComposer
              key={`${thread.id}:${draft.mode}:${draft.messageId}`}
              thread={thread}
              messages={messages}
              initial={draft}
              mailboxes={mailboxes}
              contacts={contacts}
              signature={signature}
              schedule={schedule}
              focusSignal={focusSignal}
              onClose={() => setDraft(null)}
            />
          ) : (
            <div className="flex flex-wrap gap-2 pl-1">
              <Button variant="outline" size="sm" onClick={() => startReply("reply")}>
                <Reply /> Reply
              </Button>
              {replyAll ? (
                <Button variant="outline" size="sm" onClick={() => startReply("replyAll")}>
                  <ReplyAll /> Reply all
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => startReply("forward")}>
                <Forward /> Forward
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
})
