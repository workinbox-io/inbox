/**
 * /app/drive: a file explorer on the workspace kit. The rail holds the folder tree (./folder-tree), the middle the
 * toolbar (./toolbar) over a table or grid (./item-views) with selection (click, ⌘, Shift, rectangle), drag and drop
 * (moving, and uploading files and folders from the computer), and the right side the details (./details).
 * Pure rules (sorting, selection, focus) are in lib/drive/explorer.ts; the server in lib/server/drive.
 */
import * as React from "react"
import { ArchiveRestore, Copy, Download, ExternalLink, FileText, Folder, FolderInput, FolderPlus, FolderUp, Info, Link2, Pencil, Share2, Star, StarOff, Trash2, Upload, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/app/confirm-button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { ActionMenu, cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import { AppFrame } from "@/components/workspace/app-frame"
import { ListEmpty } from "@/components/workspace/list-pane"
import { ShareDialog } from "@/components/workspace/share-dialog"
import { SidePanel } from "@/components/workspace/split-view"
import { foldAway, shortcutsPaused, useAppLayout } from "@/components/workspace/ui"
import { clickSelect, moveFocus, sortItems, type Selection } from "@/lib/drive/explorer"
import { api } from "@/lib/api-client"
import { msg, t, tp } from "@/lib/i18n/panel"
import { PANEL_NAVIGATION, pushUrl, replaceUrl } from "@/lib/panel-history"
import { formatBytes } from "@/lib/uploads"
import { cn } from "@/lib/utils"
import { DetailsPanel, QuickLook } from "./details"
import { DrivePicker } from "./drive-picker"
import { FolderTree, type DriveLocation } from "./folder-tree"
import { ItemGrid, ItemTable } from "./item-views"
import { PublicLinks } from "./links"
import { contentUrl, download, isFileDrag, readPrefs, writePrefs, zipUrl, type DrivePrefs } from "./shared"
import { Toolbar, type Crumb } from "./toolbar"
import type { DriveDetail, DriveSummary, DriveUsage, DriveView } from "./types"
import { runTask, task } from "./task"
import { uploadToDrive } from "./upload"
import { createFolders, dropEntries, inputEntries, type PickedFile } from "./upload-folder"
import { useMarquee } from "./use-marquee"

export type { DriveLocation }

export interface DriveAppProps {
  location: DriveLocation
  items: DriveSummary[]
  folder: DriveDetail | null
  fileId: string | null
  usage: DriveUsage
  canManage: boolean
  /** The signed-in person, for the account menu at the bottom of the rail. */
  account: MailUser
}

const VIEW_LABELS: Record<DriveView, string> = { mine: msg("My drive"), shared: msg("Shared with me"), recent: msg("Recent"), starred: msg("Starred"), trash: msg("Trash") }
const DEFAULT_PREFS: DrivePrefs = { layout: "list", sort: "name", dir: "asc", details: true, detailsWidth: 340 }
type BatchAction = "move" | "trash" | "restore" | "delete" | "star" | "unstar"

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
  const view = params.get("view") as DriveView | null
  return { loc: folder ? { folder } : { view: view && view in VIEW_LABELS ? view : "mine" }, fileId: params.get("file") }
}

const none = (): Selection => ({ ids: new Set(), anchor: null })

export function DriveApp(props: DriveAppProps) {
  const [loc, setLoc] = React.useState<DriveLocation>(props.location)
  const [items, setItems] = React.useState(props.items)
  const [folder, setFolder] = React.useState<DriveDetail | null>(props.folder)
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [usage, setUsage] = React.useState(props.usage)
  const [prefs, setPrefsState] = React.useState<DrivePrefs>(DEFAULT_PREFS)
  const [sel, setSel] = React.useState<Selection>(() => ({ ids: new Set(props.fileId ? [props.fileId] : []), anchor: props.fileId }))
  const [focusId, setFocusId] = React.useState<string | null>(props.fileId)
  /** New folder (true) or the item being renamed. */
  const [naming, setNaming] = React.useState<boolean | DriveSummary>(false)
  const [moving, setMoving] = React.useState<string[] | null>(null)
  const [sharing, setSharing] = React.useState<DriveDetail | null>(null)
  const [quickLook, setQuickLook] = React.useState<string | null>(null)
  const [sheet, setSheet] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [version, setVersion] = React.useState(0)
  const [treeKey, setTreeKey] = React.useState(0)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const folderInput = React.useRef<HTMLInputElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  // desktop: room for the folder tree beside the files (the frame, not the window); wide: the details panel too.
  const { ref: frameRef, desktop, wide } = useAppLayout()

  // Preferences live in this browser; read them after hydration so the server's HTML matches the first render.
  React.useEffect(() => setPrefsState(readPrefs()), [])
  const setPrefs = (p: Partial<DrivePrefs>) =>
    setPrefsState((old) => {
      const next = { ...old, ...p }
      writePrefs(next)
      return next
    })

  const trashView = loc.view === "trash" && !query
  const sorted = React.useMemo(() => sortItems(items, prefs.sort, prefs.dir), [items, prefs.sort, prefs.dir])
  const order = React.useMemo(() => sorted.map((i) => i.id), [sorted])
  const selected = React.useMemo(() => sorted.filter((i) => sel.ids.has(i.id)), [sorted, sel])
  /** Where new folders and uploads go: the open folder when the viewer may add to it, else My drive. */
  const target = loc.folder && folder && folder.role !== "view" ? loc.folder : null
  const detailsId = selected.length === 1 ? selected[0]!.id : null

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
      // Keep only what's still on screen selected.
      setSel((s) => ({ ids: new Set([...s.ids].filter((id) => list.items.some((i) => i.id === id))), anchor: s.anchor }))
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

  /** After a change: the list, the details and (for folders) the tree. */
  const changed = React.useCallback(
    (folders = true) => {
      void refresh()
      setVersion((v) => v + 1)
      if (folders) setTreeKey((k) => k + 1)
    },
    [refresh],
  )

  const go = React.useCallback((next: DriveLocation) => {
    setLoc(next)
    setQuery("")
    setSel(none())
    setFocusId(null)
    pushUrl(urlFor(next, null))
  }, [])

  // ?file=<id> follows the single selected item, so a copied link opens it with its details.
  React.useEffect(() => {
    const url = urlFor(loc, detailsId)
    if (url.href !== location.href) replaceUrl(url)
  }, [loc, detailsId])

  React.useEffect(() => {
    const onPop = () => {
      const { loc: l, fileId } = readUrl()
      setLoc(l)
      setSel({ ids: new Set(fileId ? [fileId] : []), anchor: fileId })
    }
    window.addEventListener(PANEL_NAVIGATION, onPop)
    return () => window.removeEventListener(PANEL_NAVIGATION, onPop)
  }, [])

  const readAction = React.useEffectEvent(() => {
    const url = new URL(location.href)
    if (url.searchParams.get("new") !== "folder") return
    url.searchParams.delete("new")
    replaceUrl(url)
    setNaming(true)
  })
  React.useEffect(() => {
    readAction()
    const read = () => readAction()
    window.addEventListener(PANEL_NAVIGATION, read)
    return () => window.removeEventListener(PANEL_NAVIGATION, read)
  }, [])

  // ——— Uploads ———

  const uploadFiles = React.useCallback(
    async (files: PickedFile[], folders: string[][], dest: string | null) => {
      if (!files.length && !folders.length) return
      const place = dest && folder?.id === dest ? folder.name : t("My drive")
      const label = files.length === 1 ? t("Uploading {name}…", { name: files[0]!.file.name }) : t("Uploading {count} files to {place}…", { count: files.length, place })
      const job = task(folders.length ? t("Creating folders…") : label, { progress: true })
      let where: (dirs: string[]) => string | null = () => dest
      try {
        if (folders.length) where = await createFolders(folders, dest)
      } catch (e) {
        return job.fail((e as Error).message)
      }
      if (folders.length) changed()
      job.progress(0, label)
      // Bytes sent per file, so the bar shows the whole batch; three files at a time.
      const total = files.reduce((n, f) => n + f.file.size, 0) || 1
      const sent = new Map<File, number>()
      const errors: string[] = []
      const queue = [...files]
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const { file, dirs } = next
          try {
            await uploadToDrive(file, where(dirs), (fraction) => {
              sent.set(file, fraction * file.size)
              job.progress([...sent.values()].reduce((a, b) => a + b, 0) / total)
            })
          } catch (e) {
            errors.push(`${file.name}: ${(e as Error).message}`)
          }
          sent.set(file, file.size)
        }
      }
      await Promise.all([worker(), worker(), worker()])
      const ok = files.length - errors.length
      if (!errors.length) job.done(files.length === 1 ? t("Uploaded {name}", { name: files[0]!.file.name }) : t("Uploaded {count} files to {place}", { count: files.length, place }))
      else job.fail(ok ? t("{ok} of {count} files uploaded", { ok, count: files.length }) : t("Upload failed"), errors.slice(0, 3).join(" · "))
      changed(folders.length > 0)
      refreshUsage()
    },
    [changed, folder, refreshUsage],
  )

  const dropFiles = React.useCallback(
    (data: DataTransfer, dest: string | null) => {
      void dropEntries(data).then(({ files, folders }) => uploadFiles(files, folders, dest))
    },
    [uploadFiles],
  )

  // ——— Actions ———

  async function batch(ids: string[], action: BatchAction, parentId?: string | null) {
    const quiet = action === "star" || action === "unstar"
    const name = ids.length === 1 ? (items.find((i) => i.id === ids[0])?.name ?? t("1 item")) : t("{count} items", { count: ids.length })
    const working = { move: msg("Moving {name}…"), trash: msg("Moving {name} to the trash…"), restore: msg("Restoring {name}…"), delete: msg("Deleting {name} for good…") } as const
    const finished = { move: msg("Moved {name}"), trash: msg("Moved {name} to the trash"), restore: msg("Restored {name}"), delete: msg("Deleted {name} for good") } as const
    const job = quiet ? null : task(t(working[action as keyof typeof working], { name }))
    try {
      const { done, failed } = await api<{ done: string[]; failed: { id: string; error: string }[] }>("POST", "/api/app/drive/batch", { ids, action, parentId })
      if (failed.length) {
        const msg = done.length ? t("{done} done, {failed} not", { done: done.length, failed: failed.length }) : failed[0]!.error
        if (job) job.fail(msg, done.length ? failed[0]!.error : undefined)
        else toast.error(msg)
      } else if (job) {
        job.done(t(finished[action as keyof typeof finished], { name }), action === "trash" ? { action: { label: t("Undo"), onClick: () => void batch(done, "restore") } } : {})
      }
      if (action === "star" || action === "unstar") {
        setItems((l) => l.map((i) => (done.includes(i.id) ? { ...i, starred: action === "star" } : i)))
        setVersion((v) => v + 1)
        if (loc.view === "starred") void refresh()
      } else {
        // They leave this view (a search may still list moved ones, so those just refresh).
        if (action !== "move" || !query) foldAway(done, () => setItems((l) => l.filter((i) => !done.includes(i.id))))
        changed(true)
        if (action === "delete") setTimeout(refreshUsage, 2000)
      }
    } catch (e) {
      if (job) job.fail((e as Error).message)
      else toast.error((e as Error).message)
    }
  }

  async function copyOf(item: DriveSummary) {
    const copy = await runTask(
      t("Copying {name}…", { name: item.name }),
      () => api<DriveDetail>("POST", `/api/app/drive/items/${item.id}/copy`, {}),
      (c) => t("Copied as {name}", { name: c.name }),
    )
    if (!copy) return
    changed(item.kind === "folder")
    refreshUsage()
  }

  async function saveName(name: string) {
    try {
      if (typeof naming === "object") {
        await api<DriveDetail>("PATCH", `/api/app/drive/items/${naming.id}`, { name })
        changed(naming.kind === "folder")
      } else {
        const created = await api<DriveDetail>("POST", "/api/app/drive/items", { name, parentId: target })
        if (target || loc.view === "mine") {
          changed()
          setSel({ ids: new Set([created.id]), anchor: created.id })
        } else go({ view: "mine" })
      }
      setNaming(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const [emptyTrashOpen, setEmptyTrashOpen] = React.useState(false)
  async function emptyTrash() {
    const done = await runTask(t("Emptying the trash…"), () => api("DELETE", "/api/app/drive/trash"), () => t("Trash emptied"))
    if (done === undefined) return
    setItems([])
    setTimeout(refreshUsage, 2000)
  }

  async function openShare(id: string) {
    try {
      setSharing(await api<DriveDetail>("GET", `/api/app/drive/items/${id}`))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** One file: the browser's own download. Several, or a folder: a ZIP, checked first so errors show here, not as a page. */
  const downloadItems = async (list: DriveSummary[]) => {
    if (list.length === 1 && list[0]!.kind === "file") return download(contentUrl(list[0]!.id, true))
    if (!list.length) return
    const ids = list.map((i) => i.id)
    const job = task(t("Preparing ZIP…"))
    try {
      const { files, bytes } = await api<{ files: number; bytes: number }>("GET", `${zipUrl(ids)}&check=1`)
      download(zipUrl(ids))
      job.done(t("Downloading ZIP"), { description: `${tp(files, { one: "{count} file", other: "{count} files" }, { count: files })}, ${formatBytes(bytes)}` })
    } catch (e) {
      job.fail((e as Error).message)
    }
  }

  const open = (item: DriveSummary) => {
    if (item.trashed) return
    if (item.kind === "folder") go({ folder: item.id })
    else setQuickLook(item.id)
  }

  const copyLink = (i: DriveSummary) =>
    navigator.clipboard
      .writeText(`${location.origin}${i.kind === "folder" ? `/app/drive/${i.id}` : `/app/drive${i.parentId ? `/${i.parentId}` : ""}?file=${i.id}`}`)
      .then(() => toast.success(t("Link copied")), (e) => toast.error((e as Error).message))

  const showDetails = (item: DriveSummary) => {
    setSel({ ids: new Set([item.id]), anchor: item.id })
    if (wide) setPrefs({ details: true })
    else setSheet(true)
  }

  /** An item's menu (right-click, long press, "…"); on an item inside a selection of several it acts on all of them. */
  const itemActions = (item: DriveSummary): MenuAction[] => {
    const many = sel.ids.size > 1 && sel.ids.has(item.id) ? selected : null
    const list = many ?? [item]
    const ids = list.map((i) => i.id)
    const manage = list.every((i) => i.manage)
    if (list.some((i) => i.trashed))
      return cleanActions([
        manage && { label: t("Restore"), icon: ArchiveRestore, onSelect: () => batch(ids, "restore") },
        manage && {
          label: t("Delete for good"),
          icon: Trash2,
          destructive: true,
          confirm: {
            title: many ? t("Delete {count} items for good?", { count: list.length }) : t("Delete \"{name}\" for good?", { name: item.name }),
            description: t("Everything in the selected folders goes too. It can't be restored."),
            confirmLabel: t("Delete"),
          },
          onSelect: () => batch(ids, "delete"),
        },
      ])
    const starred = list.every((i) => i.starred)
    if (many)
      return cleanActions([
        { label: t("Download as ZIP"), icon: Download, onSelect: () => downloadItems(list) },
        { label: starred ? t("Remove star") : t("Star"), icon: starred ? StarOff : Star, onSelect: () => batch(ids, starred ? "unstar" : "star") },
        { separator: true },
        manage && { label: t("Move to…"), icon: FolderInput, onSelect: () => setMoving(ids) },
        manage && { label: t("Move to trash"), icon: Trash2, destructive: true, onSelect: () => batch(ids, "trash") },
      ])
    return cleanActions([
      { label: t("Open"), icon: item.kind === "folder" ? Folder : FileText, onSelect: () => open(item) },
      item.kind === "file" && { label: t("Open in new tab"), icon: ExternalLink, onSelect: () => void window.open(contentUrl(item.id), "_blank") },
      { label: t("Details"), icon: Info, onSelect: () => showDetails(item) },
      { separator: true },
      { label: item.kind === "folder" ? t("Download as ZIP") : t("Download"), icon: Download, onSelect: () => downloadItems([item]) },
      item.manage && { label: t("Share…"), icon: Share2, onSelect: () => openShare(item.id) },
      { label: t("Copy link"), icon: Link2, onSelect: () => copyLink(item) },
      { separator: true },
      item.role !== "view" && { label: t("Rename…"), icon: Pencil, onSelect: () => setNaming(item) },
      item.manage && { label: t("Move to…"), icon: FolderInput, onSelect: () => setMoving([item.id]) },
      { label: t("Make a copy"), icon: Copy, onSelect: () => copyOf(item) },
      { label: item.starred ? t("Remove star") : t("Star"), icon: item.starred ? StarOff : Star, onSelect: () => batch([item.id], item.starred ? "unstar" : "star") },
      { separator: true },
      item.manage && { label: t("Move to trash"), icon: Trash2, destructive: true, onSelect: () => batch([item.id], "trash") },
    ])
  }

  const canAddHere = !trashView && !query && (loc.view === "mine" || !!target)
  const backgroundActions = (): MenuAction[] =>
    cleanActions([
      canAddHere && { label: t("New folder"), icon: FolderPlus, onSelect: () => setNaming(true) },
      canAddHere && { label: t("Upload files"), icon: Upload, onSelect: () => fileInput.current?.click() },
      canAddHere && { label: t("Upload folder"), icon: FolderUp, onSelect: () => folderInput.current?.click() },
      trashView && items.length > 0 && { label: t("Empty trash"), icon: Trash2, destructive: true, onSelect: () => setEmptyTrashOpen(true) },
    ])

  // ——— Selection ———

  const onItemClick = (item: DriveSummary, e: React.MouseEvent) => {
    // Phones: a tap opens, like any list there; the long-press menu has the rest.
    if (!desktop) {
      if (item.kind === "folder" && !item.trashed) return go({ folder: item.id })
      setSel({ ids: new Set([item.id]), anchor: item.id })
      return setSheet(true)
    }
    setSel((s) => clickSelect(s, order, item.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey }))
    setFocusId(item.id)
  }
  const onToggle = (item: DriveSummary) => setSel((s) => clickSelect(s, order, item.id, { meta: true }))
  const marquee = useMarquee(
    scroller,
    React.useCallback((ids: string[]) => setSel({ ids: new Set(ids), anchor: ids[0] ?? null }), []),
    React.useCallback(() => setSel(none()), []),
  )
  const allChecked = order.length > 0 && selected.length === order.length ? true : selected.length ? "indeterminate" : false

  // ——— Shortcuts (paused while typing or with a dialog or menu open) ———

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutsPaused(e) || quickLook) return
      const meta = e.metaKey || e.ctrlKey
      const focused = sorted.find((i) => i.id === focusId) ?? selected[0]
      const cols = prefs.layout === "grid" ? Math.max(1, Math.floor(((scroller.current?.clientWidth ?? 600) - 12) / 162)) : 1
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && !(meta && e.key === "ArrowUp")) {
        e.preventDefault()
        const next = moveFocus(order, focusId, e.key, cols)
        if (!next) return
        setFocusId(next)
        setSel((s) => (e.shiftKey ? clickSelect(s, order, next, { shift: true }) : { ids: new Set([next]), anchor: next }))
        document.querySelector(`[data-drive-id="${next}"]`)?.scrollIntoView({ block: "nearest" })
      } else if (e.key === "a" && meta) {
        e.preventDefault()
        setSel({ ids: new Set(order), anchor: order[0] ?? null })
      } else if (e.key === "Escape") {
        if (sel.ids.size) setSel(none())
      } else if (e.key === "Enter" && focused) {
        e.preventDefault()
        open(focused)
      } else if (e.key === " " && focused?.kind === "file") {
        e.preventDefault()
        setQuickLook(focused.id)
      } else if ((e.key === "Backspace" && !meta) || (e.key === "ArrowUp" && meta)) {
        if (!loc.folder || !folder) return
        e.preventDefault()
        const up = folder.crumbs.at(-1)
        go(up ? { folder: up.id } : { view: folder.root })
      } else if ((e.key === "Delete" || e.key === "#" || (e.key === "Backspace" && meta)) && selected.length && selected.every((i) => i.manage)) {
        e.preventDefault()
        void batch(selected.map((i) => i.id), trashView ? "restore" : "trash")
      } else if (e.key === "F2" && selected.length === 1 && selected[0]!.role !== "view") {
        e.preventDefault()
        setNaming(selected[0]!)
      } else if (e.key === "s" && !meta && selected.length) {
        e.preventDefault()
        void batch(selected.map((i) => i.id), selected.every((i) => i.starred) ? "unstar" : "star")
      } else if (e.key === "i" && !meta) {
        e.preventDefault()
        if (wide) setPrefs({ details: !prefs.details })
        else if (selected.length) setSheet(true)
      } else if (e.key === "c" && !meta && canAddHere) {
        e.preventDefault()
        setNaming(true)
      } else if (e.key === "u" && !meta) {
        e.preventDefault()
        fileInput.current?.click()
      } else if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // ——— Layout ———

  const drop = { onDropItems: (ids: string[], folderId: string | null) => void batch(ids, "move", folderId), onDropFiles: dropFiles }
  const crumbs: Crumb[] =
    loc.folder && folder && !query
      ? [
          { id: folder.root === "mine" ? null : "shared", name: folder.root === "mine" ? t("My drive") : t("Shared with me") },
          ...folder.crumbs.map((c) => ({ id: c.id, name: c.name })),
          { id: folder.id, name: folder.name },
        ]
      : loc.view === "mine" && !query
        ? [{ id: null, name: t("My drive") }]
        : []
  const title = query ? t("Search") : t(VIEW_LABELS[loc.view ?? "mine"])
  const openPath = React.useMemo(() => (loc.folder && folder ? { root: folder.root, ids: [...folder.crumbs.map((c) => c.id), folder.id] } : null), [loc.folder, folder])

  const details = (
    <DetailsPanel
      id={detailsId}
      version={version}
      selectionCount={selected.length}
      onClose={() => (wide ? setPrefs({ details: false }) : setSheet(false))}
      onOpenFolder={(id) => go({ folder: id })}
      onShare={(i) => setSharing(i)}
      onStar={(i) => batch([i.id], i.starred ? "unstar" : "star")}
      actions={itemActions}
    />
  )

  const viewProps = { items: sorted, selection: sel.ids, focusId, onClick: onItemClick, onToggle, onOpen: open, actions: itemActions, drop, readOnly: trashView }
  const empty = (
    <ListEmpty
      icon={query ? <X /> : trashView ? <Trash2 /> : <Folder />}
      title={
        query
          ? t("Nothing matches that search")
          : trashView
            ? t("The trash is empty")
            : loc.view === "shared"
              ? t("Nothing shared with you yet")
              : loc.view === "starred"
                ? t("No starred items")
                : t("No files here yet")
      }
      description={
        canAddHere
          ? t("Drop files or folders here, or upload them.")
          : trashView
            ? t("Items in the trash are deleted for good after 30 days.")
            : loc.view === "starred"
              ? t("Star files and folders to keep them at hand.")
              : undefined
      }
      action={
        canAddHere ? (
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload /> {t("Upload")}
          </Button>
        ) : undefined
      }
    />
  )

  return (
    <AppFrame ref={frameRef}>
      <ConfirmDialog
        open={emptyTrashOpen}
        onOpenChange={setEmptyTrashOpen}
        title={t("Empty trash?")}
        description={t("All items you can delete in the trash, including everything inside their folders, will be permanently deleted. This can't be undone.")}
        confirmLabel={t("Empty trash")}
        onConfirm={async () => {
          await emptyTrash()
          setEmptyTrashOpen(false)
        }}
      />
      {desktop ? (
        <FolderTree
          location={loc}
          openPath={openPath}
          refreshKey={treeKey}
          usage={usage}
          footer={<AccountMenu user={props.account} canManage={props.canManage} />}
          onNavigate={go}
          onUploadFiles={() => fileInput.current?.click()}
          onUploadFolder={() => folderInput.current?.click()}
          onNewFolder={() => setNaming(true)}
          drop={drop}
        />
      ) : null}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t("Files")}>
        <Toolbar
          crumbs={crumbs}
          title={title}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          prefs={prefs}
          onPrefs={setPrefs}
          onGo={(c) => (c.id === "shared" ? go({ view: "shared" }) : c.id ? go({ folder: c.id }) : go({ view: "mine" }))}
          drop={drop}
          selected={selected}
          trash={trashView}
          onClearSelection={() => setSel(none())}
          bulk={{
            download: () => downloadItems(selected),
            move: () => setMoving(selected.map((i) => i.id)),
            copy: () => void (selected[0] && copyOf(selected[0])),
            star: (on) => void batch(selected.map((i) => i.id), on ? "star" : "unstar"),
            share: () => void (selected[0] && openShare(selected[0].id)),
            trash: () => void batch(selected.map((i) => i.id), "trash"),
            restore: () => void batch(selected.map((i) => i.id), "restore"),
            remove: () => void batch(selected.map((i) => i.id), "delete"),
          }}
          extra={
            <>
              {trashView && items.length && !selected.length ? (
                <Button size="sm" variant="ghost" onClick={() => setEmptyTrashOpen(true)}>
                  {t("Empty trash")}
                </Button>
              ) : null}
              {!desktop ? (
                <>
                  <Select value={loc.view ?? ""} onValueChange={(v) => go({ view: v as DriveView })}>
                    <SelectTrigger size="sm" className="max-w-36" aria-label={t("Drive views")}>
                      <SelectValue placeholder={t("Folder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(VIEW_LABELS) as DriveView[]).map((v) => (
                        <SelectItem key={v} value={v}>
                          {t(VIEW_LABELS[v])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="icon-sm" className="rounded-full" onClick={() => fileInput.current?.click()} aria-label={t("Upload")}>
                    <Upload />
                  </Button>
                  <AccountMenu user={props.account} canManage={props.canManage} compact />
                </>
              ) : null}
            </>
          }
        />
        <ActionMenu actions={backgroundActions}>
          <div
            ref={scroller}
            className={cn("relative min-h-0 flex-1 overflow-y-auto", loading && "opacity-60 transition-opacity")}
            onPointerDown={desktop ? marquee.onPointerDown : undefined}
            onDragOver={(e) => {
              if (!isFileDrag(e) || !canAddHere) return
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
            onDrop={(e) => {
              setDragging(false)
              if (!isFileDrag(e) || !canAddHere) return
              e.preventDefault()
              dropFiles(e.dataTransfer, target)
            }}
          >
            {sorted.length === 0 && !loading ? (
              <div className="grid h-full place-items-center p-6">{empty}</div>
            ) : prefs.layout === "grid" ? (
              <ItemGrid {...viewProps} />
            ) : (
              <ItemTable
                {...viewProps}
                sort={prefs.sort}
                dir={prefs.dir}
                onSort={(key) => setPrefs(prefs.sort === key ? { dir: prefs.dir === "asc" ? "desc" : "asc" } : { sort: key, dir: key === "name" || key === "owner" ? "asc" : "desc" })}
                allChecked={allChecked}
                onToggleAll={() => setSel(allChecked === true ? none() : { ids: new Set(order), anchor: order[0] ?? null })}
              />
            )}
            {marquee.rect ? (
              <div
                className="border-primary/60 bg-primary/10 pointer-events-none absolute z-20 rounded-sm border"
                style={{ left: marquee.rect.left, top: marquee.rect.top, width: marquee.rect.right - marquee.rect.left, height: marquee.rect.bottom - marquee.rect.top }}
              />
            ) : null}
            {dragging ? (
              <div className="border-primary bg-primary/5 pointer-events-none sticky inset-x-2 bottom-2 z-20 mx-2 grid place-items-center rounded-lg border-2 border-dashed py-6">
                <p className="bg-background rounded-md px-3 py-2 text-sm font-medium shadow-sm">{target && folder ? t("Drop to upload to {name}", { name: folder.name }) : t("Drop to upload to My drive")}</p>
              </div>
            ) : null}
          </div>
        </ActionMenu>
      </section>
      {wide ? (
        <SidePanel open={!!prefs.details} width={prefs.detailsWidth}>
          <ResizeHandle width={prefs.detailsWidth} onResize={(w) => setPrefs({ detailsWidth: w })} />
          {details}
        </SidePanel>
      ) : null}
      {!wide ? (
        <Sheet open={sheet && !!detailsId} onOpenChange={setSheet}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-md" showCloseButton={false}>
            <SheetTitle className="sr-only">{t("Details")}</SheetTitle>
            {details}
          </SheetContent>
        </Sheet>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void uploadFiles([...e.target.files].map((file) => ({ file, dirs: [] })), [], target)
          e.target.value = ""
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        {...{ webkitdirectory: "" }}
        onChange={(e) => {
          if (e.target.files) {
            const { files, folders } = inputEntries(e.target.files)
            void uploadFiles(files, folders, target)
          }
          e.target.value = ""
        }}
      />
      <NameDialog item={typeof naming === "object" ? naming : null} open={!!naming} onOpenChange={(o) => !o && setNaming(false)} onSave={saveName} />
      <DrivePicker
        open={!!moving}
        onOpenChange={(o) => !o && setMoving(null)}
        mode="folder"
        title={moving?.length === 1 ? t("Move \"{name}\"", { name: items.find((i) => i.id === moving[0])?.name ?? "" }) : t("Move {count} items", { count: moving?.length ?? 0 })}
        confirmLabel={t("Move here")}
        exclude={moving ?? undefined}
        onPick={async ({ folderId }) => {
          if (moving) await batch(moving, "move", folderId)
        }}
      />
      <QuickLook items={sorted} id={quickLook} onChange={(id) => (setQuickLook(id), setSel({ ids: new Set([id]), anchor: id }))} onClose={() => setQuickLook(null)} />
      {sharing ? (
        <ShareDialog
          note={sharing}
          endpoint={`/api/app/drive/items/${sharing.id}/share`}
          title={t("Share \"{name}\"", { name: sharing.name })}
          description={sharing.kind === "folder" ? t("People get access to everything in the folder, including what's added later.") : t("Choose who can open this file.")}
          open
          onOpenChange={(o) => !o && setSharing(null)}
          onSaved={() => changed(false)}
        >
          <PublicLinks itemId={sharing.id} />
        </ShareDialog>
      ) : null}
    </AppFrame>
  )
}

/** Drag the details panel's left edge to resize it. */
function ResizeHandle({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("Resize details")}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onResize(Math.min(560, width + 16))
        if (e.key === "ArrowRight") onResize(Math.max(260, width - 16))
      }}
      onPointerDown={(e) => {
        const start = e.clientX
        const move = (ev: PointerEvent) => onResize(Math.max(260, Math.min(560, width + start - ev.clientX)))
        const up = () => {
          window.removeEventListener("pointermove", move)
          window.removeEventListener("pointerup", up)
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", up)
      }}
      className="hover:bg-primary/30 focus-visible:bg-primary/40 absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize outline-none"
    />
  )
}

function NameDialog({ item, open, onOpenChange, onSave }: { item: DriveSummary | null; open: boolean; onOpenChange: (o: boolean) => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (!open) return
    setName(item?.name ?? "")
    // Select the name without its extension, as Finder does.
    requestAnimationFrame(() => {
      const n = item?.name ?? ""
      const dot = item?.kind === "file" && n.lastIndexOf(".") > 0 ? n.lastIndexOf(".") : n.length
      input.current?.setSelectionRange(0, dot)
    })
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
          <Input ref={input} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={item ? t("Name") : t("Folder name")} maxLength={200} aria-label={t("Name")} />
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
