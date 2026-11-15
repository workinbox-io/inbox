import * as React from "react"
import { ChevronRight, Copy, Plus, Settings2 } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { ActionMenu, ActionMenuButton, cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import { RailAction, RailNav } from "@/components/workspace/rail"

import { ALL_MAILBOXES } from "@/lib/admin-mail/rules"
import type { MailView as MailFolder } from "./types"
import { cn } from "@/lib/utils"
import { FOLDERS } from "./thread-list"
import { FOLDER_KEYS, Kbd, mailboxColor } from "./mail-ui"
import { draftRows } from "./drafts-panel"
import { useDraftKeys } from "./drafts"
import { scheduledCount, type OutboxRow } from "./outbox-panel"

const COLLAPSED_KEY = "mail-rail-collapsed"

/** The left column like Outlook / Apple Mail: compose, "All mailboxes" folders, then each mailbox as a group with its own folders. */
export function FolderRail({
  mailboxes,
  mailbox,
  folder,
  onOpen,
  unread,
  onCompose,
  onSettings,
  outboxJobs,
  footer,
}: {
  mailboxes: string[]
  /** A mailbox address or ALL_MAILBOXES. */
  mailbox: string
  folder: MailFolder
  /** A folder of one mailbox (or of all of them). */
  onOpen: (mailbox: string, folder: MailFolder) => void
  unread: Record<string, number>
  onCompose: () => void
  onSettings: (mailbox?: string) => void
  /** Send jobs, counted per mailbox next to "Outbox". */
  outboxJobs: OutboxRow[]
  /** The mail-only view's account menu; the dashboard has its own in the sidebar. */
  footer?: React.ReactNode
}) {
  const multiple = mailboxes.length > 1
  const draftKeys = useDraftKeys()
  const [collapsed, setCollapsed] = React.useState<string[]>([])
  React.useEffect(() => {
    try {
      setCollapsed(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]"))
    } catch {}
  }, [])
  const toggle = (m: string) =>
    setCollapsed((c) => {
      const next = c.includes(m) ? c.filter((x) => x !== m) : [...c, m]
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
      } catch {}
      return next
    })

  const folders = (scope: string, boxes: string[]) => {
    const counts: Partial<Record<MailFolder, number>> = {
      inbox: boxes.reduce((a, m) => a + (unread[m] ?? 0), 0),
      drafts: draftRows(draftKeys, boxes, "").length,
      outbox: scheduledCount(outboxJobs.filter((j) => boxes.includes(j.mailbox ?? mailboxes[0] ?? ""))),
    }
    const inView = mailbox === scope
    return (
      <ul className="grid gap-px">
        {FOLDERS.map((f) => (
          <FolderRow
            key={f.id}
            folder={f}
            active={inView && folder === f.id}
            count={counts[f.id] ?? 0}
            shortcut={inView ? FOLDER_KEYS[f.id] : undefined}
            onClick={() => onOpen(scope, f.id)}
          />
        ))}
      </ul>
    )
  }

  return (
    <RailNav label="Mail">
      <RailAction icon={Plus} label="New e-mail" shortcut="C" onClick={onCompose} />

      {!multiple ? (
        mailboxes[0] ? folders(mailboxes[0], mailboxes) : null
      ) : (
        <>
          <div className="grid gap-1">
            <div className="text-muted-foreground group/h flex h-5 items-center justify-between px-2 text-xs font-medium">
              All mailboxes
              <span className="hidden items-center gap-0.5 group-hover/h:flex">
                <Kbd>G</Kbd>
                <Kbd>0</Kbd>
              </span>
            </div>
            {folders(ALL_MAILBOXES, mailboxes)}
          </div>
          <div className="grid gap-1">
            <div className="text-muted-foreground flex h-5 items-center justify-between px-2 text-xs font-medium">
              Mailboxes
              <button type="button" onClick={() => onSettings()} className="hover:text-foreground rounded p-0.5" aria-label="Settings" title="Settings">
                <Settings2 className="size-3.5" />
              </button>
            </div>
            {mailboxes.map((m, i) => {
              const current = mailbox === m
              const open = !collapsed.includes(m)
              return (
                <div key={m} className="grid gap-px">
                  <MailboxHeader
                    label={m}
                    color={mailboxColor(m)}
                    open={open}
                    current={current}
                    shortcut={i < 9 ? String(i + 1) : undefined}
                    count={open ? 0 : (unread[m] ?? 0)}
                    onToggle={() => toggle(m)}
                    onClick={() => onOpen(m, "inbox")}
                    actions={() =>
                      cleanActions([
                        {
                          label: "Copy address",
                          icon: Copy,
                          onSelect: async () => {
                            await navigator.clipboard.writeText(m)
                            toast.success("Address copied")
                          },
                        },
                        { label: "Mailbox settings", icon: Settings2, onSelect: () => onSettings(m) },
                      ])
                    }
                  />
                  {open ? <div className="pl-4">{folders(m, [m])}</div> : null}
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="mt-auto grid gap-2">
        <p className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs">
          <Kbd>?</Kbd> Keyboard shortcuts
        </p>
        {footer ? <div className="-mx-1 border-t pt-2">{footer}</div> : null}
      </div>
    </RailNav>
  )
}

function FolderRow({
  folder: f,
  active,
  count,
  shortcut,
  onClick,
}: {
  folder: (typeof FOLDERS)[number]
  active: boolean
  count: number
  shortcut?: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/f focus-visible:ring-ring/50 flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-[13px] outline-none focus-visible:ring-[3px]",
          active ? "bg-foreground/[0.06] text-foreground font-medium" : "text-foreground/70 hover:bg-foreground/[0.035] hover:text-foreground",
        )}
      >
        <f.icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
        <span className="flex-1 text-left">{f.label}</span>
        {count ? <span className={cn("text-xs tabular-nums", active ? "text-foreground font-semibold" : "text-foreground/60 font-medium")}>{count}</span> : null}
        {shortcut && !count ? (
          <span className="hidden items-center gap-0.5 group-hover/f:flex">
            <Kbd>G</Kbd>
            <Kbd>{shortcut.toUpperCase()}</Kbd>
          </span>
        ) : null}
      </button>
    </li>
  )
}

function MailboxHeader({
  label,
  color,
  open,
  current,
  shortcut,
  count,
  onToggle,
  onClick,
  actions,
}: {
  label: string
  color: string
  open: boolean
  current: boolean
  shortcut?: string
  count: number
  onToggle: () => void
  onClick: () => void
  actions?: () => MenuAction[]
}) {
  const [menu, setMenu] = React.useState(false)
  return (
    <ActionMenu actions={actions} onOpenChange={setMenu}>
      <div className="group/mb relative flex items-center" data-menu-open={menu || undefined}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          className="text-muted-foreground hover:text-foreground grid size-5 shrink-0 place-items-center rounded"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <button
          type="button"
          onClick={onClick}
          className="hover:bg-foreground/[0.035] group-data-[menu-open]/mb:bg-foreground/[0.035] focus-visible:ring-ring/50 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md pr-7 pl-1 text-[13px] outline-none focus-visible:ring-[3px]"
        >
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className={cn("min-w-0 flex-1 truncate text-left", current ? "text-foreground font-medium" : "text-foreground/80")} title={label}>
            {label.split("@")[0]}
            <span className="text-muted-foreground font-normal">@{label.split("@")[1]}</span>
          </span>
          {count ? <span className="text-foreground/60 text-xs font-medium tabular-nums">{count}</span> : null}
          {shortcut && !count ? (
            <span className="hidden items-center gap-0.5 group-hover/mb:flex">
              <Kbd>G</Kbd>
              <Kbd>{shortcut}</Kbd>
            </span>
          ) : null}
        </button>
        {actions ? (
          <span className="absolute top-1/2 right-1 hidden -translate-y-1/2 group-hover/mb:flex group-data-[menu-open]/mb:flex">
            <ActionMenuButton actions={actions} label={`${label}: more`} onOpenChange={setMenu} className="size-5" />
          </span>
        ) : null}
      </div>
    </ActionMenu>
  )
}
