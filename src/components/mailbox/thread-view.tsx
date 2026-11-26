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
import { IconAction } from "@/components/workspace/detail-header"
import type { MenuAction } from "@/components/workspace/action-menu"
import { InlineComposer, replyDraft, type SendJob } from "./composer"
import { readDraft, writeDraft } from "./drafts"
import { MessageItem } from "./message-view"
import type { Draft, ReplyMode, ThreadDetail, ThreadPatch } from "./types"
import { appLocale, t, tp } from "@/lib/i18n/panel"

const presetTime = (d: Date) => d.toLocaleString(appLocale(), { weekday: "short", hour: "2-digit", minute: "2-digit" })

/** Snooze presets plus a date picker; `onSnooze` gets the time in ms. */
export function SnoozeMenu({ onSnooze, children }: { onSnooze: (at: number) => void; children: React.ReactNode }) {
  const [custom, setCustom] = React.useState(false)
  const presets = React.useMemo(() => snoozePresets(new Date()), [custom])
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{t("Snooze until…")}</DropdownMenuLabel>
          {presets.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => onSnooze(p.at.getTime())} className="justify-between">
              {p.label} <span className="text-muted-foreground text-xs">{presetTime(p.at)}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCustom(true)}>{t("Pick a date and time…")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SnoozeDialog open={custom} onOpenChange={setCustom} onSnooze={onSnooze} />
    </>
  )
}

