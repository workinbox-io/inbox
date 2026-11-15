/**
 * The explorer's two layouts over the same items and selection: a table with sortable columns and a grid of tiles
 * with thumbnails. Both: click / ⌘-click / Shift-click select (drive-app.tsx decides), double-click opens, right-click
 * or "…" for the menu (acting on the selection), drag to move, folders take drops.
 */
import * as React from "react"
import { ArrowDown, ArrowUp, Star } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ActionMenu, ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import { shortDate } from "@/components/mailbox/message-view"
import { tint, useMounted } from "@/components/workspace/ui"
import { previewKind } from "@/lib/drive/access"
import type { SortDir, SortKey } from "@/lib/drive/explorer"
import { t } from "@/lib/i18n/panel"
import { formatBytes } from "@/lib/uploads"
import { cn } from "@/lib/utils"
import { useDropTarget, type DropHandlers } from "./folder-tree"
import { contentUrl, DRAG_TYPE, fileIcon, SHARING } from "./shared"
import type { DriveSummary } from "./types"

export interface ItemViewProps {
  items: DriveSummary[]
  selection: Set<string>
  focusId: string | null
  onClick: (item: DriveSummary, e: React.MouseEvent) => void
  onToggle: (item: DriveSummary) => void
  onOpen: (item: DriveSummary) => void
  actions: (item: DriveSummary) => MenuAction[]
  drop: DropHandlers
  /** Trash: nothing moves or takes drops. */
  readOnly?: boolean
}

/** Drag the selection when the item is in it, else just the item. */
function dragStart(e: React.DragEvent, item: DriveSummary, selection: Set<string>, items: DriveSummary[]) {
  const ids = selection.has(item.id) ? items.filter((i) => selection.has(i.id) && i.manage).map((i) => i.id) : item.manage ? [item.id] : []
  if (!ids.length) return e.preventDefault()
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
  e.dataTransfer.effectAllowed = "move"
  // A small label instead of the browser's picture of the row.
  const ghost = document.createElement("div")
  ghost.textContent = ids.length > 1 ? t("{count} items", { count: ids.length }) : item.name
  ghost.className = "fixed -top-20 left-0 rounded-md border bg-background px-2.5 py-1 text-xs font-medium shadow-sm"
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, 12, 12)
  setTimeout(() => ghost.remove(), 0)
}

function Item({
  item,
  props,
  children,
  className,
  style,
}: {
  item: DriveSummary
  props: ItemViewProps
  children: (state: { selected: boolean; over: boolean; menuOpen: boolean; setMenuOpen: (o: boolean) => void }) => React.ReactNode
  className: (state: { selected: boolean; over: boolean; focused: boolean }) => string
  style?: (state: { selected: boolean }) => React.CSSProperties | undefined
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const selected = props.selection.has(item.id)
  const target = useDropTarget(item.id, props.drop, item.kind === "folder" && item.role !== "view" && !props.readOnly)
  return (
    <ActionMenu actions={() => props.actions(item)} onOpenChange={setMenuOpen}>
      <div
        role="option"
        aria-selected={selected}
        data-drive-id={item.id}
        data-row={item.id}
        data-menu-open={menuOpen || undefined}
        draggable={!props.readOnly && item.manage}
        onDragStart={(e) => dragStart(e, item, props.selection, props.items)}
        onClick={(e) => props.onClick(item, e)}
        onDoubleClick={() => props.onOpen(item)}
        {...target.props}
        className={cn(className({ selected, over: target.over, focused: props.focusId === item.id }), "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200")}
        style={style?.({ selected })}
      >
        {children({ selected, over: target.over, menuOpen, setMenuOpen })}
      </div>
    </ActionMenu>
  )
}

function Check({ item, props, selected, className }: { item: DriveSummary; props: ItemViewProps; selected: boolean; className?: string }) {
  return (
    <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} className={className}>
      <Checkbox checked={selected} onCheckedChange={() => props.onToggle(item)} aria-label={t("Select {name}", { name: item.name })} />
    </span>
  )
}

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: "name", label: "Name", className: "" },
  { key: "owner", label: "Owner", className: "hidden @2xl:flex" },
  { key: "updated", label: "Modified", className: "hidden @md:flex" },
  { key: "size", label: "Size", className: "hidden @lg:flex justify-end" },
]
const GRID = "grid grid-cols-[28px_minmax(0,1fr)_32px] @md:grid-cols-[28px_minmax(0,1fr)_110px_32px] @lg:grid-cols-[28px_minmax(0,1fr)_110px_80px_32px] @2xl:grid-cols-[28px_minmax(0,1fr)_150px_110px_80px_32px] items-center gap-x-3"

