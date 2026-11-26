import * as React from "react"
import { AlarmClock, Archive, AtSign, CheckCheck, Clock, CornerUpLeft, Inbox, Loader2, MailOpen, Mail, Paperclip, PenLine, PenSquare, RotateCcw, Search, SearchX, Send, Settings2, Trash2, X, type LucideIcon } from "lucide-react"

import type { MailFolder } from "@/lib/admin-mail/rules"
import { ALL_MAILBOXES } from "@/lib/admin-mail/rules"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmButton } from "@/components/app/confirm-button"
import { UserAvatar } from "@/components/app/user-avatar"
import { shortDate } from "./message-view"
import { SnoozeMenu } from "./thread-view"
import type { MailThread, ThreadPatch } from "./types"

export const FOLDERS: { id: MailFolder; label: string; icon: LucideIcon }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "sent", label: "Sent", icon: Send },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
]

const EMPTY: Record<MailFolder, { icon: LucideIcon; text: string }> = {
  inbox: { icon: CheckCheck, text: "Inbox zero. Nothing waiting." },
  snoozed: { icon: AlarmClock, text: "Nothing snoozed." },
  sent: { icon: Send, text: "Nothing sent yet." },
  archived: { icon: Archive, text: "Nothing archived." },
  trash: { icon: Trash2, text: "The trash is empty." },
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
      <div className="grid gap-2.5 border-b p-3">
        <div className="flex items-center gap-2">
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
          <Button variant="ghost" size="icon-sm" onClick={onSettings} aria-label="Signatures" title="Signatures">
            <Settings2 />
          </Button>
          <Button size="sm" onClick={onCompose} title="New e-mail (c)">
            <PenSquare /> Compose
          </Button>
        </div>
        <InputGroup className="h-8">
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
              <kbd className="text-muted-foreground bg-muted rounded px-1.5 font-mono text-[10px]">/</kbd>
            </InputGroupAddon>
          )}
        </InputGroup>
        {selecting ? (
          <div className="@container flex h-8 items-center gap-1">
            <Checkbox checked={allChecked ? true : "indeterminate"} onCheckedChange={() => onSelection(allChecked ? new Set() : new Set(threads.map((t) => t.id)))} aria-label="Select all" className="mx-1" />
            <span className="mr-auto min-w-0 truncate text-sm font-medium whitespace-nowrap tabular-nums" title={`${selection.size} selected`}>
              <span className="hidden @sm:inline">{selection.size} selected</span>
              <span className="@sm:hidden">{selection.size}</span>
            </span>
            {folder === "trash" ? (
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
            {loading ? "Searching…" : `${threads.length}${hasMore ? "+" : ""} ${threads.length === 1 ? "result" : "results"} in every folder but the trash`}
          </p>
        ) : (
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
                  <span className={cn(folder !== f.id && "sr-only @min-[440px]:not-sr-only")}>{f.label}</span>
                </span>
              ),
              count: f.id === "inbox" ? totalUnread : undefined,
            }))}
          />
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {threads.map((t) => {
          const checked = selection.has(t.id)
          const draft = drafts.has(t.id)
          return (
            <li key={t.id} className={cn("group relative border-b", t.id === selectedId && "bg-muted", checked && "bg-primary/[0.06]")}>
              {t.unread ? <span className="bg-primary absolute top-1/2 left-1 size-1.5 -translate-y-1/2 rounded-full" aria-label="Unread" /> : null}
              <div className="relative px-3 py-3 pl-4">
                <span className="absolute top-3.5 left-4 size-4">
                  <span className={cn("absolute inset-0 grid place-items-center opacity-0 transition-opacity", (selecting || checked) && "opacity-100", "group-hover:opacity-100")}>
                    <Checkbox checked={checked} onCheckedChange={() => toggle(t.id)} aria-label={`Select ${t.subject || "thread"}`} />
                  </span>
                </span>
                <button type="button" onClick={() => onOpen(t.id)} className="grid w-full min-w-0 grid-cols-1 gap-0.5 text-left">
                  <span className="flex min-w-0 items-center gap-2 pl-6">
                    <UserAvatar seed={t.contactEmail} size={16} />
                    <span className={cn("min-w-0 truncate text-sm", t.unread ? "font-semibold" : "font-medium")}>{t.contactName ?? t.contactEmail}</span>
                    {t.messageCount && t.messageCount > 1 ? <span className="text-muted-foreground bg-muted rounded-full px-1.5 text-[10px] leading-4 font-medium tabular-nums">{t.messageCount}</span> : null}
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {t.hasFiles ? <Paperclip className="text-muted-foreground size-3.5" aria-label="Has attachments" /> : null}
                      {folder === "snoozed" && t.snoozedUntil ? <AlarmClock className="size-3.5 text-amber-600 dark:text-amber-400" aria-label="Snoozed until" /> : null}
                      <time className={cn("text-xs", t.unread ? "text-foreground font-medium" : "text-muted-foreground")} dateTime={t.lastMessageAt} suppressHydrationWarning>
                        {mounted ? (folder === "snoozed" && t.snoozedUntil ? shortDate(t.snoozedUntil) : shortDate(t.lastMessageAt)) : null}
                      </time>
                    </span>
                  </span>
                  <span className={cn("flex min-w-0 items-center gap-1.5 text-[13px]", t.unread ? "text-foreground font-medium" : "text-foreground/80")}>
                    {draft ? (
                      <span className="text-destructive flex shrink-0 items-center gap-1 font-medium">
                        <PenLine className="size-3.5" /> Draft
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{t.subject || "(no subject)"}</span>
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    {all ? (
                      <span className="bg-muted flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px]">
                        <AtSign className="size-2.5" />
                        {t.mailbox.split("@")[0]}
                      </span>
                    ) : null}
                    {t.lastDirection === "out" ? <CornerUpLeft className="size-3.5 shrink-0" aria-label="You replied" /> : null}
                    <span className="min-w-0 truncate">{t.snippet || " "}</span>
                  </span>
                </button>
              </div>
            </li>
          )
        })}
        {threads.length ? null : (
          <li className="text-muted-foreground grid justify-items-center gap-3 p-10 text-center text-sm">
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <span className="bg-muted grid size-11 place-items-center rounded-full">
                  {React.createElement(query ? SearchX : EMPTY[folder].icon, { className: "size-5" })}
                </span>
                {query ? "Nothing matches that search." : EMPTY[folder].text}
              </>
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
