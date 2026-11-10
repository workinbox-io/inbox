import * as React from "react"
import { AlarmClock, Archive, AtSign, CalendarClock, CheckCheck, Clock, CornerUpLeft, FilePen, Inbox, Loader2, Mail, MailOpen, Paperclip, PenLine, PenSquare, RotateCcw, Search, SearchX, Send, Settings2, ShieldAlert, Star, Trash2, X, type LucideIcon } from "lucide-react"

import type { MailView as MailFolder } from "./types"
import { ALL_MAILBOXES } from "@/lib/admin-mail/rules"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/app/empty-state"
import { Checkbox } from "@/components/ui/checkbox"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmButton } from "@/components/app/confirm-button"
import { shortDate } from "./message-view"
import { SnoozeMenu } from "./thread-view"
import { Kbd, mailboxColor, tint } from "./mail-ui"
import { ActionMenu, ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import type { MailThread, ThreadPatch } from "./types"

export const FOLDERS: { id: MailFolder; label: string; icon: LucideIcon }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "drafts", label: "Drafts", icon: FilePen },
  { id: "sent", label: "Sent", icon: Send },
  { id: "outbox", label: "Outbox", icon: CalendarClock },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "spam", label: "Spam", icon: ShieldAlert },
  { id: "trash", label: "Trash", icon: Trash2 },
]

const EMPTY: Record<MailFolder, { icon: LucideIcon; text: string }> = {
  inbox: { icon: CheckCheck, text: "Inbox zero. Nothing waiting" },
  starred: { icon: Star, text: "No starred threads" },
  spam: { icon: ShieldAlert, text: "No spam. Nice" },
  snoozed: { icon: AlarmClock, text: "Nothing snoozed" },
  sent: { icon: Send, text: "Nothing sent yet" },
  drafts: { icon: FilePen, text: "No drafts. Unsent mail and AI apps' drafts wait here" },
  outbox: { icon: CalendarClock, text: "Nothing scheduled or sent recently" },
  archived: { icon: Archive, text: "Nothing archived" },
  trash: { icon: Trash2, text: "The trash is empty" },
}

