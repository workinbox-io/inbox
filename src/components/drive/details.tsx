/**
 * The open item's side: the details panel (preview, facts, who has access, public links) on the right of the explorer,
 * a Sheet on phones; and Quick look, a large preview stepping through the folder's files with ← →.
 */
import * as React from "react"
import { Download, Folder, Lock, Share2, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import { IconAction } from "@/components/workspace/detail-header"
import { previewKind } from "@/lib/drive/access"
import { api } from "@/lib/api-client"
import { appLocale, t } from "@/lib/i18n/panel"
import { formatBytes } from "@/lib/uploads"
import { cn } from "@/lib/utils"
import { FileViewer, type ViewerFile } from "@/components/workspace/file-viewer"
import { PublicLinks } from "./links"
import { contentUrl, download, fileIcon, SHARING } from "./shared"
import type { DriveDetail, DriveSummary } from "./types"

export function Preview({ item, large = false }: { item: Pick<DriveSummary, "id" | "kind" | "name" | "mediaType">; large?: boolean }) {
  const kind = item.kind === "file" ? previewKind(item.mediaType) : null
  const src = contentUrl(item.id)
  const [text, setText] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (kind !== "text") return
    let live = true
    setText(null)
    // The first 256 KB is plenty to read; the rest is a download away.
    fetch(src, { headers: { Range: "bytes=0-262143" } })
      .then((r) => r.text())
      .then((s) => live && setText(s))
      .catch(() => live && setText(""))
    return () => {
      live = false
    }
  }, [kind, src])
  const h = large ? "max-h-[78vh]" : "max-h-72"
  if (kind === "image") return <img src={src} alt={item.name} className={cn("mx-auto w-auto rounded-md object-contain", h)} />
  if (kind === "video") return <video key={src} src={src} controls className={cn("w-full rounded-md bg-black", h)} />
  if (kind === "audio") return <audio key={src} src={src} controls className="w-full" />
  if (kind === "pdf") return <iframe src={src} title={item.name} className={cn("w-full rounded-md border", large ? "h-[78vh]" : "h-72")} />
  if (kind === "text") return <pre className={cn("bg-muted overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap", h)}>{text ?? t("Loading…")}</pre>
  const Icon = fileIcon(item)
  return (
    <div className={cn("bg-muted/50 grid place-items-center gap-2 rounded-md text-center", large ? "py-24" : "py-10")}>
      <Icon className="text-muted-foreground size-10" strokeWidth={1.5} />
      {item.kind === "file" ? <p className="text-muted-foreground text-xs">{t("No preview for this kind of file.")}</p> : null}
    </div>
  )
}