export function ItemTable(props: ItemViewProps & { sort: SortKey; dir: SortDir; onSort: (key: SortKey) => void; allChecked: boolean | "indeterminate"; onToggleAll: () => void }) {
  const mounted = useMounted()
  return (
    <div className="@container min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <div className={cn(GRID, "bg-background/95 text-muted-foreground sticky top-0 z-10 border-b px-3 py-1.5 text-xs font-medium backdrop-blur")}>
        <Checkbox checked={props.allChecked} onCheckedChange={props.onToggleAll} aria-label={t("Select all")} disabled={!props.items.length} />
        {COLUMNS.map((c) => (
          <button key={c.key} type="button" onClick={() => props.onSort(c.key)} className={cn("hover:text-foreground flex items-center gap-1", c.className, props.sort === c.key && "text-foreground")}>
            {t(c.label)}
            {props.sort === c.key ? props.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
          </button>
        ))}
        <span />
      </div>
      <div role="listbox" aria-multiselectable aria-label={t("Files")} className="grid gap-px p-1.5">
        {props.items.map((item) => {
          const Icon = fileIcon(item)
          const share = SHARING[item.sharing]
          return (
            <Item
              key={item.id}
              item={item}
              props={props}
              className={({ selected, over, focused }) =>
                cn(
                  GRID,
                  "group relative cursor-default rounded-md py-1.5 pr-1.5 pl-3 text-[13px] select-none",
                  !selected && "hover:bg-foreground/[0.035] data-[menu-open]:bg-foreground/[0.035]",
                  focused && "ring-ring/40 ring-1",
                  over && "bg-primary/10 ring-primary/50 ring-1",
                )
              }
              style={({ selected }) => (selected ? { background: tint(share.color, 13) } : undefined)}
            >
              {({ selected, setMenuOpen }) => (
                <>
                  <span className="absolute top-1.5 bottom-1.5 left-1 w-[3px] rounded-full" style={{ background: share.color, opacity: selected ? 1 : 0.3 }} aria-hidden />
                  <Check item={item} props={props} selected={selected} />
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className={cn("size-4 shrink-0", item.kind === "folder" ? "text-foreground/60" : "text-muted-foreground")} />
                    <span className="text-foreground/90 truncate font-medium">{item.name}</span>
                    {item.starred ? <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-label={t("Starred")} /> : null}
                    {item.sharing !== "private" ? <share.icon className="text-muted-foreground size-3 shrink-0" aria-label={t(share.label)} /> : null}
                  </span>
                  <span className="text-muted-foreground hidden truncate text-xs @2xl:block">{item.ownerName ?? t("The team")}</span>
                  <span className="text-muted-foreground hidden text-xs tabular-nums @md:block" suppressHydrationWarning>
                    {mounted ? shortDate(item.updatedAt) : null}
                  </span>
                  <span className="text-muted-foreground hidden text-right text-xs tabular-nums @lg:block">{item.kind === "file" ? formatBytes(item.size) : "—"}</span>
                  <span className="flex justify-end opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-data-[menu-open]:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <ActionMenuButton actions={() => props.actions(item)} label={t("File actions")} onOpenChange={setMenuOpen} />
                  </span>
                </>
              )}
            </Item>
          )
        })}
      </div>
    </div>
  )
}

export function ItemGrid(props: ItemViewProps) {
  return (
    <div role="listbox" aria-multiselectable aria-label={t("Files")} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200" data-drive-grid>
      {props.items.map((item) => {
        const Icon = fileIcon(item)
        const share = SHARING[item.sharing]
        const image = item.kind === "file" && previewKind(item.mediaType) === "image"
        return (
          <Item
            key={item.id}
            item={item}
            props={props}
            className={({ selected, over, focused }) =>
              cn(
                "group relative grid cursor-default gap-1.5 rounded-lg border p-1.5 text-[13px] select-none",
                selected ? "border-transparent" : "hover:bg-foreground/[0.035] data-[menu-open]:bg-foreground/[0.035]",
                focused && "ring-ring/40 ring-1",
                over && "bg-primary/10 ring-primary/50 ring-1",
              )
            }
            style={({ selected }) => (selected ? { background: tint(share.color, 13), boxShadow: `inset 0 0 0 1.5px ${share.color}` } : undefined)}
          >
            {({ selected, setMenuOpen }) => (
              <>
                <div className="bg-muted/60 relative grid aspect-[4/3] place-items-center overflow-hidden rounded-md">
                  {image ? (
                    // shortcut: full-size images as thumbnails; resize them (Cloudflare Images) if bandwidth matters.
                    <img src={contentUrl(item.id)} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
                  ) : (
                    <Icon className={cn("size-10", item.kind === "folder" ? "text-foreground/50" : "text-muted-foreground")} strokeWidth={1.5} />
                  )}
                  <Check item={item} props={props} selected={selected} className={cn("absolute top-2 left-2 flex [&_[data-state=unchecked]]:bg-background", !selected && "opacity-0 group-hover:opacity-100")} />
                  {item.starred ? <Star className="absolute top-2 right-2 size-3.5 fill-amber-400 text-amber-400" aria-label={t("Starred")} /> : null}
                </div>
                <div className="flex min-w-0 items-center gap-1.5 px-0.5">
                  <Icon className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="text-foreground/90 min-w-0 flex-1 truncate font-medium" title={item.name}>
                    {item.name}
                  </span>
                  {item.sharing !== "private" ? <share.icon className="text-muted-foreground size-3 shrink-0" aria-label={t(share.label)} /> : null}
                  <span className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-data-[menu-open]:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <ActionMenuButton actions={() => props.actions(item)} label={t("File actions")} onOpenChange={setMenuOpen} className="size-6" />
                  </span>
                </div>
              </>
            )}
          </Item>
        )
      })}
    </div>
  )
}