export function ThreadList({
  mailboxes,
  mailbox,
  onMailbox,
  unread,
  folder,
  onFolder,
  query,
  onQuery,
  searchRef,
  threads,
  hasMore,
  onLoadMore,
  loading,
  selectedId,
  onOpen,
  selection,
  onSelection,
  onBulk,
  onBulkDelete,
  drafts,
  onCompose,
  onSettings,
  counts = {},
  bulkActions,
  rail = false,
  account,
  actionsFor,
}: {
  mailboxes: string[]
  mailbox: string
  onMailbox: (m: string) => void
  unread: Record<string, number>
  folder: MailFolder
  onFolder: (f: MailFolder) => void
  query: string
  onQuery: (q: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  threads: MailThread[]
  hasMore: boolean
  onLoadMore: () => void
  loading: boolean
  selectedId: string | null
  onOpen: (id: string) => void
  selection: Set<string>
  onSelection: (s: Set<string>) => void
  onBulk: (patch: ThreadPatch) => void
  onBulkDelete: () => void
  drafts: Set<string>
  onCompose: () => void
  onSettings: () => void
  /** Counts next to folders other than the inbox (drafts, scheduled sends). */
  counts?: Partial<Record<MailFolder, number>>
  /** Replaces the thread actions of a selection (Drafts: discard; Outbox: cancel). */
  bulkActions?: React.ReactNode
  /** Folders and mailboxes live in the rail (desktop): the list shows only the folder's name and search. */
  rail?: boolean
  /** The account menu (mail-only view on a phone), next to Compose. */
  account?: React.ReactNode
  /** A thread's right-click menu and "…" (mailbox-app.tsx `threadActions`). */
  actionsFor?: (thread: MailThread) => MenuAction[]
}) {
  // Dates in the viewer's time zone: the server renders none, so nothing jumps after loading.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const all = mailbox === ALL_MAILBOXES
  const totalUnread = all ? Object.values(unread).reduce((a, b) => a + b, 0) : (unread[mailbox] ?? 0)
  const selecting = selection.size > 0
  const toggle = (id: string) => {
    const next = new Set(selection)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelection(next)
  }
  const allChecked = threads.length > 0 && threads.every((t) => selection.has(t.id))

  return (
    <aside className="@container flex h-full min-h-0 flex-col">
      <div className={cn("grid gap-2.5 p-3", !rail && "border-b")}>
        {rail ? (
          <div className="flex h-8 items-baseline gap-2 px-1">
            <h2 className="text-lg font-semibold tracking-tight">{query ? "Search" : FOLDERS.find((f) => f.id === folder)?.label}</h2>
            <span className="text-muted-foreground truncate text-[13px]">
              {folder === "inbox" && !query && totalUnread ? `${totalUnread} unread · ` : ""}
              {all ? "All mailboxes" : mailbox}
            </span>
            {loading ? <Loader2 className="text-muted-foreground ml-auto size-3.5 animate-spin" /> : null}
          </div>
        ) : null}
        <div className={cn("flex items-center gap-2", rail && "hidden")}>
          {mailboxes.length > 1 ? (
            <Select value={mailbox} onValueChange={onMailbox}>
              <SelectTrigger size="sm" className="min-w-0 flex-1 font-medium" aria-label="Mailbox">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MAILBOXES}>All mailboxes</SelectItem>
                {mailboxes.map((m) => (
                  <SelectItem key={m} value={m}>
                    <span className="flex w-full items-center justify-between gap-3">
                      {m}
                      {unread[m] ? <span className="text-muted-foreground text-xs">{unread[m]}</span> : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{mailboxes[0]}</span>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onSettings} aria-label="Settings" title="Settings">
            <Settings2 />
          </Button>
          <Button size="sm" className="rounded-full" onClick={onCompose} title="New e-mail (c)">
            <PenSquare /> Compose
          </Button>
          {account}
        </div>
        <InputGroup className={cn("h-8", rail && "bg-foreground/[0.04] border-transparent shadow-none dark:bg-foreground/[0.06]")}>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation()
                if (query) onQuery("")
                else e.currentTarget.blur()
              }
            }}
            placeholder="Search mail"
            aria-label="Search mail"
            className="text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" onClick={() => onQuery("")} aria-label="Clear search">
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          ) : (
            <InputGroupAddon align="inline-end">
              <Kbd>/</Kbd>
            </InputGroupAddon>
          )}
        </InputGroup>
        {selecting ? (
          <div className="flex h-8 items-center gap-1">
            <Checkbox checked={allChecked ? true : "indeterminate"} onCheckedChange={() => onSelection(allChecked ? new Set() : new Set(threads.map((t) => t.id)))} aria-label="Select all" className="mx-1" />
            <span className="mr-auto text-sm font-medium">{selection.size} selected</span>
            {bulkActions ? (
              bulkActions
            ) : folder === "trash" ? (
              <>
                <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ trashed: false, archived: false })} aria-label="Move to inbox" title="Move to inbox">
                  <RotateCcw />
                </Button>
                <ConfirmButton title={`Delete ${selection.size} forever?`} description="The threads and their files are removed. This can't be undone." confirmLabel="Delete forever" onConfirm={onBulkDelete}>
                  <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label="Delete forever" title="Delete forever">
                    <Trash2 />
                  </Button>
                </ConfirmButton>
              </>
            ) : (
              <>
                {folder === "archived" || folder === "snoozed" ? (
                  <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ archived: false, snoozedUntil: null })} aria-label="Move to inbox" title="Move to inbox">
                    <Inbox />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ archived: true })} aria-label="Archive" title="Archive">
                    <Archive />
                  </Button>
                )}
                <SnoozeMenu onSnooze={(at) => onBulk({ snoozedUntil: at })}>
                  <Button variant="ghost" size="icon-sm" aria-label="Snooze" title="Snooze">
                    <Clock />
                  </Button>
                </SnoozeMenu>
                <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ unread: false })} aria-label="Mark read" title="Mark read">
                  <MailOpen />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ unread: true })} aria-label="Mark unread" title="Mark unread">
                  <Mail />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ trashed: true })} aria-label="Move to trash" title="Move to trash">
                  <Trash2 />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => onSelection(new Set())} aria-label="Clear selection" title="Clear selection">
              <X />
            </Button>
          </div>
        ) : query ? (
          <p className="text-muted-foreground flex h-8 items-center gap-1.5 text-xs">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {loading ? "Searching…" : `${threads.length}${hasMore ? "+" : ""} ${threads.length === 1 ? "result" : "results"}${folder === "drafts" || folder === "outbox" ? "" : " in every folder but the trash"}`}
          </p>
        ) : rail ? null : (
          <SegmentedControl
            fullWidth
            aria-label="Folders"
            value={folder}
            onValueChange={onFolder}
            options={FOLDERS.map((f) => ({
              value: f.id,
              // A narrow list shows the other folders as icons; the open one always has its name.
              label: (
                <span className="flex items-center gap-1.5" title={f.label}>
                  <f.icon className="size-3.5 shrink-0" />
                  <span className={cn(folder !== f.id && "sr-only @min-[680px]:not-sr-only")}>{f.label}</span>
                </span>
              ),
              count: f.id === "inbox" ? totalUnread : counts[f.id] || undefined,
            }))}
          />
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-1">
        {threads.map((t) => {
          const checked = selection.has(t.id)
          const draft = drafts.has(t.id)
          const color = mailboxColor(t.mailbox)
          return (
            <ThreadRowMenu key={t.id} actions={actionsFor ? () => actionsFor(t) : undefined}>
              {/* Styled like a calendar event: the mailbox's colour as a bar, its tint when open. */}
              <div
                className={cn("relative flex gap-2.5 rounded-md py-2 pr-2.5 pl-3.5 transition-colors", t.id !== selectedId && !checked && "hover:bg-foreground/[0.035] group-data-[menu-open]:bg-foreground/[0.035]")}
                style={t.id === selectedId || checked ? { background: tint(color, t.id === selectedId ? 13 : 8) } : undefined}
              >
                <span className="absolute top-1.5 bottom-1.5 left-1 w-[3px] rounded-full" style={{ background: color, opacity: t.unread || t.id === selectedId ? 1 : 0.3 }} aria-hidden />
                <span className="relative mt-[3px] grid size-3.5 shrink-0 place-items-center self-start">
                  {t.unread ? <span className={cn("size-1.5 rounded-full", (selecting || checked) && "hidden", "group-hover:hidden")} style={{ background: color }} aria-label="Unread" /> : null}
                  <Checkbox checked={checked} onCheckedChange={() => toggle(t.id)} aria-label={`Select ${t.subject || "thread"}`} className={cn("absolute inset-0 size-3.5", !(selecting || checked) && "opacity-0 group-hover:opacity-100")} />
                </span>
                <button type="button" onClick={() => onOpen(t.id)} className="grid min-w-0 flex-1 grid-cols-1 gap-0.5 text-left">
                  <span className="flex items-center gap-2">
                    <span className={cn("min-w-0 truncate text-[13px]", t.unread ? "text-foreground font-semibold" : "text-foreground/80 font-medium")}>{t.contactName ?? t.contactEmail}</span>
                    {t.messageCount && t.messageCount > 1 ? <span className="text-muted-foreground text-[11px] tabular-nums">{t.messageCount}</span> : null}
                    <span className={cn("ml-auto flex shrink-0 items-center gap-1.5", actionsFor && "group-hover:invisible group-data-[menu-open]:invisible")}>
                      {t.starred ? <Star className="size-3 fill-amber-400 text-amber-500" aria-label="Starred" /> : null}
                      {t.hasFiles ? <Paperclip className="text-muted-foreground size-3" aria-label="Has attachments" /> : null}
                      {folder === "snoozed" && t.snoozedUntil ? <AlarmClock className="size-3 text-amber-600 dark:text-amber-400" aria-label="Snoozed until" /> : null}
                      <time className={cn("text-[11px] tabular-nums", t.unread ? "text-foreground font-medium" : "text-muted-foreground")} dateTime={t.lastMessageAt} suppressHydrationWarning>
                        {mounted ? (folder === "snoozed" && t.snoozedUntil ? shortDate(t.snoozedUntil) : shortDate(t.lastMessageAt)) : null}
                      </time>
                    </span>
                  </span>
                  <span className={cn("flex min-w-0 items-center gap-1.5 text-[13px]", t.unread ? "text-foreground" : "text-foreground/70")}>
                    {draft ? (
                      <span className="text-destructive flex shrink-0 items-center gap-1 font-medium">
                        <PenLine className="size-3" /> Draft
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{t.subject || "(no subject)"}</span>
                    {t.labels?.map(label=><Badge key={label.id} variant="secondary">{label.name}</Badge>)}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    {all && !rail ? (
                      <span className="flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px]" style={{ background: tint(color, 14) }}>
                        <AtSign className="size-2.5" />
                        {t.mailbox.split("@")[0]}
                      </span>
                    ) : null}
                    {t.lastDirection === "out" ? <CornerUpLeft className="size-3 shrink-0" aria-label="You replied" /> : null}
                    <span className="min-w-0 truncate">{t.snippet || " "}</span>
                  </span>
                </button>
              </div>
            </ThreadRowMenu>
          )
        })}
        {threads.length ? null : (
          <li className={loading ? "text-muted-foreground grid justify-items-center p-10" : undefined}>
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <EmptyState variant="plain" density="compact" className="py-10 md:py-14" icon={React.createElement(query ? SearchX : EMPTY[folder].icon)} title={query ? "Nothing matches that search" : EMPTY[folder].text} />
            )}
          </li>
        )}
        {hasMore ? (
          <li className="p-3 text-center">
            <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loading}>
              Load more
            </Button>
          </li>
        ) : null}
      </ul>
    </aside>
  )
}

/** A thread row with its right-click menu and the "…" that replaces the date on hover. */
function ThreadRowMenu({ actions, children }: { actions?: () => MenuAction[]; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <ActionMenu actions={actions} onOpenChange={setOpen}>
      <li className="group relative mx-2 my-0.5" data-menu-open={open || undefined}>
        {children}
        {actions ? (
          <span className="absolute top-1.5 right-1.5 hidden group-hover:flex group-data-[menu-open]:flex">
            <ActionMenuButton actions={actions} label="Thread actions" onOpenChange={setOpen} />
          </span>
        ) : null}
      </li>
    </ActionMenu>
  )
}