export function DetailsPanel({
  id,
  version,
  selectionCount,
  onClose,
  onOpenFolder,
  onShare,
  onStar,
  actions,
}: {
  id: string | null
  /** Bumped after changes, so the details reload. */
  version: number
  selectionCount: number
  onClose: () => void
  onOpenFolder: (id: string) => void
  onShare: (item: DriveDetail) => void
  onStar: (item: DriveSummary) => void
  actions: (item: DriveSummary) => MenuAction[]
}) {
  const [item, setItem] = React.useState<DriveDetail | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!id) return setItem(null)
    let live = true
    api<DriveDetail>("GET", `/api/app/drive/items/${id}`)
      .then((i) => live && (setItem(i), setError(null)))
      .catch((e) => live && (setItem(null), setError((e as Error).message)))
    return () => {
      live = false
    }
  }, [id, version])

  const share = item ? SHARING[item.sharing] : null
  return (
    <aside aria-label={t("Details")} className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{item && id ? item.name : selectionCount > 1 ? t("{count} selected", { count: selectionCount }) : t("Details")}</h2>
        {item ? (
          <>
            <IconAction label={item.starred ? t("Remove star") : t("Star")} onClick={() => onStar(item)}>
              <Star className={cn(item.starred && "fill-amber-400 text-amber-400")} />
            </IconAction>
            {item.kind === "file" && !item.trashed ? (
              <IconAction label={t("Download")} onClick={() => download(contentUrl(item.id, true))}>
                <Download />
              </IconAction>
            ) : null}
            <ActionMenuButton actions={() => actions(item)} label={t("More")} size="icon-sm" />
          </>
        ) : null}
        <IconAction label={t("Close details")} onClick={onClose}>
          <X />
        </IconAction>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!id ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {selectionCount > 1 ? t("Several items are selected. Use the bar above to act on all of them.") : t("Select a file or folder to see its details.")}
          </p>
        ) : error ? (
          <div className="text-muted-foreground grid place-items-center gap-2 py-10 text-center text-sm">
            <Lock className="size-6" />
            {error}
          </div>
        ) : !item ? (
          <div className="bg-muted h-48 animate-pulse rounded-md" />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
            {item.trashed ? null : <Preview item={item} />}
            {item.kind === "folder" && !item.trashed ? (
              <Button size="sm" variant="outline" onClick={() => onOpenFolder(item.id)}>
                <Folder /> {t("Open folder")}
              </Button>
            ) : null}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">{t("Type")}</dt>
              <dd className="truncate">{item.kind === "folder" ? t("Folder") : (item.mediaType ?? t("File"))}</dd>
              {item.kind === "file" ? (
                <>
                  <dt className="text-muted-foreground">{t("Size")}</dt>
                  <dd>{formatBytes(item.size)}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{t("Location")}</dt>
              <dd className="truncate">{[item.root === "mine" ? t("My drive") : t("Shared with me"), ...item.crumbs.map((c) => c.name)].join(" / ")}</dd>
              <dt className="text-muted-foreground">{t("Owner")}</dt>
              <dd>{item.ownerName ?? t("The team")}</dd>
              <dt className="text-muted-foreground">{t("Modified")}</dt>
              <dd>{new Date(item.updatedAt).toLocaleString(appLocale())}</dd>
              {item.trashed ? (
                <>
                  <dt className="text-muted-foreground">{t("Status")}</dt>
                  <dd>{t("In the trash")}</dd>
                </>
              ) : null}
            </dl>
            {share && !item.trashed ? (
              <section className="grid gap-2 border-t pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{t("Access")}</h3>
                  {item.manage ? (
                    <Button size="sm" variant="outline" onClick={() => onShare(item)}>
                      <Share2 /> {t("Share")}
                    </Button>
                  ) : null}
                </div>
                <p className="flex items-center gap-2 text-xs">
                  <share.icon className="size-3.5" style={{ color: share.color }} />
                  {t(share.label)}
                  {item.sharing === "people" ? <span className="text-muted-foreground">({item.people.length})</span> : null}
                  {item.sharing === "team" ? <span className="text-muted-foreground">({item.teamRole === "edit" ? t("can edit") : t("can view")})</span> : null}
                </p>
                <p className="text-muted-foreground text-xs">{t("Your access: {role}", { role: item.role === "owner" ? t("owner") : item.role === "edit" ? t("can edit") : t("can view") })}</p>
              </section>
            ) : null}
            {item.manage && !item.trashed ? <PublicLinks key={item.id} itemId={item.id} /> : null}
          </div>
        )}
      </div>
    </aside>
  )
}

/** Space or double-click: the file full screen in the shared viewer, ← → for the folder's other files, Esc to close. */
export function QuickLook({ items, id, onChange, onClose }: { items: DriveSummary[]; id: string | null; onChange: (id: string) => void; onClose: () => void }) {
  const files = items.filter((i) => i.kind === "file")
  const index = files.findIndex((f) => f.id === id)
  const viewerFiles: ViewerFile[] = files.map((f) => ({ id: f.id, name: f.name, mediaType: f.mediaType ?? "", size: f.size ?? undefined, url: contentUrl(f.id), downloadUrl: contentUrl(f.id, true) }))
  return <FileViewer files={viewerFiles} index={index < 0 ? null : index} onIndexChange={(i) => onChange(files[i]!.id)} onClose={onClose} />
}
