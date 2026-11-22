/**
 * The list column of a workspace app (Mail's ThreadList is the original): a title with a subtitle, search, and rows
 * styled like calendar events (a colour bar, a tint when open).
 */
import * as React from "react"
import { Loader2, Search, X } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { ActionMenu, ActionMenuButton, type MenuAction } from "./action-menu"
import { Kbd, tint } from "./ui"

export function ListPane({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <aside aria-label={label} className="@container flex h-full min-h-0 flex-col">
      {children}
    </aside>
  )
}

/** Title, subtitle and (on phones, where there is no rail) actions; then whatever goes below (search). */
export function ListHeader({ title, subtitle, loading, actions, children }: { title: React.ReactNode; subtitle?: React.ReactNode; loading?: boolean; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 p-3">
      <div className="flex h-8 items-center gap-2 px-1">
        <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? <span className="text-muted-foreground truncate text-[13px]">{subtitle}</span> : null}
        {loading ? <Loader2 className="text-muted-foreground size-3.5 shrink-0 animate-spin" /> : null}
        {actions ? <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {children}
    </div>
  )
}

export const ListSearch = React.forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; placeholder: string }>(function ListSearch(
  { value, onChange, placeholder },
  ref,
) {
  return (
    <InputGroup className="bg-foreground/[0.04] dark:bg-foreground/[0.06] h-8 border-transparent shadow-none">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation()
            if (value) onChange("")
            else e.currentTarget.blur()
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      <InputGroupAddon align="inline-end">
        {value ? (
          <InputGroupButton size="icon-xs" onClick={() => onChange("")} aria-label={t("Clear search")}>
            <X />
          </InputGroupButton>
        ) : (
          <Kbd>/</Kbd>
        )}
      </InputGroupAddon>
    </InputGroup>
  )
})

export function ListBody({ children, dimmed }: { children: React.ReactNode; dimmed?: boolean }) {
  return <ul className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-1 transition-opacity", dimmed && "opacity-60")}>{children}</ul>
}

export function ListRow({
  color,
  selected,
  strong,
  title,
  meta,
  time,
  snippet,
  onClick,
  actions,
  menuLabel = "More",
  rowId,
}: {
  /** The bar on the left and the tint when open. */
  color: string
  selected: boolean
  /** Unread mail, a fresh change: bold title, full bar. */
  strong?: boolean
  title: React.ReactNode
  /** Small icons before the time (star, pin, attachment, sharing). */
  meta?: React.ReactNode
  time?: React.ReactNode
  snippet?: React.ReactNode
  onClick: () => void
  /** Right-click menu and the "…" shown on hover instead of the time. */
  actions?: MenuAction[] | (() => MenuAction[])
  menuLabel?: string
  /** Lets `foldAway` find the row when it leaves the list. */
  rowId?: string
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  return (
    <ActionMenu actions={actions} onOpenChange={setMenuOpen}>
      <li className="group relative mx-2 my-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200" data-row={rowId} data-menu-open={menuOpen || undefined}>
        <button
          type="button"
          onClick={onClick}
          aria-current={selected ? "true" : undefined}
          className={cn(
            "relative grid w-full min-w-0 grid-cols-1 gap-0.5 rounded-md py-2 pr-2.5 pl-3.5 text-left transition-colors",
            !selected && "hover:bg-foreground/[0.035] group-data-[menu-open]:bg-foreground/[0.035]",
          )}
          style={selected ? { background: tint(color, 13) } : undefined}
        >
          <span className="absolute top-1.5 bottom-1.5 left-1 w-[3px] rounded-full" style={{ background: color, opacity: strong || selected ? 1 : 0.3 }} aria-hidden />
          <span className="flex items-center gap-2">
            <span className={cn("min-w-0 truncate text-[13px]", strong ? "text-foreground font-semibold" : "text-foreground/80 font-medium")}>{title}</span>
            <span className={cn("ml-auto flex shrink-0 items-center gap-1.5", actions && "group-focus-within:invisible group-hover:invisible group-data-[menu-open]:invisible")}>
              {meta}
              {time !== undefined ? <span className="text-muted-foreground text-[11px] tabular-nums" suppressHydrationWarning>{time}</span> : null}
            </span>
          </span>
          {snippet !== undefined ? <span className="text-muted-foreground line-clamp-2 text-xs">{snippet}</span> : null}
        </button>
        {actions ? (
          <span className="absolute top-1.5 right-1.5 hidden group-focus-within:flex group-hover:flex group-data-[menu-open]:flex">
            <ActionMenuButton actions={actions} label={menuLabel} onOpenChange={setMenuOpen} />
          </span>
        ) : null}
      </li>
    </ActionMenu>
  )
}

export function ListEmpty({ icon, title, description, action }: { icon: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="list-none">
      <EmptyState variant="plain" density="compact" className="py-10 md:py-14" icon={icon} title={title} description={description} action={action} />
    </li>
  )
}
