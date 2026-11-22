/**
 * Picking a place or files in the drive: "Move to…" (a folder) and the composer's "Attach from Drive" (files).
 * Browses Recent, My drive, Shared with me and Starred with the same API as the app; search looks everywhere.
 * Picks survive moving between folders and show in a tray; files the caller can't take are greyed out with the reason.
 */
import * as React from "react"
import { ChevronRight, Clock, HardDrive, Search, Star, Users, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api-client"
import { previewKind } from "@/lib/drive/access"
import { appLocale, msg, t } from "@/lib/i18n/panel"
import { formatBytes } from "@/lib/uploads"
import { cn } from "@/lib/utils"
import { contentUrl, fileIcon } from "./shared"
import type { DriveSummary } from "./types"

type Root = "recent" | "mine" | "shared" | "starred"
type Place = { root: Root; trail: { id: string; name: string }[] }

const ROOTS = { recent: { icon: Clock, label: msg("Recent") }, mine: { icon: HardDrive, label: msg("My drive") }, shared: { icon: Users, label: msg("Shared with me") }, starred: { icon: Star, label: msg("Starred") } } as const

export function DrivePicker({
  open,
  onOpenChange,
  mode,
  title,
  description,
  confirmLabel,
  exclude,
  blocked,
  max,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** folder: confirm the folder you're in (null = My drive); files: tick files and confirm. */
  mode: "folder" | "files"
  title: string
  description?: string
  confirmLabel: string
  /** Items that can't be a destination (the folders being moved). */
  exclude?: string[]
  /** files: why a file can't be picked (shown on its row), or null when it can. */
  blocked?: (file: DriveSummary) => string | null
  /** files: how many may be picked at most. */
  max?: number
  onPick: (picked: { folderId: string | null; files: DriveSummary[] }) => Promise<void> | void
}) {
  const roots: Root[] = mode === "files" ? ["recent", "mine", "shared", "starred"] : ["mine", "shared"]
  const [place, setPlace] = React.useState<Place>({ root: roots[0]!, trail: [] })
  const [query, setQuery] = React.useState("")
  const [q, setQ] = React.useState("")
  const [items, setItems] = React.useState<DriveSummary[] | null>(null)
  const [picked, setPicked] = React.useState<DriveSummary[]>([])
  const [busy, setBusy] = React.useState(false)
  const folderId = place.trail.at(-1)?.id ?? null
  const full = max !== undefined && picked.length >= max

  React.useEffect(() => {
    if (!open) return
    setPlace({ root: roots[0]!, trail: [] })
    setPicked([])
    setQuery("")
    setQ("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  React.useEffect(() => {
    const id = setTimeout(() => setQ(query.trim()), 250)
    return () => clearTimeout(id)
  }, [query])

  React.useEffect(() => {
    if (!open) return
    let live = true
    setItems(null)
    const url = q ? `/api/app/drive/items?q=${encodeURIComponent(q)}` : folderId ? `/api/app/drive/items?folder=${folderId}` : `/api/app/drive/items?view=${place.root}`
    api<{ items: DriveSummary[] }>("GET", url)
      .then((r) => live && setItems(r.items.filter((i) => !exclude?.includes(i.id) && (mode === "files" || i.kind === "folder"))))
      .catch((e) => live && (setItems([]), toast.error((e as Error).message)))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, folderId, place.root, exclude?.join(), mode])

  const go = (next: Place) => {
    setQuery("")
    setQ("")
    setPlace(next)
  }
  const toggle = (i: DriveSummary) => setPicked((list) => (list.some((p) => p.id === i.id) ? list.filter((p) => p.id !== i.id) : full ? list : [...list, i]))

  // "Shared with me" itself can't take a move; any folder you can open can (the server checks edit rights).
  const canDropHere = mode === "files" || place.root === "mine" || !!folderId
  async function confirm(files = picked) {
    setBusy(true)
    try {
      await onPick({ folderId, files })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const date = (iso: string) => new Date(iso).toLocaleDateString(appLocale(), { month: "short", day: "numeric", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
  const rootLabel = t(ROOTS[place.root].label)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={mode === "files" ? "sm:max-w-2xl" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-1">
            {roots.map((root) => {
              const R = ROOTS[root]
              return (
                <Button key={root} size="sm" variant={place.root === root && !place.trail.length && !q ? "secondary" : "ghost"} onClick={() => go({ root, trail: [] })}>
                  <R.icon />
                  {t(R.label)}
                </Button>
              )
            })}
            {mode === "files" ? (
              <div className="relative ml-auto w-full sm:w-52">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search drive")} aria-label={t("Search drive")} className="h-8 pl-8 text-sm" />
              </div>
            ) : null}
          </div>
          {q ? (
            <p className="text-muted-foreground text-xs">{t("Results for \"{q}\" in your whole drive", { q })}</p>
          ) : place.trail.length ? (
            <nav aria-label={t("Folders")} className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
              <button type="button" className="hover:text-foreground" onClick={() => go({ ...place, trail: [] })}>
                {rootLabel}
              </button>
              {place.trail.map((c, i) => (
                <React.Fragment key={c.id}>
                  <ChevronRight className="size-3" />
                  <button type="button" className="hover:text-foreground max-w-40 truncate" onClick={() => go({ ...place, trail: place.trail.slice(0, i + 1) })}>
                    {c.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          ) : null}
          <ul className="h-80 overflow-y-auto rounded-md border p-1">
            {items === null ? <li className="text-muted-foreground p-3 text-sm">{t("Loading…")}</li> : null}
            {items?.length === 0 ? <li className="text-muted-foreground p-3 text-sm">{q ? t("No matches.") : mode === "folder" ? t("No folders here.") : t("Nothing here yet.")}</li> : null}
            {items?.map((i) => {
              const folder = i.kind === "folder"
              const on = picked.some((p) => p.id === i.id)
              const why = folder ? null : (blocked?.(i) ?? null)
              const off = !folder && !on && (!!why || full)
              const Icon = fileIcon(i)
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    aria-pressed={folder ? undefined : on}
                    aria-disabled={off || undefined}
                    title={why ?? undefined}
                    className={cn("hover:bg-accent flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm", on && "bg-primary/10", off && "opacity-50 hover:bg-transparent")}
                    onClick={() => (folder ? go({ root: place.root, trail: q ? [{ id: i.id, name: i.name }] : [...place.trail, { id: i.id, name: i.name }] }) : !off && toggle(i))}
                    onDoubleClick={() => {
                      // Its two clicks already toggled the row twice: take the picks plus this file, if they fit.
                      const files = [...picked.filter((p) => p.id !== i.id), i]
                      if (!folder && !why && !busy && files.length <= (max ?? Infinity)) void confirm(files)
                    }}
                  >
                    {folder ? null : <Checkbox checked={on} disabled={off} tabIndex={-1} aria-hidden className="pointer-events-none" />}
                    <span className="bg-muted/60 grid size-8 shrink-0 place-items-center overflow-hidden rounded">
                      {!folder && previewKind(i.mediaType) === "image" ? (
                        // shortcut: full-size images as thumbnails, like the grid; resize them if bandwidth matters.
                        <img src={contentUrl(i.id)} alt="" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <Icon className={cn("size-4", folder ? "text-foreground/60" : "text-muted-foreground")} />
                      )}
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate">{i.name}</span>
                      <span className="text-muted-foreground truncate text-xs">{why ?? [i.ownerName, date(i.updatedAt)].filter(Boolean).join(" · ")}</span>
                    </span>
                    {folder ? <ChevronRight className="text-muted-foreground size-4" /> : <span className="text-muted-foreground text-xs tabular-nums">{formatBytes(i.size)}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {mode === "files" && picked.length ? (
            <div className="flex flex-wrap items-center gap-1.5" aria-label={t("Picked files")}>
              {picked.map((p) => {
                const Icon = fileIcon(p)
                return (
                  <span key={p.id} className="bg-muted inline-flex max-w-56 items-center gap-1.5 rounded-md py-0.5 pr-0.5 pl-2 text-xs">
                    <Icon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="truncate">{p.name}</span>
                    <button type="button" className="hover:bg-background rounded p-0.5" aria-label={t("Remove {name}", { name: p.name })} onClick={() => toggle(p)}>
                      <X className="size-3" />
                    </button>
                  </span>
                )
              })}
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {formatBytes(picked.reduce((n, p) => n + p.size, 0))}
                {max !== undefined ? ` · ${picked.length}/${max}` : null}
              </span>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => confirm()} disabled={busy || !canDropHere || (mode === "files" && !picked.length)}>
            {mode === "files" && picked.length ? `${confirmLabel} (${picked.length})` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
