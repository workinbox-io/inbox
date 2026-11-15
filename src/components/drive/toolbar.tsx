/**
 * Above the explorer: where you are (breadcrumbs that take drops), search, sort, list/grid and the details toggle.
 * With a selection it turns into the bulk bar, as in Mail: what applies to every selected item.
 */
import * as React from "react"
import { ArrowDownUp, ArchiveRestore, ChevronRight, Copy, Download, FolderInput, LayoutGrid, List, PanelRight, Share2, Star, StarOff, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/app/confirm-button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { ListSearch } from "@/components/workspace/list-pane"
import type { SortDir, SortKey } from "@/lib/drive/explorer"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { useDropTarget, type DropHandlers } from "./folder-tree"
import type { DrivePrefs } from "./shared"
import type { DriveSummary } from "./types"

export interface Crumb {
  /** null = My drive's root; "shared" = Shared with me (no drops). */
  id: string | null | "shared"
  name: string
}

function CrumbButton({ crumb, last, drop, onGo }: { crumb: Crumb; last: boolean; drop: DropHandlers; onGo: (c: Crumb) => void }) {
  const target = useDropTarget(crumb.id === "shared" ? null : crumb.id, drop, crumb.id !== "shared" && !last)
  return (
    <button
      type="button"
      onClick={() => onGo(crumb)}
      {...target.props}
      aria-current={last ? "page" : undefined}
      className={cn(
        "max-w-48 truncate rounded px-1 py-0.5",
        last ? "text-foreground text-base font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.035]",
        target.over && "bg-primary/10 ring-primary/50 ring-1",
      )}
    >
      {crumb.name}
    </button>
  )
}

const SORTS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "updated", label: "Modified" },
  { value: "size", label: "Size" },
  { value: "owner", label: "Owner" },
]

export function Toolbar({
  crumbs,
  title,
  query,
  onQuery,
  searchRef,
  prefs,
  onPrefs,
  onGo,
  drop,
  selected,
  trash,
  onClearSelection,
  bulk,
  extra,
}: {
  crumbs: Crumb[]
  /** For views without a path (Recent, Starred, Trash, search). */
  title: string
  query: string
  onQuery: (q: string) => void
  searchRef: React.Ref<HTMLInputElement>
  prefs: DrivePrefs
  onPrefs: (p: Partial<DrivePrefs>) => void
  onGo: (c: Crumb) => void
  drop: DropHandlers
  selected: DriveSummary[]
  trash: boolean
  onClearSelection: () => void
  bulk: {
    download: () => void
    move: () => void
    copy: () => void
    star: (on: boolean) => void
    share: () => void
    trash: () => void
    restore: () => void
    remove: () => void
  }
  /** Extra buttons on the right (phones: views and upload; trash: Empty trash). */
  extra?: React.ReactNode
}) {
  const manageAll = selected.length > 0 && selected.every((i) => i.manage)
  const allStarred = selected.length > 0 && selected.every((i) => i.starred)
  return (
    <div className="grid shrink-0 gap-2 border-b px-4 pt-3 pb-2">
      <div className="flex min-h-8 items-center gap-2">
        {selected.length ? (
          <div className="flex min-w-0 flex-1 items-center gap-1" role="toolbar" aria-label={t("Selection")}>
            <Button variant="ghost" size="icon-sm" onClick={onClearSelection} aria-label={t("Clear selection")} title={t("Clear selection")}>
              <X />
            </Button>
            <span className="mr-auto text-sm font-medium">{t("{count} selected", { count: selected.length })}</span>
            {trash ? (
              <>
                {manageAll ? (
                  <Button variant="ghost" size="sm" onClick={bulk.restore}>
                    <ArchiveRestore /> {t("Restore")}
                  </Button>
                ) : null}
                {manageAll ? (
                  <ConfirmButton title={t("Delete {count} items for good?", { count: selected.length })} description={t("Everything in the selected folders goes too. It can't be restored.")} confirmLabel={t("Delete")} onConfirm={bulk.remove}>
                    <Button variant="ghost" size="sm" className="text-destructive">
                      <Trash2 /> {t("Delete for good")}
                    </Button>
                  </ConfirmButton>
                ) : null}
              </>
            ) : (
              <>
                <Button variant="ghost" size="icon-sm" onClick={bulk.download} aria-label={t("Download")} title={t("Download")}>
                  <Download />
                </Button>
                {selected.length === 1 && selected[0]!.manage ? (
                  <Button variant="ghost" size="icon-sm" onClick={bulk.share} aria-label={t("Share")} title={t("Share")}>
                    <Share2 />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon-sm" onClick={() => bulk.star(!allStarred)} aria-label={allStarred ? t("Remove star") : t("Star")} title={allStarred ? t("Remove star") : t("Star")}>
                  {allStarred ? <StarOff /> : <Star />}
                </Button>
                {selected.length === 1 ? (
                  <Button variant="ghost" size="icon-sm" onClick={bulk.copy} aria-label={t("Make a copy")} title={t("Make a copy")}>
                    <Copy />
                  </Button>
                ) : null}
                {manageAll ? (
                  <Button variant="ghost" size="icon-sm" onClick={bulk.move} aria-label={t("Move to…")} title={t("Move to…")}>
                    <FolderInput />
                  </Button>
                ) : null}
                {manageAll ? (
                  <Button variant="ghost" size="icon-sm" onClick={bulk.trash} aria-label={t("Move to trash")} title={t("Move to trash")}>
                    <Trash2 />
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <nav aria-label={t("Folders")} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
            {crumbs.length
              ? crumbs.map((c, i) => (
                  <React.Fragment key={`${c.id}-${i}`}>
                    {i > 0 ? <ChevronRight className="text-muted-foreground size-3.5 shrink-0" /> : null}
                    <CrumbButton crumb={c} last={i === crumbs.length - 1} drop={drop} onGo={onGo} />
                  </React.Fragment>
                ))
              : <h1 className="truncate px-1 text-base font-semibold">{title}</h1>}
          </nav>
        )}
        {extra}
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ListSearch ref={searchRef} value={query} onChange={onQuery} placeholder={t("Search the drive")} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("Sort")} title={t("Sort")}>
              <ArrowDownUp />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>{t("Sort by")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={prefs.sort} onValueChange={(v) => onPrefs({ sort: v as SortKey })}>
              {SORTS.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>
                  {t(s.label)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={prefs.dir} onValueChange={(v) => onPrefs({ dir: v as SortDir })}>
              <DropdownMenuRadioItem value="asc">{t("Ascending")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">{t("Descending")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-muted-foreground text-xs">
              {t("Folders always come first")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SegmentedControl
          size="sm"
          aria-label={t("Layout")}
          value={prefs.layout}
          onValueChange={(v) => onPrefs({ layout: v })}
          options={[
            { value: "list", label: <List className="size-4" aria-label={t("List")} /> },
            { value: "grid", label: <LayoutGrid className="size-4" aria-label={t("Grid")} /> },
          ]}
        />
        <Button variant={prefs.details ? "secondary" : "ghost"} size="icon-sm" className="hidden lg:inline-flex" onClick={() => onPrefs({ details: !prefs.details })} aria-pressed={prefs.details} aria-label={t("Details")} title={`${t("Details")} (i)`}>
          <PanelRight />
        </Button>
      </div>
    </div>
  )
}
