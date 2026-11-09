/**
 * The left column of a workspace app (Mail's FolderRail is the original): a primary action, items with counts,
 * sections and the account menu at the bottom.
 */
import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Kbd } from "./ui"

export function Rail({ label, children, footer, hint }: { label: string; children: React.ReactNode; footer?: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <nav aria-label={label} className="flex h-full w-56 shrink-0 flex-col gap-6 overflow-y-auto border-r px-3 py-3">
      {children}
      <div className="mt-auto grid gap-2">
        {hint ? <p className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs">{hint}</p> : null}
        {footer ? <div className="-mx-1 border-t pt-2">{footer}</div> : null}
      </div>
    </nav>
  )
}

/** The outlined primary button at the top ("New e-mail", "New note"). */
export function RailAction({ icon: Icon, label, shortcut, onClick }: { icon: LucideIcon; label: string; shortcut?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-background hover:bg-foreground/[0.03] focus-visible:ring-ring/50 flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)] outline-none focus-visible:ring-[3px]"
    >
      <Icon className="text-muted-foreground size-4" />
      {label}
      {shortcut ? <Kbd className="ml-auto">{shortcut}</Kbd> : null}
    </button>
  )
}

export function RailList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("grid gap-px", className)}>{children}</ul>
}

export function RailItem({
  icon: Icon,
  label,
  active,
  count,
  onClick,
  trailing,
  title,
}: {
  icon: LucideIcon
  label: React.ReactNode
  active: boolean
  count?: number
  onClick: () => void
  /** Shown on hover when there is no count (a shortcut, a delete button…). */
  trailing?: React.ReactNode
  title?: string
}) {
  return (
    <li className="group/item relative">
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-current={active ? "page" : undefined}
        className={cn(
          "focus-visible:ring-ring/50 flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-[13px] outline-none focus-visible:ring-[3px]",
          active ? "bg-foreground/[0.06] text-foreground font-medium" : "text-foreground/70 hover:bg-foreground/[0.035] hover:text-foreground",
        )}
      >
        <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {count ? <span className={cn("text-xs tabular-nums", active ? "text-foreground font-semibold" : "text-foreground/60 font-medium")}>{count}</span> : null}
      </button>
      {trailing && !count ? <span className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 items-center gap-0.5 group-hover/item:flex">{trailing}</span> : null}
    </li>
  )
}

/** A titled group of items ("Mailboxes", "Folders") with an optional small action. */
export function RailSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="text-muted-foreground flex items-center justify-between px-2 text-xs font-medium">
        {title}
        {action}
      </div>
      {children}
    </div>
  )
}

/** The small icon button next to a section title. */
export function RailSectionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="hover:text-foreground rounded p-0.5 [&_svg]:size-3.5" aria-label={label} title={label}>
      {children}
    </button>
  )
}
