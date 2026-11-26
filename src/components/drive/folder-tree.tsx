/**
 * The drive's rail: Upload and New folder, My drive and Shared with me as folder trees (children load when opened, and
 * the tree opens down to the folder on screen), Starred, Recent, Trash and the storage used. Tree nodes take drops:
 * drive items move there, files from the computer upload there.
 */
import * as React from "react"
import { ChevronDown, ChevronRight, Clock, Folder, FolderOpen, FolderPlus, FolderUp, HardDrive, Plus, Star, Trash2, Upload, Users } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/workspace/ui"
import { Rail, RailItem, RailList } from "@/components/workspace/rail"
import { api } from "@/lib/api-client"
import { msg, t } from "@/lib/i18n/panel"
import { formatBytes } from "@/lib/uploads"
import { cn } from "@/lib/utils"
import { draggedIds, isDriveDrag, isFileDrag } from "./shared"
import type { DriveSummary, DriveUsage, DriveView } from "./types"

export type DriveLocation = { view: DriveView; folder?: undefined } | { folder: string; view?: undefined }

/** Where a drop goes: a folder id, or null for the root of My drive. */
export interface DropHandlers {
  onDropItems: (ids: string[], folderId: string | null) => void
  onDropFiles: (data: DataTransfer, folderId: string | null) => void
}

/** Drop-target props for anything that stands for a folder (tree nodes, breadcrumbs, folder rows). */
export function useDropTarget(folderId: string | null, handlers: DropHandlers, enabled = true) {
  const [over, setOver] = React.useState(false)
  if (!enabled) return { over: false, props: {} }
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!isDriveDrag(e) && !isFileDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = isDriveDrag(e) ? "move" : "copy"
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false)
        if (!isDriveDrag(e) && !isFileDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        if (isDriveDrag(e)) {
          const ids = draggedIds(e).filter((id) => id !== folderId)
          if (ids.length) handlers.onDropItems(ids, folderId)
        } else handlers.onDropFiles(e.dataTransfer, folderId)
      },
    },
  }
}

const VIEWS: { value: DriveView; label: string; icon: typeof Star }[] = [
  { value: "starred", label: msg("Starred"), icon: Star },
  { value: "recent", label: msg("Recent"), icon: Clock },
  { value: "trash", label: msg("Trash"), icon: Trash2 },
]

