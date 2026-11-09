import * as React from "react"
import { CalendarClock, Check, Copy, Eye, Layers, Plus, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { ActionMenu, ActionMenuButton, cleanActions, type MenuAction } from "@/components/workspace/action-menu"

import { ALL_MAILBOXES } from "@/lib/admin-mail/rules"
import type { UserMailFolder as MailFolder } from "@/lib/mail/rules"
import { cn } from "@/lib/utils"
import { FOLDERS } from "./thread-list"
import { FOLDER_KEYS, Kbd, mailboxColor } from "./mail-ui"

/** The left column: compose, folders with counts and shortcuts, and the mailboxes as coloured toggles. */
export function FolderRail({
  mailboxes,
  mailbox,
  onMailbox,
  folder,
  onFolder,
  unread,
  onCompose,
  onSettings,
  outbox,
  onOutbox,
  outboxCount,
  footer,
}: {
  mailboxes: string[]
  mailbox: string
  onMailbox: (m: string) => void
  folder: MailFolder
  onFolder: (f: MailFolder) => void
  unread: Record<string, number>
  onCompose: () => void
  onSettings: () => void
  /** The outbox (scheduled and recent sends) is open instead of a folder. */
  outbox: boolean
  onOutbox: () => void
  /** Scheduled sends, shown next to "Outbox". */
  outboxCount: number
  /** The mail-only view's account menu; the dashboard has its own in the sidebar. */
  footer?: React.ReactNode
}) {
  const all = mailbox === ALL_MAILBOXES
  const inboxUnread = all ? Object.values(unread).reduce((a, b) => a + b, 0) : (unread[mailbox] ?? 0)
  return (
    <nav aria-label="Mail" className="flex h-full w-56 shrink-0 flex-col gap-6 border-r px-3 py-3">
      <button
        type="button"
        onClick={onCompose}
        className="bg-background hover:bg-foreground/[0.03] focus-visible:ring-ring/50 flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)] outline-none focus-visible:ring-[3px]"
      >
        <Plus className="text-muted-foreground size-4" />
        New e-mail
        <Kbd className="ml-auto">C</Kbd>
      </button>

      <ul className="grid gap-px">
        {FOLDERS.map((f) => {
          const active = !outbox && folder === f.id
          const count = f.id === "inbox" ? inboxUnread : 0
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onFolder(f.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group/f focus-visible:ring-ring/50 flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-[13px] outline-none focus-visible:ring-[3px]",
                  active ? "bg-foreground/[0.06] text-foreground font-medium" : "text-foreground/70 hover:bg-foreground/[0.035] hover:text-foreground",
                )}
              >
                <f.icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
                <span className="flex-1 text-left">{f.label}</span>
                {count ? <span className={cn("text-xs tabular-nums", active ? "text-foreground font-semibold" : "text-foreground/60 font-medium")}>{count}</span> : null}
                {FOLDER_KEYS[f.id] && !count ? (
                  <span className="hidden items-center gap-0.5 group-hover/f:flex">
                    <Kbd>G</Kbd>
                    <Kbd>{FOLDER_KEYS[f.id]!.toUpperCase()}</Kbd>
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={onOutbox}
        aria-current={outbox ? "page" : undefined}
        className={cn(
          "focus-visible:ring-ring/50 -mt-4 flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-[13px] outline-none focus-visible:ring-[3px]",
          outbox ? "bg-foreground/[0.06] text-foreground font-medium" : "text-foreground/70 hover:bg-foreground/[0.035] hover:text-foreground",
        )}
      >
        <CalendarClock className={cn("size-4 shrink-0", outbox ? "text-foreground" : "text-muted-foreground")} />
        <span className="flex-1 text-left">Outbox</span>
        {outboxCount ? <span className={cn("text-xs tabular-nums", outbox ? "text-foreground font-semibold" : "text-foreground/60 font-medium")} title={`${outboxCount} scheduled`}>{outboxCount}</span> : null}
      </button>

      {mailboxes.length ? (
        <div className="grid gap-1">
          <div className="text-muted-foreground flex items-center justify-between px-2 text-xs font-medium">
            Mailboxes
            <button type="button" onClick={onSettings} className="hover:text-foreground rounded p-0.5" aria-label="Settings" title="Settings">
              <Settings2 className="size-3.5" />
            </button>
          </div>
          <ul className="grid gap-px">
            {mailboxes.map((m) => (
              <MailboxRow
                key={m}
                label={m}
                color={mailboxColor(m)}
                // Like calendars: every mailbox is on in "All"; clicking one shows only it, clicking it again shows all.
                active={all || mailbox === m}
                onClick={() => onMailbox(mailbox === m && mailboxes.length > 1 ? ALL_MAILBOXES : m)}
                count={unread[m] ?? 0}
                actions={() =>
                  cleanActions([
                    mailbox !== m && { label: "Show only this mailbox", icon: Eye, onSelect: () => onMailbox(m) },
                    mailboxes.length > 1 && !all && { label: "Show all mailboxes", icon: Layers, onSelect: () => onMailbox(ALL_MAILBOXES) },
                    { separator: true },
                    {
                      label: "Copy address",
                      icon: Copy,
                      onSelect: async () => {
                        await navigator.clipboard.writeText(m)
                        toast.success("Address copied")
                      },
                    },
                    { label: "Mailbox settings", icon: Settings2, onSelect: onSettings },
                  ])
                }
              />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-auto grid gap-2">
        <p className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs">
          <Kbd>?</Kbd> Keyboard shortcuts
        </p>
        {footer ? <div className="-mx-1 border-t pt-2">{footer}</div> : null}
      </div>
    </nav>
  )
}

function MailboxRow({
  label,
  color,
  active,
  onClick,
  count,
  actions,
}: {
  label: string
  color: string
  active: boolean
  onClick: () => void
  count: number
  actions?: () => MenuAction[]
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <ActionMenu actions={actions} onOpenChange={setOpen}>
      <li className="group/mb relative" data-menu-open={open || undefined}>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className="hover:bg-foreground/[0.035] group-data-[menu-open]/mb:bg-foreground/[0.035] focus-visible:ring-ring/50 flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-[13px] outline-none focus-visible:ring-[3px]"
        >
          <span
            className="grid size-3.5 shrink-0 place-items-center rounded-[4px] border-[1.5px]"
            style={{ background: active ? color : "transparent", borderColor: color }}
          >
            {active ? <Check className="size-2.5 text-white" strokeWidth={3} /> : null}
          </span>
          <span className={cn("min-w-0 flex-1 truncate text-left", active ? "text-foreground" : "text-foreground/60")} title={label}>
            {label.split("@")[0]}
            <span className="text-muted-foreground">@{label.split("@")[1]}</span>
          </span>
          {count ? <span className="text-muted-foreground text-xs tabular-nums group-hover/mb:invisible group-data-[menu-open]/mb:invisible">{count}</span> : null}
        </button>
        {actions ? (
          <span className="absolute top-1/2 right-1 hidden -translate-y-1/2 group-hover/mb:flex group-data-[menu-open]/mb:flex">
            <ActionMenuButton actions={actions} label={`${label}: more`} onOpenChange={setOpen} className="size-5" />
          </span>
        ) : null}
      </li>
    </ActionMenu>
  )
}
