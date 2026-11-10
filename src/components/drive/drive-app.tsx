/**
 * /app/drive on the workspace kit (components/workspace, the same parts as Mail and Notes): the rail with My drive,
 * Shared with me, Recent and Trash plus the storage used, the list of a folder or view, and the open file's preview.
 * Files go up by drag and drop or the Upload button (./upload.ts); sharing uses the workspace ShareDialog with
 * the drive's public links below it.
 */
import * as React from "react"
import {
  ArchiveRestore,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderInput,
  FolderPlus,
  Globe,
  HardDrive,
  Link2,
  Lock,
  Pencil,
  SearchX,
  Share2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { EmptyState } from "@/components/app/empty-state"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { shortDate } from "@/components/mailbox/message-view"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ActionMenuButton, cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import { AppFrame } from "@/components/workspace/app-frame"
import { DetailHeader, IconAction } from "@/components/workspace/detail-header"
import { ListBody, ListEmpty, ListHeader, ListPane, ListRow, ListSearch } from "@/components/workspace/list-pane"
import { Rail, RailAction, RailItem, RailList } from "@/components/workspace/rail"
import { ShareDialog } from "@/components/workspace/share-dialog"
import { SplitView } from "@/components/workspace/split-view"
import { Kbd, shortcutsPaused, useMediaQuery, useMounted, WORKSPACE_COLORS } from "@/components/workspace/ui"
import { previewKind } from "@/lib/drive/access"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { pushUrl, replaceUrl } from "@/lib/panel-history"
import { formatBytes } from "@/lib/uploads"
import { cn } from "@/lib/utils"
import { DrivePicker } from "./drive-picker"
import { PublicLinks } from "./links"
import type { DriveDetail, DriveSummary, DriveUsage, DriveView } from "./types"
import { uploadToDrive } from "./upload"

/** Where the list is: a view, or inside a folder. */
export type DriveLocation = { view: DriveView; folder?: undefined } | { folder: string; view?: undefined }

export interface DriveAppProps {
  location: DriveLocation
  items: DriveSummary[]
  folder: DriveDetail | null
  fileId: string | null
  usage: DriveUsage
  canManage: boolean
  /** The user view: full screen, the account menu at the bottom of the rail. */
  account?: MailUser
}

const VIEWS: { value: DriveView; label: string; icon: typeof File }[] = [
  { value: "mine", label: "My drive", icon: HardDrive },
  { value: "shared", label: "Shared with me", icon: Users },
  { value: "recent", label: "Recent", icon: Clock },
  { value: "trash", label: "Trash", icon: Trash2 },
]

const SHARING = {
  private: { icon: Lock, label: "Only me", color: "#9ca3af" },
  people: { icon: Users, label: "Shared with people", color: WORKSPACE_COLORS[1] },
  team: { icon: Globe, label: "Everyone in the organization", color: WORKSPACE_COLORS[0] },
} as const

export function fileIcon(item: Pick<DriveSummary, "kind" | "mediaType" | "name">) {
  if (item.kind === "folder") return Folder
  const kind = previewKind(item.mediaType)
  if (kind === "image") return FileImage
  if (kind === "video") return FileVideo
  if (kind === "audio") return FileAudio
  if (kind === "pdf" || kind === "text") return FileText
  if (/\.(zip|rar|7z|tar|gz)$/i.test(item.name)) return FileArchive
  return File
}

const contentUrl = (id: string, download = false) => `/api/app/drive/items/${id}/content${download ? "?download=1" : ""}`

function urlFor(loc: DriveLocation, fileId: string | null) {
  const url = new URL(location.href)
  url.pathname = loc.folder ? `/app/drive/${loc.folder}` : "/app/drive"
  url.search = ""
  if (loc.view && loc.view !== "mine") url.searchParams.set("view", loc.view)
  if (fileId) url.searchParams.set("file", fileId)
  return url
}

function readUrl(): { loc: DriveLocation; fileId: string | null } {
  const folder = /^\/app\/drive\/([0-9a-f-]{36})/.exec(location.pathname)?.[1]
  const params = new URLSearchParams(location.search)
  const view = (params.get("view") as DriveView | null) ?? "mine"
  return { loc: folder ? { folder } : { view: VIEWS.some((v) => v.value === view) ? view : "mine" }, fileId: params.get("file") }
}

interface Upload {
  key: string
  name: string
  progress: number
  error?: string
}

export function DriveApp(props: DriveAppProps) {
  const [loc, setLoc] = React.useState<DriveLocation>(props.location)
  const [items, setItems] = React.useState(props.items)
  const [folder, setFolder] = React.useState<DriveDetail | null>(props.folder)
  const [selectedId, setSelectedId] = React.useState(props.fileId)
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [usage, setUsage] = React.useState(props.usage)
  const [uploads, setUploads] = React.useState<Upload[]>([])
  const [dragging, setDragging] = React.useState(false)
  /** New folder (true) or the item being renamed. */
  const [naming, setNaming] = React.useState<boolean | DriveSummary>(false)
  const [moving, setMoving] = React.useState<DriveSummary | null>(null)
  const [sharing, setSharing] = React.useState<DriveDetail | null>(null)
  const [detailVersion, setDetailVersion] = React.useState(0)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const mounted = useMounted()
  const desktop = useMediaQuery("(min-width: 768px)")
  const userView = !!props.account

  /** Where new folders and uploads go: the open folder when the viewer may add to it, else My drive. */
  const target = loc.folder && folder && folder.role !== "view" ? loc.folder : null

  const refresh = React.useCallback(async () => {
    const p = new URLSearchParams()
    if (query.trim()) p.set("q", query.trim())
    else if (loc.folder) p.set("folder", loc.folder)
    else p.set("view", loc.view ?? "mine")
    try {
      const [list, info] = await Promise.all([
        api<{ items: DriveSummary[] }>("GET", `/api/app/drive/items?${p}`),
        loc.folder ? api<DriveDetail>("GET", `/api/app/drive/items/${loc.folder}`) : Promise.resolve(null),
      ])
      setItems(list.items)
      setFolder(info)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [loc, query])

  const refreshUsage = React.useCallback(() => {
    api<DriveUsage>("GET", "/api/app/drive/usage").then(setUsage, () => {})
  }, [])

  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setLoading(true)
    const timer = setTimeout(() => void refresh().finally(() => setLoading(false)), query ? 250 : 0)
    return () => clearTimeout(timer)
  }, [refresh, query])

  const go = React.useCallback((next: DriveLocation) => {
    setLoc(next)
    setQuery("")
    setSelectedId(null)
    pushUrl(urlFor(next, null))
  }, [])

  const openFile = React.useCallback(
    (id: string | null) => {
      setSelectedId(id)
      pushUrl(urlFor(loc, id))
    },
    [loc],
  )

  React.useEffect(() => {
    const onPop = () => {
      const { loc: l, fileId } = readUrl()
      setLoc(l)
      setSelectedId(fileId)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // "New drive folder" from the command palette (/app/drive?new=folder).
  React.useEffect(() => {
    const url = new URL(location.href)
    if (url.searchParams.get("new") !== "folder") return
    url.searchParams.delete("new")
    replaceUrl(url)
    setNaming(true)
  }, [])

  const upload = React.useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      if (!list.length) return
      const dest = target
      for (const file of list) {
        const key = crypto.randomUUID()
        setUploads((u) => [...u, { key, name: file.name, progress: 0 }])
        uploadToDrive(file, dest, (progress) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress } : x))))
          .then((item) => {
            setUploads((u) => u.filter((x) => x.key !== key))
            // Show it where it landed, if that's the list on screen.
            if ((dest && loc.folder === dest) || (!dest && loc.view === "mine")) setItems((l) => [...l.filter((i) => i.id !== item.id), item])
            refreshUsage()
          })
          .catch((e) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: (e as Error).message } : x))))
      }
      if (!dest && loc.view !== "mine" && !loc.folder) toast.info(t("Uploading to My drive"))
    },
    [target, loc, refreshUsage],
  )

  async function saveName(name: string) {
    try {
      if (typeof naming === "object") {
        const saved = await api<DriveDetail>("PATCH", `/api/app/drive/items/${naming.id}`, { name })
        setItems((l) => l.map((i) => (i.id === saved.id ? saved : i)))
        setDetailVersion((v) => v + 1)
      } else {
        const created = await api<DriveDetail>("POST", "/api/app/drive/items", { name, parentId: target })
        if (target || loc.view === "mine") setItems((l) => [created, ...l])
        else go({ view: "mine" })
      }
      setNaming(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function patch(item: DriveSummary, body: Record<string, unknown>, done?: string) {
    try {
      await api<DriveDetail>("PATCH", `/api/app/drive/items/${item.id}`, body)
      // Trashing, restoring and moving take it out of the list on screen.
      setItems((l) => l.filter((i) => i.id !== item.id))
      if (selectedId === item.id) openFile(null)
      if (done) toast.success(done)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function deleteForever(item: DriveSummary) {
    try {
      await api("DELETE", `/api/app/drive/items/${item.id}`)
      setItems((l) => l.filter((i) => i.id !== item.id))
      if (selectedId === item.id) openFile(null)
      toast.success(t("Deleted for good"))
      setTimeout(refreshUsage, 2000)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function emptyTrash() {
    try {
      await api("DELETE", "/api/app/drive/trash")
      setItems([])
      toast.success(t("Trash emptied"))
      setTimeout(refreshUsage, 2000)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function openShare(id: string) {
    try {
      setSharing(await api<DriveDetail>("GET", `/api/app/drive/items/${id}`))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const copy = (text: string, done: string) => navigator.clipboard.writeText(text).then(() => toast.success(done), (e) => toast.error((e as Error).message))

  const itemActions = (i: DriveSummary, where: "list" | "detail"): MenuAction[] => {
    if (i.trashed)
      return cleanActions([
        i.manage && { label: t("Restore"), icon: ArchiveRestore, onSelect: () => patch(i, { trashed: false }, t("Restored")) },
        i.manage && {
          label: t("Delete for good"),
          icon: Trash2,
          destructive: true,
          confirm: { title: t("Delete \"{name}\" for good?", { name: i.name }), description: i.kind === "folder" ? t("Everything in the folder goes too. It can't be restored.") : t("It can't be restored afterwards."), confirmLabel: t("Delete") },
          onSelect: () => deleteForever(i),
        },
      ])
    return cleanActions([
      where === "list" && { label: t("Open"), icon: i.kind === "folder" ? Folder : FileText, onSelect: () => (i.kind === "folder" ? go({ folder: i.id }) : openFile(i.id)) },
      i.kind === "file" && { label: t("Download"), icon: Download, onSelect: () => void window.open(contentUrl(i.id, true), "_self") },
      i.kind === "file" && { label: t("Open in new tab"), icon: ExternalLink, onSelect: () => void window.open(contentUrl(i.id), "_blank") },
      { separator: true },
      i.manage && { label: t("Share…"), icon: Share2, onSelect: () => openShare(i.id) },
      { label: t("Copy link"), icon: Link2, onSelect: () => copy(`${location.origin}${i.kind === "folder" ? `/app/drive/${i.id}` : `/app/drive${i.parentId ? `/${i.parentId}` : ""}?file=${i.id}`}`, t("Link copied")) },
      { separator: true },
      i.role !== "view" && { label: t("Rename…"), icon: Pencil, onSelect: () => setNaming(i) },
      i.manage && { label: t("Move to…"), icon: FolderInput, onSelect: () => setMoving(i) },
      { separator: true },
      i.manage && { label: t("Move to trash"), icon: Trash2, destructive: true, onSelect: () => patch(i, { trashed: true }, t("Moved to the trash")) },
    ])
  }

  const selected = items.find((i) => i.id === selectedId)
  // Shortcuts, as in Mail: c new folder, u upload, / search, Esc closes the file, Delete trashes it.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutsPaused(e)) return
      if (e.key === "c") {
        e.preventDefault()
        setNaming(true)
      } else if (e.key === "u") {
        e.preventDefault()
        fileInput.current?.click()
      } else if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === "Escape" && selectedId) openFile(null)
      else if ((e.key === "Delete" || e.key === "#") && selected?.manage && !selected.trashed) void patch(selected, { trashed: true }, t("Moved to the trash"))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const viewMeta = VIEWS.find((v) => v.value === loc.view)
  const title = query ? t("Search") : folder && loc.folder ? folder.name : t(viewMeta?.label ?? "My drive")
  const trashView = loc.view === "trash" && !query

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

  const rail = (
    <Rail
      label={t("Drive")}
      hint={
        <>
          <Kbd>C</Kbd> {t("New folder")} <Kbd>U</Kbd> {t("Upload")}
        </>
      }
      footer={
        <>
          {usageBar}
          {props.account ? <AccountMenu user={props.account} canManage={props.canManage} /> : null}
        </>
      }
    >
      <RailAction icon={Upload} label={t("Upload")} shortcut="U" onClick={() => fileInput.current?.click()} />
      <RailList>
        <RailItem icon={FolderPlus} label={t("New folder")} active={false} onClick={() => setNaming(true)} />
      </RailList>
      <RailList>
        {VIEWS.map(({ value, label, icon }) => (
          <RailItem key={value} icon={icon} label={t(label)} active={loc.view === value && !query} onClick={() => go({ view: value })} />
        ))}
      </RailList>
    </Rail>
  )

  const crumbs = loc.folder && folder && !query ? (
    <nav aria-label={t("Folders")} className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-1 text-xs">
      <button type="button" className="hover:text-foreground" onClick={() => go({ view: folder.root })}>
        {folder.root === "mine" ? t("My drive") : t("Shared with me")}
      </button>
      {folder.crumbs.map((c) => (
        <React.Fragment key={c.id}>
          <ChevronRight className="size-3 shrink-0" />
          <button type="button" className="hover:text-foreground max-w-32 truncate" onClick={() => go({ folder: c.id })}>
            {c.name}
          </button>
        </React.Fragment>
      ))}
    </nav>
  ) : undefined

  const list = (
    <ListPane label={t("Files")}>
      <ListHeader
        title={title}
        subtitle={crumbs}
        loading={loading}
        actions={
          <>
            {trashView && items.length ? (
              <Button size="sm" variant="ghost" onClick={emptyTrash}>
                {t("Empty trash")}
              </Button>
            ) : null}
            {loc.folder && folder?.manage ? <ActionMenuButton actions={() => itemActions(folder, "detail")} label={t("Folder actions")} size="icon-sm" /> : null}
            {desktop ? null : (
              <>
                <Select value={loc.view ?? ""} onValueChange={(v) => go({ view: v as DriveView })}>
                  <SelectTrigger size="sm" className="max-w-36" aria-label={t("Drive views")}>
                    <SelectValue placeholder={t("Folder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {VIEWS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {t(v.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="rounded-full" onClick={() => fileInput.current?.click()}>
                  <Upload /> {t("Upload")}
                </Button>
                {props.account ? <AccountMenu user={props.account} canManage={props.canManage} compact /> : null}
              </>
            )}
          </>
        }
      >
        <ListSearch ref={searchRef} value={query} onChange={setQuery} placeholder={t("Search the drive")} />
      </ListHeader>
      {uploads.length ? (
        <ul className="mx-2 mb-1 grid gap-1" aria-label={t("Uploads")}>
          {uploads.map((u) => (
            <li key={u.key} className="bg-muted/60 relative overflow-hidden rounded-md px-3 py-1.5 text-xs">
              {!u.error ? <span className="bg-primary/15 absolute inset-y-0 left-0" style={{ width: `${Math.round(u.progress * 100)}%` }} aria-hidden /> : null}
              <span className="relative flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                {u.error ? <span className="text-destructive truncate">{u.error}</span> : <span className="tabular-nums">{Math.round(u.progress * 100)}%</span>}
                {u.error ? (
                  <button type="button" aria-label={t("Dismiss")} onClick={() => setUploads((l) => l.filter((x) => x.key !== u.key))}>
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ListBody dimmed={loading}>
        {items.map((i) => {
          const share = SHARING[i.sharing]
          const Icon = fileIcon(i)
          return (
            <ListRow
              key={i.id}
              color={share.color}
              selected={selectedId === i.id}
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate">{i.name}</span>
                </span>
              }
              meta={i.sharing !== "private" ? <share.icon className="text-muted-foreground size-3" aria-label={t(share.label)} /> : null}
              time={mounted ? shortDate(i.updatedAt) : null}
              snippet={[i.kind === "folder" ? t("Folder") : formatBytes(i.size), i.ownerName].filter(Boolean).join(" · ")}
              onClick={() => (i.kind === "folder" && !i.trashed ? go({ folder: i.id }) : openFile(i.id))}
              actions={() => itemActions(i, "list")}
              menuLabel={t("File actions")}
            />
          )
        })}
        {items.length === 0 && !loading ? (
          <ListEmpty
            icon={query ? <SearchX /> : trashView ? <Trash2 /> : <HardDrive />}
            title={query ? t("Nothing matches that search") : trashView ? t("The trash is empty") : loc.view === "shared" ? t("Nothing shared with you yet") : t("No files here yet")}
            description={!query && !trashView && loc.view !== "shared" ? t("Drop files here, or upload them.") : trashView ? t("Items in the trash are deleted for good after 30 days.") : undefined}
            action={
              !query && !trashView && loc.view !== "shared" && loc.view !== "recent" ? (
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                  <Upload /> {t("Upload")}
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </ListBody>
    </ListPane>
  )

  const detail = selectedId ? (
    <FilePane key={selectedId} id={selectedId} version={detailVersion} onBack={() => openFile(null)} onOpenFolder={(id) => go({ folder: id })} actions={(i) => itemActions(i, "detail")} onShare={() => openShare(selectedId)} />
  ) : (
    <div className="grid h-full place-items-center p-6">
      <EmptyState
        variant="plain"
        icon={<HardDrive />}
        title={t("No file open")}
        description={
          <>
            {t("Pick one on the left, or press")} <kbd className="bg-muted rounded px-1 font-mono text-xs">U</kbd> {t("to upload.")}
          </>
        }
      />
    </div>
  )

  return (
    <AppFrame userView={userView}>
      {desktop ? rail : null}
      <div
        className="relative flex min-h-0 min-w-0 flex-1"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDragging(false)
          upload(e.dataTransfer.files)
        }}
      >
        <SplitView list={list} detail={detail} showDetail={!!selectedId} />
        {dragging ? (
          <div className="border-primary bg-primary/5 pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-lg border-2 border-dashed" onDragLeave={() => setDragging(false)}>
            <p className="bg-background rounded-md px-3 py-2 text-sm font-medium shadow-sm">{target ? t("Drop to upload to {name}", { name: folder?.name ?? "" }) : t("Drop to upload to My drive")}</p>
          </div>
        ) : null}
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) upload(e.target.files)
          e.target.value = ""
        }}
      />
      <NameDialog item={typeof naming === "object" ? naming : null} open={!!naming} onOpenChange={(o) => !o && setNaming(false)} onSave={saveName} />
      <DrivePicker
        open={!!moving}
        onOpenChange={(o) => !o && setMoving(null)}
        mode="folder"
        title={moving ? t("Move \"{name}\"", { name: moving.name }) : ""}
        confirmLabel={t("Move here")}
        exclude={moving?.id}
        onPick={async ({ folderId }) => {
          if (moving) await patch(moving, { parentId: folderId }, t("Moved"))
        }}
      />
      {sharing ? (
        <ShareDialog
          note={sharing}
          endpoint={`/api/app/drive/items/${sharing.id}/share`}
          title={t("Share \"{name}\"", { name: sharing.name })}
          description={sharing.kind === "folder" ? t("People get access to everything in the folder, including what's added later.") : t("Choose who can open this file.")}
          open
          onOpenChange={(o) => !o && setSharing(null)}
          onSaved={(saved) => {
            setItems((l) => l.map((i) => (i.id === saved.id ? saved : i)))
            setDetailVersion((v) => v + 1)
          }}
        >
          <PublicLinks itemId={sharing.id} />
        </ShareDialog>
      ) : null}
    </AppFrame>
  )
}

function NameDialog({ item, open, onOpenChange, onSave }: { item: DriveSummary | null; open: boolean; onOpenChange: (o: boolean) => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (open) setName(item?.name ?? "")
  }, [open, item])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim()) return
            setSaving(true)
            await onSave(name.trim())
            setSaving(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{item ? t("Rename") : t("New folder")}</DialogTitle>
          </DialogHeader>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={item ? t("Name") : t("Folder name")} maxLength={200} aria-label={t("Name")} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {item ? t("Save") : t("Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FilePane({ id, version, onBack, onOpenFolder, actions, onShare }: { id: string; version: number; onBack: () => void; onOpenFolder: (id: string) => void; actions: (i: DriveSummary) => MenuAction[]; onShare: () => void }) {
  const [item, setItem] = React.useState<DriveDetail | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    api<DriveDetail>("GET", `/api/app/drive/items/${id}`)
      .then((i) => live && (setItem(i), setError(null)))
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [id, version])

  if (error)
    return (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          variant="plain"
          icon={<Lock />}
          title={t("This file can't be opened")}
          description={error}
          action={
            <Button size="sm" variant="outline" onClick={onBack}>
              {t("Back to the drive")}
            </Button>
          }
        />
      </div>
    )

  const share = item ? SHARING[item.sharing] : null
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <DetailHeader onBack={onBack} backLabel={t("Back to the drive")}>
        {item && share ? (
          <span className="flex min-w-0 items-center gap-1.5 px-1 text-sm font-medium">
            <span className="truncate">{item.name}</span>
            <share.icon className="size-3.5 shrink-0" style={{ color: share.color }} aria-label={t(share.label)} />
            {item.trashed ? <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">{t("In the trash")}</span> : null}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          {item?.kind === "file" && !item.trashed ? (
            <IconAction label={t("Download")} onClick={() => void window.open(contentUrl(item.id, true), "_self")}>
              <Download />
            </IconAction>
          ) : null}
          {item ? <ActionMenuButton actions={() => actions(item)} label={t("More")} size="icon-sm" /> : null}
          {item?.manage && !item.trashed ? (
            <Button size="sm" variant="outline" className="ml-1" onClick={onShare}>
              <Share2 />
              {t("Share")}
            </Button>
          ) : null}
        </div>
      </DetailHeader>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {item ? (
          <div className="grid gap-4">
            {item.trashed ? null : item.kind === "folder" ? (
              <div className="grid place-items-center gap-3 rounded-md border py-12 text-center">
                <Folder className="text-muted-foreground size-10" />
                <Button size="sm" variant="outline" onClick={() => onOpenFolder(item.id)}>
                  {t("Open folder")}
                </Button>
              </div>
            ) : (
              <Preview item={item} />
            )}
            <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {item.kind === "file" ? (
                <>
                  <dt>{t("Size")}</dt>
                  <dd className="text-foreground">{formatBytes(item.size)}</dd>
                </>
              ) : null}
              <dt>{t("Owner")}</dt>
              <dd className="text-foreground">{item.ownerName ?? t("The team")}</dd>
              <dt>{t("Changed")}</dt>
              <dd className="text-foreground">{new Date(item.updatedAt).toLocaleString()}</dd>
              <dt>{t("Access")}</dt>
              <dd className="text-foreground">{share ? t(share.label) : null}</dd>
            </dl>
          </div>
        ) : (
          <div className="bg-muted h-64 animate-pulse rounded-md" />
        )}
      </div>
    </section>
  )
}

function Preview({ item }: { item: DriveDetail }) {
  const kind = previewKind(item.mediaType)
  const src = contentUrl(item.id)
  const [text, setText] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (kind !== "text") return
    let live = true
    // The first 256 KB is plenty to read; the rest is a download away.
    fetch(src, { headers: { Range: "bytes=0-262143" } })
      .then((r) => r.text())
      .then((s) => live && setText(s))
      .catch(() => live && setText(""))
    return () => {
      live = false
    }
  }, [kind, src])
  if (kind === "image") return <img src={src} alt={item.name} className="mx-auto max-h-[70vh] w-auto rounded-md border object-contain" />
  if (kind === "video") return <video src={src} controls className="max-h-[70vh] w-full rounded-md border bg-black" />
  if (kind === "audio") return <audio src={src} controls className="w-full" />
  if (kind === "pdf") return <iframe src={src} title={item.name} className="h-[70vh] w-full rounded-md border" />
  if (kind === "text") return <pre className="bg-muted max-h-[70vh] overflow-auto rounded-md p-4 text-xs whitespace-pre-wrap">{text ?? t("Loading…")}</pre>
  const Icon = fileIcon(item)
  return (
    <div className="grid place-items-center gap-3 rounded-md border py-12 text-center">
      <Icon className="text-muted-foreground size-10" />
      <p className="text-muted-foreground text-sm">{t("No preview for this kind of file.")}</p>
      <Button size="sm" variant="outline" onClick={() => void window.open(contentUrl(item.id, true), "_self")}>
        <Download /> {t("Download")}
      </Button>
    </div>
  )
}