export function FolderTree({
  location,
  openPath,
  refreshKey,
  usage,
  footer,
  onNavigate,
  onUploadFiles,
  onUploadFolder,
  onNewFolder,
  drop,
}: {
  location: DriveLocation
  /** The open folder's root ("mine"/"shared") and the folders above it, so the tree opens down to it. */
  openPath: { root: "mine" | "shared"; ids: string[] } | null
  /** Bumped when folders change, so open nodes reload. */
  refreshKey: number
  usage: DriveUsage
  footer?: React.ReactNode
  onNavigate: (loc: DriveLocation) => void
  onUploadFiles: () => void
  onUploadFolder: () => void
  onNewFolder: () => void
  drop: DropHandlers
}) {
  const [children, setChildren] = React.useState<Map<string, DriveSummary[]>>(() => new Map())
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(["mine"]))

  const load = React.useCallback(async (key: string) => {
    const url = key === "mine" || key === "shared" ? `/api/app/drive/items?view=${key}` : `/api/app/drive/items?folder=${key}`
    try {
      const { items } = await api<{ items: DriveSummary[] }>("GET", url)
      setChildren((m) => new Map(m).set(key, items.filter((i) => i.kind === "folder")))
    } catch {
      setChildren((m) => new Map(m).set(key, []))
    }
  }, [])

  // Open the tree down to the folder on screen.
  React.useEffect(() => {
    if (!openPath) return
    setExpanded((s) => new Set([...s, openPath.root, ...openPath.ids]))
  }, [openPath])

  // Load what's open and not loaded yet; reload everything open after a change.
  const loadedFor = React.useRef(-1)
  React.useEffect(() => {
    const reload = loadedFor.current !== refreshKey
    loadedFor.current = refreshKey
    for (const key of expanded) if (reload || !children.has(key)) void load(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, refreshKey, load])

  const toggle = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const usageBar = (
    <div className="grid gap-1 px-2 pb-2 text-xs">
      <div className="text-muted-foreground flex justify-between">
        <span>{t("Storage")}</span>
        <span className="tabular-nums">{usage.quota ? `${formatBytes(usage.used)} / ${formatBytes(usage.quota)}` : formatBytes(usage.used)}</span>
      </div>
      {usage.quota ? (
        <div className="bg-muted h-1.5 overflow-hidden rounded-full" role="progressbar" aria-label={t("Storage used")} aria-valuenow={Math.round((usage.used / usage.quota) * 100)}>
          <div className={cn("h-full rounded-full", usage.used / usage.quota > 0.9 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, (usage.used / usage.quota) * 100)}%` }} />
        </div>
      ) : null}
    </div>
  )

  return (
    <Rail
      label={t("Drive")}
      footer={
        <>
          {usageBar}
          {footer}
        </>
      }
    >
      {/* One "New" action, like "New e-mail" and "New note" in the other apps; its menu lists the keys. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="bg-background hover:bg-foreground/[0.03] focus-visible:ring-ring/50 flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)] outline-none focus-visible:ring-[3px]"
          >
            <Plus className="text-muted-foreground size-4" />
            {t("New")}
            <ChevronDown className="text-muted-foreground ml-auto size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onSelect={onNewFolder}>
            <FolderPlus /> {t("New folder")}
            <Kbd className="ml-auto">C</Kbd>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onUploadFiles}>
            <Upload /> {t("Upload files")}
            <Kbd className="ml-auto">U</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onUploadFolder}>
            <FolderUp /> {t("Upload folder")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ul className="grid gap-px" role="tree" aria-label={t("Folders")}>
        {(["mine", "shared"] as const).map((root) => (
          <TreeNode
            key={root}
            id={root}
            label={root === "mine" ? t("My drive") : t("Shared with me")}
            icon={root === "mine" ? HardDrive : Users}
            depth={0}
            active={location.view === root}
            dropTo={root === "mine" ? null : undefined}
            location={location}
            expanded={expanded}
            childrenOf={children}
            onToggle={toggle}
            onNavigate={onNavigate}
            drop={drop}
          />
        ))}
      </ul>
      <RailList>
        {VIEWS.map(({ value, label, icon }) => (
          <RailItem key={value} icon={icon} label={t(label)} active={location.view === value} onClick={() => onNavigate({ view: value })} />
        ))}
      </RailList>
    </Rail>
  )
}

function TreeNode({
  id,
  label,
  icon: Icon,
  depth,
  active,
  dropTo,
  location,
  expanded,
  childrenOf,
  onToggle,
  onNavigate,
  drop,
}: {
  /** "mine", "shared" or a folder id. */
  id: string
  label: string
  icon?: typeof Folder
  depth: number
  active: boolean
  /** The folder a drop lands in (null = My drive's root); undefined = not a drop target. */
  dropTo: string | null | undefined
  location: DriveLocation
  expanded: Set<string>
  childrenOf: Map<string, DriveSummary[]>
  onToggle: (key: string) => void
  onNavigate: (loc: DriveLocation) => void
  drop: DropHandlers
}) {
  const open = expanded.has(id)
  const kids = childrenOf.get(id)
  const target = useDropTarget(dropTo ?? null, drop, dropTo !== undefined)
  const NodeIcon = Icon ?? (open ? FolderOpen : Folder)
  // Folders without subfolders (once loaded) don't need a chevron.
  const leaf = kids !== undefined && kids.length === 0
  return (
    <li role="treeitem" aria-expanded={leaf ? undefined : open} aria-selected={active}>
      <div
        {...target.props}
        className={cn(
          "group/node flex h-7 items-center rounded-md pr-1 text-[13px]",
          active ? "bg-foreground/[0.06] text-foreground font-medium" : "text-foreground/70 hover:bg-foreground/[0.035] hover:text-foreground",
          target.over && "bg-primary/10 ring-primary/40 ring-1",
        )}
      >
        {/* Same padding and gap as RailItem, so icons line up with Starred, Recent and Trash; subfolders step in. */}
        <button
          type="button"
          onClick={() => onNavigate(id === "mine" || id === "shared" ? { view: id } : { folder: id })}
          className="focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px]"
          style={{ paddingLeft: 8 + depth * 14 }}
          title={label}
        >
          <NodeIcon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
          <span className="truncate">{label}</span>
        </button>
        {leaf ? null : (
          <button
            type="button"
            aria-label={open ? t("Collapse") : t("Expand")}
            onClick={() => onToggle(id)}
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] grid size-5 shrink-0 place-items-center rounded-sm"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        )}
      </div>
      {open && kids?.length ? (
        <ul role="group" className="grid gap-px">
          {kids.map((k) => (
            <TreeNode
              key={k.id}
              id={k.id}
              label={k.name}
              depth={depth + 1}
              active={location.folder === k.id}
              dropTo={k.role !== "view" ? k.id : undefined}
              location={location}
              expanded={expanded}
              childrenOf={childrenOf}
              onToggle={onToggle}
              onNavigate={onNavigate}
              drop={drop}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
