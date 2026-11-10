/**
 * Picking a place or a file in the drive: "Move to…" (a folder) and the composer's "Attach from Drive" (files).
 * Browses My drive and Shared with me with the same API as the app.
 */
import * as React from "react"
import { ChevronRight, File, Folder, HardDrive, Users } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { formatBytes } from "@/lib/uploads"
import { cn } from "@/lib/utils"
import type { DriveSummary } from "./types"

type Place = { root: "mine" | "shared"; trail: { id: string; name: string }[] }

export function DrivePicker({
  open,
  onOpenChange,
  mode,
  title,
  description,
  confirmLabel,
  exclude,
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
  onPick: (picked: { folderId: string | null; files: DriveSummary[] }) => Promise<void> | void
}) {
  const [place, setPlace] = React.useState<Place>({ root: "mine", trail: [] })
  const [items, setItems] = React.useState<DriveSummary[] | null>(null)
  const [picked, setPicked] = React.useState<DriveSummary[]>([])
  const [busy, setBusy] = React.useState(false)
  const folderId = place.trail.at(-1)?.id ?? null

  React.useEffect(() => {
    if (!open) return
    setPlace({ root: "mine", trail: [] })
    setPicked([])
  }, [open])

  React.useEffect(() => {
    if (!open) return
    let live = true
    setItems(null)
    const url = folderId ? `/api/app/drive/items?folder=${folderId}` : `/api/app/drive/items?view=${place.root}`
    api<{ items: DriveSummary[] }>("GET", url)
      .then((r) => live && setItems(r.items.filter((i) => !exclude?.includes(i.id) && (mode === "files" || i.kind === "folder"))))
      .catch((e) => live && (setItems([]), toast.error((e as Error).message)))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folderId, place.root, exclude?.join(), mode])

  const here = place.trail.at(-1)
  // A folder you can't add to (view only), or "Shared with me" itself, can't take a move.
  const canDropHere = mode === "files" || (place.root === "mine" && !here) || !!here
  async function confirm() {
    setBusy(true)
    try {
      await onPick({ folderId, files: picked })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="flex gap-1">
            {(["mine", "shared"] as const).map((root) => (
              <Button key={root} size="sm" variant={place.root === root && !place.trail.length ? "secondary" : "ghost"} onClick={() => setPlace({ root, trail: [] })}>
                {root === "mine" ? <HardDrive /> : <Users />}
                {root === "mine" ? t("My drive") : t("Shared with me")}
              </Button>
            ))}
          </div>
          {place.trail.length ? (
            <nav aria-label={t("Folders")} className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
              <button type="button" className="hover:text-foreground" onClick={() => setPlace({ ...place, trail: [] })}>
                {place.root === "mine" ? t("My drive") : t("Shared with me")}
              </button>
              {place.trail.map((c, i) => (
                <React.Fragment key={c.id}>
                  <ChevronRight className="size-3" />
                  <button type="button" className="hover:text-foreground max-w-40 truncate" onClick={() => setPlace({ ...place, trail: place.trail.slice(0, i + 1) })}>
                    {c.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          ) : null}
          <ul className="h-72 overflow-y-auto rounded-md border p-1">
            {items === null ? <li className="text-muted-foreground p-3 text-sm">{t("Loading…")}</li> : null}
            {items?.length === 0 ? <li className="text-muted-foreground p-3 text-sm">{mode === "folder" ? t("No folders here.") : t("Nothing here yet.")}</li> : null}
            {items?.map((i) => {
              const on = picked.some((p) => p.id === i.id)
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    aria-pressed={i.kind === "file" ? on : undefined}
                    className={cn("hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm", on && "bg-primary/10")}
                    onClick={() => {
                      if (i.kind === "folder") setPlace({ ...place, trail: [...place.trail, { id: i.id, name: i.name }] })
                      else setPicked((list) => (on ? list.filter((p) => p.id !== i.id) : [...list, i]))
                    }}
                  >
                    {i.kind === "folder" ? <Folder className="text-muted-foreground size-4 shrink-0" /> : <File className="text-muted-foreground size-4 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    {i.kind === "file" ? <span className="text-muted-foreground text-xs tabular-nums">{formatBytes(i.size)}</span> : <ChevronRight className="text-muted-foreground size-4" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={confirm} disabled={busy || !canDropHere || (mode === "files" && !picked.length)}>
            {mode === "files" && picked.length ? `${confirmLabel} (${picked.length})` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
