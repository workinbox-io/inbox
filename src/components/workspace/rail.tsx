/**
 * The left column of a workspace app (Mail's FolderRail is the original): a primary action, items with counts,
 * sections and the account menu at the bottom.
 */
import * as React from "react"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { ActionMenu, ActionMenuButton, type MenuAction } from "./action-menu"
import { Kbd } from "./ui"

const RAIL_KEY = "workspace-rail-width"
const RAIL_MIN = 200
const RAIL_MAX = 420
const RAIL_DEFAULT = 256

/** The rails' width, dragged by their right edge and kept per browser for every app. */
function useRailWidth() {
  const [width, setWidth] = React.useState(RAIL_DEFAULT)
  React.useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(RAIL_KEY))
      if (!saved) return
      const w = Math.min(RAIL_MAX, Math.max(RAIL_MIN, saved))
      setWidth(w)
      document.documentElement.style.setProperty("--rail-w", `${w}px`)
    } catch {}
  }, [])
  const save = (w: number) => {
    setWidth(w)
    document.documentElement.style.setProperty("--rail-w", `${w}px`)
    try {
      localStorage.setItem(RAIL_KEY, String(w))
    } catch {}
  }
  return [width, save] as const
}

/**
 * Runs while the page is parsed, before the first paint (from BaseLayout's head: React never runs a <script> it
 * renders): the saved width goes into `--rail-w`, so a server-rendered rail opens at it instead of jumping.
 */
export const RAIL_WIDTH_SCRIPT = `try{var w=+localStorage.getItem(${JSON.stringify(RAIL_KEY)});if(w)document.documentElement.style.setProperty("--rail-w",Math.min(${RAIL_MAX},Math.max(${RAIL_MIN},w))+"px")}catch(e){}`

/** The rail's column: its width and the drag handle on the right edge (double-click resets). Mail's FolderRail uses it too. */
export function RailNav({ label, className, children, footer }: { label: string; className?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const [width, setWidth] = useRailWidth()
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const x = e.clientX
    const from = width
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => setWidth(Math.min(RAIL_MAX, Math.max(RAIL_MIN, from + ev.clientX - x)))
    const up = () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
  }
  return (
    // The width comes from the CSS variable (set before paint); state only drives the separator's value.
    <div data-slot="rail" className="relative flex h-full shrink-0 flex-col border-r" style={{ width: `var(--rail-w, ${RAIL_DEFAULT}px)` }}>
      <nav aria-label={label} className={cn("flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-3", className)}>
        {children}
      </nav>
      {/* Outside the scroll, so the account menu stays at the bottom however long the rail gets. */}
      {footer ? <div className="grid gap-2 px-3 pb-3">{footer}</div> : null}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("Resize")}
        aria-valuemin={RAIL_MIN}
        aria-valuemax={RAIL_MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={start}
        onDoubleClick={() => setWidth(RAIL_DEFAULT)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth(Math.max(RAIL_MIN, width - 16))
          if (e.key === "ArrowRight") setWidth(Math.min(RAIL_MAX, width + 16))
        }}
        className="hover:bg-primary/40 focus-visible:bg-primary/40 absolute inset-y-0 -right-[3px] z-10 w-1.5 cursor-col-resize outline-none transition-colors"
      />
    </div>
  )
}