/** The custom date and time for snoozing, opened from SnoozeMenu or a row's menu. */
export function SnoozeDialog({ open, onOpenChange, onSnooze }: { open: boolean; onOpenChange: (open: boolean) => void; onSnooze: (at: number) => void }) {
  const presets = React.useMemo(() => snoozePresets(new Date()), [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto gap-0 p-0 sm:max-w-fit">
        <DialogHeader className="border-b px-5 pt-5 pb-4">
          <DialogTitle>{t("Snooze until")}</DialogTitle>
          <DialogDescription>{t("It comes back to the inbox as unread.")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <DateTimePanel
            presets={presets}
            confirmLabel={t("Snooze")}
            onConfirm={(at) => {
              onSnooze(at)
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** The snooze presets as menu actions (a row's right-click menu), plus "Pick a date and time…". */
export function snoozeActions(onSnooze: (at: number) => void, onCustom: () => void): MenuAction[] {
  return [
    ...snoozePresets(new Date()).map((p) => ({ label: `${p.label} · ${presetTime(p.at)}`, onSelect: () => onSnooze(p.at.getTime()) })),
    { separator: true as const },
    { label: t("Pick a date and time…"), onSelect: onCustom },
  ]
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
    signatureHtml: string | null
    schedule: (job: SendJob) => void
    onPatch: (patch: ThreadPatch) => void
    onDelete: () => void
    onBack: () => void
    onInfo?: () => void
  }
>(function ThreadView({ detail, mailboxes, multipleMailboxes, contacts, signatureHtml, schedule, onPatch, onDelete, onBack, onInfo }, handle) {
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
    const next = replyDraft(mode, thread, source, mailboxes)
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
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label={t("Back to the list")} onClick={onBack}>
          <ArrowLeft />
        </Button>
        {thread.trashedAt ? (
          <>
            <IconAction label={t("Move to inbox")} onClick={() => onPatch({ trashed: false, archived: false })}>
              <RotateCcw />
            </IconAction>
            <ConfirmButton
              title={t("Delete forever?")}
              description={t("The thread and its files are removed. This can't be undone.")}
              confirmLabel={t("Delete forever")}
              onConfirm={onDelete}
            >
              <Button variant="ghost" size="sm" className="text-destructive">
                <Trash2 /> {t("Delete forever")}
              </Button>
            </ConfirmButton>
          </>
        ) : (
          <>
            {thread.archivedAt || snoozed ? (
              <IconAction label={t("Move to inbox (e)")} onClick={() => onPatch({ archived: false, snoozedUntil: null })}>
                <Inbox />
              </IconAction>
            ) : (
              <IconAction label={t("Archive (e)")} onClick={() => onPatch({ archived: true })}>
                <Archive />
              </IconAction>
            )}
            <SnoozeMenu onSnooze={(at) => onPatch({ snoozedUntil: at })}>
              <Button variant="ghost" size="icon-sm" aria-label={t("Snooze")}>
                <Clock />
              </Button>
            </SnoozeMenu>
            <IconAction label={t("Move to trash (#)")} onClick={() => onPatch({ trashed: true })}>
              <Trash2 />
            </IconAction>
            <IconAction label={t("Mark unread (u)")} onClick={() => onPatch({ unread: true })}>
              <Mail />
            </IconAction>
            <IconAction label={thread.starred ? t("Unstar (s)") : t("Star (s)")} onClick={() => onPatch({ starred: !thread.starred })}>
              <Star className={cn(thread.starred && "fill-amber-400 text-amber-500")} />
            </IconAction>
            {thread.spam ? (
              <IconAction label={t("Not spam")} onClick={() => onPatch({ spam: false })}>
                <ShieldCheck />
              </IconAction>
            ) : (
              <IconAction label={t("Report spam (!)")} onClick={() => onPatch({ spam: true })}>
                <ShieldAlert />
              </IconAction>
            )}
          </>
        )}
        <span className="flex-1" />
        {onInfo ? (
          <IconAction label={t("About the sender")} onClick={onInfo}>
            <Info />
          </IconAction>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-3 py-5 md:px-6">
          <div className="grid gap-1.5 px-1">
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-balance">{thread.subject || t("(no subject)")}</h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {multipleMailboxes ? (
                <span className="text-foreground/80 flex items-center gap-1.5 rounded px-1.5 py-0.5" style={{ background: tint(mailboxColor(thread.mailbox), 14) }}>
                  <span className="size-2 rounded-[3px]" style={{ background: mailboxColor(thread.mailbox) }} aria-hidden /> {thread.mailbox}
                </span>
              ) : null}
              <span className="flex items-center gap-1 px-0.5">
                <MessagesSquare className="size-3" /> {tp(messages.length, { one: "{n} message", other: "{n} messages" })}
              </span>
              {files ? (
                <span className="flex items-center gap-1 px-0.5">
                  <Paperclip className="size-3" /> {tp(files, { one: "{n} file", other: "{n} files" })}
                </span>
              ) : null}
              {snoozed ? (
                <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                  <Clock className="size-3" /> {t("Snoozed until {time}", { time: new Date(thread.snoozedUntil!).toLocaleString(appLocale(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}
                </span>
              ) : null}
              {thread.spam && !thread.trashedAt ? (
                <span className="bg-destructive/10 text-destructive flex items-center gap-1 rounded px-1.5 py-0.5" title={messages.flatMap((x) => x.spamReasons ?? []).join(", ")}>
                  <ShieldAlert className="size-3" /> {t("Spam")}
                </span>
              ) : null}
              {thread.trashedAt ? (
                <span className="bg-destructive/10 text-destructive flex items-center gap-1 rounded px-1.5 py-0.5">
                  <Trash2 className="size-3" /> {t("In the trash")}
                </span>
              ) : null}
              {thread.archivedAt && !thread.trashedAt ? (
                <span className="bg-muted flex items-center gap-1 rounded px-1.5 py-0.5">
                  <Archive className="size-3" /> {t("Archived")}
                </span>
              ) : null}
            </p>
          </div>
          <ol className="divide-border/70 grid grid-cols-1 divide-y">
            {messages.map((msg, i) => {
              if (fold && hidden.some((h) => h.id === msg.id)) {
                return hidden[0]!.id === msg.id ? (
                  <li key="fold">
                    <button type="button" onClick={() => setUnfolded(true)} className="text-muted-foreground hover:text-foreground flex w-full items-center gap-3 px-3 py-1 text-sm">
                      <span className="bg-muted grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-medium">{hidden.length}</span>
                      {tp(hidden.length, { one: "earlier message", other: "earlier messages" })}
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
              signatureHtml={signatureHtml}
              schedule={schedule}
              focusSignal={focusSignal}
              onClose={() => setDraft(null)}
            />
          ) : (
            // A docked reply field (Superhuman, Gmail) rather than a row of outlined buttons.
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => startReply("reply")}
                className="text-muted-foreground hover:text-foreground hover:border-foreground/20 focus-visible:ring-ring/50 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-left text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors focus-visible:ring-[3px]"
              >
                <Reply className="size-4 shrink-0" />
                <span className="truncate">{t("Reply…")}</span>
                <Kbd className="ml-auto">R</Kbd>
              </button>
              {replyAll ? (
                <IconAction label={t("Reply all (a)")} onClick={() => startReply("replyAll")}>
                  <ReplyAll />
                </IconAction>
              ) : null}
              <IconAction label={t("Forward (f)")} onClick={() => startReply("forward")}>
                <Forward />
              </IconAction>
            </div>
          )}
        </div>
      </div>
    </section>
  )
})
