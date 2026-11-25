import * as React from "react"
import { AlarmClock, Archive, Sparkles, AtSign, CalendarClock, CheckCheck, Clock, CornerUpLeft, FilePen, Inbox, Loader2, Mail, Menu, MailOpen, Paperclip, PenLine, PenSquare, RotateCcw, Search, SearchX, Send, ShieldAlert, ShieldCheck, Star, StarOff, Trash2, X, type LucideIcon } from "lucide-react"

import type { MailView as MailFolder } from "./types"
import { ALL_MAILBOXES } from "@/lib/admin-mail/rules"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/app/empty-state"
import { UserAvatar } from "@/components/app/user-avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { ConfirmButton } from "@/components/app/confirm-button"
import { shortDate } from "./message-view"
import { SnoozeMenu } from "./thread-view"
import { Kbd, mailboxColor, tint } from "./mail-ui"
import { ActionMenu, ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import type { MailThread, ThreadPatch } from "./types"
import { t, tp } from "@/lib/i18n/panel"

export const FOLDERS: { id: MailFolder; label: string; icon: LucideIcon }[] = [
  { id: "inbox", get label() { return t("Inbox") }, icon: Inbox },
  { id: "starred", get label() { return t("Starred") }, icon: Star },
  { id: "snoozed", get label() { return t("Snoozed") }, icon: Clock },
  { id: "drafts", get label() { return t("Drafts") }, icon: FilePen },
  { id: "sent", get label() { return t("Sent") }, icon: Send },
  { id: "outbox", get label() { return t("Outbox") }, icon: CalendarClock },
  { id: "archived", get label() { return t("Archived") }, icon: Archive },
  { id: "spam", get label() { return t("Spam") }, icon: ShieldAlert },
  { id: "trash", get label() { return t("Trash") }, icon: Trash2 },
]

const EMPTY: Record<MailFolder, { icon: LucideIcon; text: string }> = {
  inbox: { icon: CheckCheck, get text() { return t("Inbox zero. Nothing waiting") } },
  starred: { icon: Star, get text() { return t("No starred threads") } },
  spam: { icon: ShieldAlert, get text() { return t("No spam. Nice") } },
  snoozed: { icon: AlarmClock, get text() { return t("Nothing snoozed") } },
  sent: { icon: Send, get text() { return t("Nothing sent yet") } },
  drafts: { icon: FilePen, get text() { return t("No drafts. Unsent mail and AI apps' drafts wait here") } },
  outbox: { icon: CalendarClock, get text() { return t("Nothing scheduled or sent recently") } },
  archived: { icon: Archive, get text() { return t("Nothing archived") } },
  trash: { icon: Trash2, get text() { return t("The trash is empty") } },
}

export function ThreadList({
  mailboxes,
  mailbox,
  unread,
  folder,
  query,
  onQuery,
  unreadOnly = false,
  onUnreadOnly,
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
  counts = {},
  bulkActions,
  rail = false,
  account,
  onMenu,
  actionsFor,
}: {
  mailboxes: string[]
  mailbox: string
  unread: Record<string, number>
  folder: MailFolder
  query: string
  onQuery: (q: string) => void
  /** The inbox's "Unread" filter. */
  unreadOnly?: boolean
  onUnreadOnly?: (on: boolean) => void
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
  /** Counts next to folders other than the inbox (drafts, scheduled sends). */
  counts?: Partial<Record<MailFolder, number>>
  /** Replaces the thread actions of a selection (Drafts: discard; Outbox: cancel). */
  bulkActions?: React.ReactNode
  /** Folders and mailboxes live in the rail (desktop): the list shows only the folder's name and search. */
  rail?: boolean
  /** The account menu (mail-only view on a phone), next to Compose. */
  account?: React.ReactNode
  /** Phones: opens the folders menu. */
  onMenu?: () => void
  /** A thread's right-click menu and "…" (mailbox-app.tsx `threadActions`). */
  actionsFor?: (thread: MailThread) => MenuAction[]
}) {
  // Dates in the viewer's time zone: the server renders none, so nothing jumps after loading.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const folderLabel = FOLDERS.find((f) => f.id === folder)?.label ?? ""
  const all = mailbox === ALL_MAILBOXES
  const totalUnread = all ? Object.values(unread).reduce((a, b) => a + b, 0) : (unread[mailbox] ?? 0)
  const selecting = selection.size > 0
  const toggle = (id: string) => {
    const next = new Set(selection)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelection(next)
  }
  const allChecked = threads.length > 0 && threads.every((th) => selection.has(th.id))
  const allStarred = threads.some((th) => selection.has(th.id)) && threads.every((th) => !selection.has(th.id) || th.starred)
  // The inbox's "Unread" filter: a bare switch in the header row, so the search keeps the full width.
  const unreadSwitch =
    onUnreadOnly && folder === "inbox" && !query ? (
      <label className={cn("flex shrink-0 cursor-pointer items-center gap-1.5", unreadOnly ? "text-foreground" : "text-muted-foreground")} title={t("Unread only")}>
        <Mail className="size-3.5" aria-hidden />
        <Switch size="sm" checked={unreadOnly} onCheckedChange={onUnreadOnly} aria-label={t("Unread only")} />
      </label>
    ) : null

  const searchField = (
    <InputGroup className={cn("h-8 bg-foreground/[0.04] border-transparent shadow-none dark:bg-foreground/[0.06]", !rail && "h-9 min-w-0 flex-1 rounded-full")}>
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
        placeholder={rail ? t("Search mail") : t("Search in {folder}", { folder: folderLabel })}
        aria-label={t("Search mail")}
        // 16px on phones, or iOS Safari zooms the page in on focus.
        className="text-base md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" onClick={() => onQuery("")} aria-label={t("Clear search")}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      ) : rail ? (
        <InputGroupAddon align="inline-end">
          <Kbd>/</Kbd>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )

  return (
    <aside className="@container relative flex h-full min-h-0 flex-col">
      <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-2.5 p-3", !rail && "border-b")}>
        {rail ? null : (
          // Phones: folders and mailboxes live in the menu (FolderRail in a sheet), like Gmail's app.
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="-ml-1.5 shrink-0" onClick={onMenu} aria-label={t("Folders")} title={t("Folders")}>
              <Menu />
            </Button>
            {searchField}
            {account}
          </div>
        )}
        <div className="flex h-8 items-baseline gap-2 px-1">
          <h2 className="text-lg font-semibold tracking-tight">{query ? t("Search") : folderLabel}</h2>
          <span className="text-muted-foreground min-w-0 truncate text-[13px]">
            {folder === "inbox" && !query && totalUnread ? t("{n} unread", { n: totalUnread }) + " · " : ""}
            {all ? t("All mailboxes") : mailbox}
          </span>
          <span className="ml-auto flex items-center gap-2 self-center">
            {loading ? <Loader2 className="text-muted-foreground size-3.5 animate-spin" /> : null}
            {unreadSwitch}
          </span>
        </div>
        {rail ? searchField : null}
        {selecting ? (
          <div className="@container flex h-8 items-center gap-1">
            <Checkbox checked={allChecked ? true : "indeterminate"} onCheckedChange={() => onSelection(allChecked ? new Set() : new Set(threads.map((th) => th.id)))} aria-label={t("Select all")} className="mx-1" />
            <span className="mr-auto min-w-0 truncate text-sm font-medium whitespace-nowrap tabular-nums" title={t("{n} selected", { n: selection.size })}>
              <span className="hidden @sm:inline">{t("{n} selected", { n: selection.size })}</span>
              <span className="@sm:hidden">{selection.size}</span>
            </span>
            {bulkActions ? (
              bulkActions
            ) : folder === "trash" ? (
              <>
                <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ trashed: false, archived: false })} aria-label={t("Move to inbox")} title={t("Move to inbox")}>
                  <RotateCcw />
                </Button>
                <ConfirmButton title={t("Delete {n} forever?", { n: selection.size })} description={t("The threads and their files are removed. This can't be undone.")} confirmLabel={t("Delete forever")} onConfirm={onBulkDelete}>
                  <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={t("Delete forever")} title={t("Delete forever")}>
                    <Trash2 />
                  </Button>
                </ConfirmButton>
              </>
            ) : (
              <>
                {folder === "archived" || folder === "snoozed" ? (
                  <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ archived: false, snoozedUntil: null })} aria-label={t("Move to inbox")} title={t("Move to inbox")}>
                    <Inbox />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ archived: true })} aria-label={t("Archive")} title={t("Archive")}>
                    <Archive />
                  </Button>
                )}
                <SnoozeMenu onSnooze={(at) => onBulk({ snoozedUntil: at })}>
                  <Button variant="ghost" size="icon-sm" aria-label={t("Snooze")} title={t("Snooze")}>
                    <Clock />
                  </Button>
                </SnoozeMenu>
                <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ unread: false })} aria-label={t("Mark read")} title={t("Mark read")}>
                  <MailOpen />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ unread: true })} aria-label={t("Mark unread")} title={t("Mark unread")}>
                  <Mail />
                </Button>
                {allStarred ? (
                  <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ starred: false })} aria-label={t("Remove star")} title={t("Remove star")}>
                    <StarOff />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ starred: true })} aria-label={t("Star")} title={t("Star")}>
                    <Star />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ spam: folder !== "spam" })} aria-label={folder === "spam" ? t("Not spam") : t("Report spam")} title={folder === "spam" ? t("Not spam") : t("Report spam")}>
                  {folder === "spam" ? <ShieldCheck /> : <ShieldAlert />}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => onBulk({ trashed: true })} aria-label={t("Move to trash")} title={t("Move to trash")}>
                  <Trash2 />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => onSelection(new Set())} aria-label={t("Clear selection")} title={t("Clear selection")}>
              <X />
            </Button>
          </div>
        ) : query ? (
          <p className="text-muted-foreground flex h-8 items-center gap-1.5 text-xs">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {loading ? t("Searching…") : folder === "drafts" || folder === "outbox" ? tp(threads.length, { one: "{n}{plus} result", other: "{n}{plus} results" }, { plus: hasMore ? "+" : "" }) : tp(threads.length, { one: "{n}{plus} result in every folder but the trash", other: "{n}{plus} results in every folder but the trash" }, { plus: hasMore ? "+" : "" })}
          </p>
        ) : null}
      </div>
      <ul className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-1", !rail && "pb-24")}>
        {threads.map((th) => {
          const checked = selection.has(th.id)
          const draft = drafts.has(th.id)
          const color = mailboxColor(th.mailbox)
          return (
            <ThreadRowMenu key={th.id} rowId={th.id} actions={actionsFor ? () => actionsFor(th) : undefined}>
              {/* Styled like a calendar event: the mailbox's colour as a bar, its tint when open. */}
              <div
                className={cn("relative rounded-md py-2 pr-2.5 pl-3.5 transition-colors", th.id !== selectedId && !checked && "hover:bg-foreground/[0.035] group-data-[menu-open]:bg-foreground/[0.035]")}
                style={th.id === selectedId || checked ? { background: tint(color, th.id === selectedId ? 13 : 8) } : undefined}
              >
                <span className="absolute top-1.5 bottom-1.5 left-1 w-[3px] rounded-full" style={{ background: color, opacity: th.unread || th.id === selectedId ? 1 : 0.3 }} aria-hidden />
                <span className="absolute top-[11px] left-3.5 grid size-3.5 place-items-center">
                  {th.unread ? <span className={cn("size-1.5 rounded-full", (selecting || checked) && "hidden", "group-hover:hidden")} style={{ background: color }} aria-label={t("Unread")} /> : null}
                  <Checkbox checked={checked} onCheckedChange={() => toggle(th.id)} aria-label={t("Select {name}", { name: th.subject || t("thread") })} className={cn("absolute inset-0 size-3.5", !(selecting || checked) && "opacity-0 group-hover:opacity-100")} />
                </span>
                <button type="button" onClick={() => onOpen(th.id)} className="grid w-full min-w-0 grid-cols-1 gap-0.5 text-left">
                  <span className="flex min-w-0 items-center gap-2 pl-5">
                    <UserAvatar seed={th.contactEmail} size={16} />
                    <span className={cn("min-w-0 truncate text-[13px]", th.unread ? "text-foreground font-semibold" : "text-foreground/80 font-medium")}>{th.contactName ?? th.contactEmail}</span>
                    {th.messageCount && th.messageCount > 1 ? <span className="text-muted-foreground text-[11px] tabular-nums">{th.messageCount}</span> : null}
                    <span className={cn("ml-auto flex shrink-0 items-center gap-1.5", actionsFor && "group-hover:invisible group-data-[menu-open]:invisible")}>
                      {th.starred ? <Star className="size-3 fill-amber-400 text-amber-500" aria-label={t("Starred")} /> : null}
                      {th.hasFiles ? <Paperclip className="text-muted-foreground size-3" aria-label={t("Has attachments")} /> : null}
                      {folder === "snoozed" && th.snoozedUntil ? <AlarmClock className="size-3 text-amber-600 dark:text-amber-400" aria-label={t("Snoozed until")} /> : null}
                      <time className={cn("text-[11px] tabular-nums", th.unread ? "text-foreground font-medium" : "text-muted-foreground")} dateTime={th.lastMessageAt} suppressHydrationWarning>
                        {mounted ? (folder === "snoozed" && th.snoozedUntil ? shortDate(th.snoozedUntil) : shortDate(th.lastMessageAt)) : null}
                      </time>
                    </span>
                  </span>
                  <span className={cn("flex min-w-0 items-center gap-1.5 text-[13px]", th.unread ? "text-foreground" : "text-foreground/70")}>
                    {draft ? (
                      <span className="text-destructive flex shrink-0 items-center gap-1 font-medium">
                        <PenLine className="size-3" /> {t("Draft")}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{th.subject || t("(no subject)")}</span>
                    {th.labels?.map(label=>label.id==="ai"
                      ? <Sparkles key={label.id} className="text-muted-foreground size-3.5 shrink-0" role="img" aria-label={label.name}><title>{label.name}</title></Sparkles>
                      : <Badge key={label.id} variant="secondary">{label.name}</Badge>)}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    {all && !rail ? (
                      <span className="flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px]" style={{ background: tint(color, 14) }}>
                        <AtSign className="size-2.5" />
                        {th.mailbox.split("@")[0]}
                      </span>
                    ) : null}
                    {th.lastDirection === "out" ? <CornerUpLeft className="size-3 shrink-0" aria-label={t("You replied")} /> : null}
                    <span className="min-w-0 truncate">{th.snippet || " "}</span>
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
              <EmptyState variant="plain" density="compact" className="py-10 md:py-14" icon={React.createElement(query ? SearchX : EMPTY[folder].icon)} title={query ? t("Nothing matches that search") : unreadOnly && folder === "inbox" ? t("No unread threads") : EMPTY[folder].text} />
            )}
          </li>
        )}
        {hasMore ? (
          <li className="p-3 text-center">
            <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loading}>
              {t("Load more")}
            </Button>
          </li>
        ) : null}
      </ul>
      {rail ? null : (
        <Button size="icon" className="absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] size-14 rounded-2xl shadow-lg" onClick={onCompose} aria-label={t("Compose")} title={t("New e-mail (c)")}>
          <PenSquare className="size-5" />
        </Button>
      )}
    </aside>
  )
}

/** A thread row with its right-click menu and the "…" that replaces the date on hover. */
function ThreadRowMenu({ actions, rowId, children }: { actions?: () => MenuAction[]; rowId: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <ActionMenu actions={actions} onOpenChange={setOpen}>
      <li className="group relative mx-2 my-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200" data-row={rowId} data-menu-open={open || undefined}>
        {children}
        {actions ? (
          <span className="absolute top-1.5 right-1.5 hidden group-hover:flex group-data-[menu-open]:flex">
            <ActionMenuButton actions={actions} label={t("Thread actions")} onOpenChange={setOpen} />
          </span>
        ) : null}
      </li>
    </ActionMenu>
  )
}