export function Rail({ label, children, footer, hint }: { label: string; children: React.ReactNode; footer?: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <RailNav
      label={label}
      footer={hint || footer ? (
        <>
          {hint ? <p className="text-muted-foreground flex items-center gap-1.5 px-2 pt-2 text-xs">{hint}</p> : null}
          {footer ? <div className="-mx-1 border-t pt-2">{footer}</div> : null}
        </>
      ) : undefined}
    >
      {children}
    </RailNav>
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
  actions,
  leading,
}: {
  icon?: LucideIcon
  /** Instead of the icon (a mailbox's colour box). */
  leading?: React.ReactNode
  label: React.ReactNode
  active: boolean
  count?: number
  onClick: () => void
  /** Shown on hover when there is no count (a shortcut…). */
  trailing?: React.ReactNode
  title?: string
  /** Right-click menu and a "…" on hover. */
  actions?: MenuAction[] | (() => MenuAction[])
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  return (
    <ActionMenu actions={actions} onOpenChange={setMenuOpen}>
      <li className="group/item relative" data-menu-open={menuOpen || undefined}>
        <button
          type="button"
          onClick={onClick}
          title={title}
          aria-current={active ? "page" : undefined}
          className={cn(
            "focus-visible:ring-ring/50 flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-[13px] outline-none focus-visible:ring-[3px]",
            active ? "bg-foreground/[0.06] text-foreground font-medium" : "text-foreground/70 hover:bg-foreground/[0.035] hover:text-foreground group-data-[menu-open]/item:bg-foreground/[0.035]",
          )}
        >
          {leading ?? (Icon ? <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} /> : null)}
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {count ? (
            <span className={cn("text-xs tabular-nums", actions && "group-hover/item:invisible group-data-[menu-open]/item:invisible", active ? "text-foreground font-semibold" : "text-foreground/60 font-medium")}>{count}</span>
          ) : null}
        </button>
        {actions ? (
          <span className="absolute top-1/2 right-1 hidden -translate-y-1/2 group-focus-within/item:flex group-hover/item:flex group-data-[menu-open]/item:flex">
            <ActionMenuButton actions={actions} label={typeof label === "string" ? `${label}: more` : "More"} onOpenChange={setMenuOpen} className="size-5" />
          </span>
        ) : trailing && !count ? (
          <span className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 items-center gap-0.5 group-hover/item:flex">{trailing}</span>
        ) : null}
      </li>
    </ActionMenu>
  )
}

/**
 * A collapsible item with its own items below (Mail's mailboxes, Collections' collections): a chevron, a colour dot,
 * the name and a count; the children show indented while open.
 */
export function RailGroup({
  label,
  title,
  color,
  icon,
  open,
  current,
  count,
  onToggle,
  onClick,
  actions,
  children,
}: {
  label: React.ReactNode
  title: string
  color: string
  /** Drawn in place of the colour dot (a collection's own icon). */
  icon?: React.ReactNode
  open: boolean
  /** The group being viewed: its name in medium weight. */
  current: boolean
  count?: number
  onToggle: () => void
  onClick: () => void
  actions?: MenuAction[] | (() => MenuAction[])
  children?: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  return (
    <li className="grid gap-px">
      <ActionMenu actions={actions} onOpenChange={setMenuOpen}>
        <div className="group/g relative flex items-center" data-menu-open={menuOpen || undefined}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? t("Collapse {name}", { name: title }) : t("Expand {name}", { name: title })}
            className="text-muted-foreground hover:text-foreground grid size-5 shrink-0 place-items-center rounded"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
          <button
            type="button"
            onClick={onClick}
            title={title}
            className={cn(
              "hover:bg-foreground/[0.035] group-data-[menu-open]/g:bg-foreground/[0.035] focus-visible:ring-ring/50 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md pl-1 text-[13px] outline-none focus-visible:ring-[3px]",
              actions ? "pr-7" : "pr-2",
            )}
          >
            {icon ?? <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />}
            <span className={cn("min-w-0 flex-1 truncate text-left", current ? "text-foreground font-medium" : "text-foreground/80")}>{label}</span>
            {count ? <span className={cn("text-foreground/60 text-xs font-medium tabular-nums", actions && "group-hover/g:invisible group-data-[menu-open]/g:invisible")}>{count}</span> : null}
          </button>
          {actions ? (
            <span className="absolute top-1/2 right-1 hidden -translate-y-1/2 group-focus-within/g:flex group-hover/g:flex group-data-[menu-open]/g:flex">
              <ActionMenuButton actions={actions} label={t("{name}: more", { name: title })} onOpenChange={setMenuOpen} className="size-5" />
            </span>
          ) : null}
        </div>
      </ActionMenu>
      {open && children ? <ul className="grid gap-px pl-4">{children}</ul> : null}
    </li>
  )
}

/** A titled group of items ("Mailboxes", "Folders") with an optional small action. */
export function RailSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="text-muted-foreground flex h-5 items-center justify-between px-2 text-xs font-medium">
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
