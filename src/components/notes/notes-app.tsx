/**
 * /app/notes on the workspace kit (components/workspace, the same parts as Mail): the rail with views and folders,
 * the list with search, and the open note (components/notes/editor, synced live through the note's Durable Object).
 */
import * as React from "react"
import { tapllEvent } from "@/lib/tapll"
import {
  Archive,
  CalendarDays,
  ArchiveRestore,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Pencil,
  Folder,
  FolderPlus,
  Globe,
  Link2,
  Lock,
  MoreHorizontal,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  SearchX,
  Share2,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { ActionMenuButton, cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import { EmptyState } from "@/components/app/empty-state"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { shortDate } from "@/components/mailbox/message-view"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AppFrame } from "@/components/workspace/app-frame"
import { DetailHeader, IconAction } from "@/components/workspace/detail-header"
import { ListBody, ListEmpty, ListHeader, ListPane, ListRow, ListSearch } from "@/components/workspace/list-pane"
import { Rail, RailAction, RailItem, RailList, RailSection, RailSectionButton } from "@/components/workspace/rail"
import { SplitView } from "@/components/workspace/split-view"
import { foldAway, isTyping, Kbd, shortcutsPaused, useAppLayout, useMounted, WORKSPACE_COLORS } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import { clickSelect, type Selection } from "@/lib/drive/explorer"
import { msg, t } from "@/lib/i18n/panel"
import { PANEL_NAVIGATION, pushUrl, replaceUrl } from "@/lib/panel-history"
import type { Presence } from "./editor/note-editor"
import { ShareDialog } from "@/components/workspace/share-dialog"
import type { NoteDetail, NoteFolder, NoteSummary, NoteView, Sharing } from "./types"

// Plate and Yjs load only when a note is opened (and never during SSR).
const loadEditor = () => import("./editor/note-editor")
const NoteEditor = React.lazy(() => loadEditor().then((m) => ({ default: m.NoteEditor })))

export interface NotesAppProps {
  user: { id: string; name: string; email: string }
  notes: NoteSummary[]
  hasMore: boolean
  folders: NoteFolder[]
  selectedId: string | null
  canManage: boolean
  /** The signed-in person, for the account menu at the bottom of the rail. */
  account: MailUser
}

const VIEWS: { value: NoteView; label: string; icon: typeof FileText }[] = [
  { value: "all", label: msg("All notes"), icon: FileText },
  { value: "mine", label: msg("My notes"), icon: User },
  { value: "shared", label: msg("Shared with me"), icon: Users },
  { value: "pinned", label: msg("Pinned"), icon: Pin },
  { value: "archived", label: msg("notes|Archive"), icon: Archive },
]

/** Rows wear the sharing kind's colour, like mailboxes in Mail. */
const SHARING: Record<Sharing, { icon: typeof Lock; label: string; color: string }> = {
  private: { icon: Lock, label: msg("Only me"), color: "#9ca3af" },
  people: { icon: Users, label: msg("Shared with people"), color: WORKSPACE_COLORS[1] },
  team: { icon: Globe, label: msg("Everyone in the organization"), color: WORKSPACE_COLORS[0] },
}

export function NotesApp(props: NotesAppProps) {
  const [notes, setNotes] = React.useState(props.notes)
  const [hasMore, setHasMore] = React.useState(props.hasMore)
  const [folders, setFolders] = React.useState(props.folders)
  const [view, setView] = React.useState<NoteView>("all")
  const [folderId, setFolderId] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [selectedId, setSelectedId] = React.useState(props.selectedId)
  const [sel, setSel] = React.useState<Selection>({ ids: new Set(), anchor: null })
  const [loading, setLoading] = React.useState(false)
  /** Open for a new folder (true) or to rename one. */
  const [folderDialog, setFolderDialog] = React.useState<boolean | NoteFolder>(false)
  const [sharing, setSharing] = React.useState<NoteDetail | null>(null)
  /** Bumped after a change made from a menu, so the open note reloads its details. */
  const [detailVersion, setDetailVersion] = React.useState(0)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const mounted = useMounted()
  const { ref: frameRef, desktop } = useAppLayout()

  // Fetch the editor's code once the list is up, so opening a note doesn't wait for it.
  React.useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300))
    idle(() => void loadEditor())
  }, [])

  const listUrl = React.useCallback(
    (before?: string) => {
      const p = new URLSearchParams({ view })
      if (folderId) p.set("folderId", folderId)
      if (query.trim()) p.set("q", query.trim())
      if (before) p.set("before", String(new Date(before).getTime()))
      return `/api/app/notes?${p}`
    },
    [view, folderId, query],
  )

  const refresh = React.useCallback(async () => {
    try {
      const res = await api<{ notes: NoteSummary[]; hasMore: boolean }>("GET", listUrl())
      setNotes(res.notes)
      setHasMore(res.hasMore)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [listUrl])

  // Reload when the view, folder or search changes (search waits for typing to pause).
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

  // Titles and previews change as people type: keep the list fresh while the tab is visible.
  React.useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), 15_000)
    return () => clearInterval(timer)
  }, [refresh])

  async function loadMore() {
    const last = notes[notes.length - 1]
    if (!last) return
    const res = await api<{ notes: NoteSummary[]; hasMore: boolean }>("GET", listUrl(last.updatedAt))
    setNotes((list) => [...list, ...res.notes])
    setHasMore(res.hasMore)
  }

  const open = React.useCallback((id: string | null) => {
    setSelectedId(id)
    const url = new URL(location.href)
    url.pathname = id ? `/app/notes/${id}` : "/app/notes"
    pushUrl(url)
  }, [])

  React.useEffect(() => {
    const onPop = () => setSelectedId(/^\/app\/notes\/([0-9a-f-]{36})/.exec(location.pathname)?.[1] ?? null)
    window.addEventListener(PANEL_NAVIGATION, onPop)
    return () => window.removeEventListener(PANEL_NAVIGATION, onPop)
  }, [])

  const createNote = React.useCallback(async (inFolder?: string) => {
    tapllEvent("note_creation_started")
    try {
      const note = await api<NoteDetail>("POST", "/api/app/notes", { folderId: inFolder ?? folderId })
      tapllEvent("note_created")
      if (view === "archived" || view === "shared" || view === "pinned") setView("all")
      setNotes((list) => [note, ...list])
      open(note.id)
    } catch (e) {
      tapllEvent("note_creation_failed", { reason: "request_failed" })
      toast.error((e as Error).message)
    }
  }, [folderId, view, open])

  const readAction = React.useEffectEvent(() => {
    const url = new URL(location.href)
    if (url.searchParams.get("new") !== "1") return
    url.searchParams.delete("new")
    replaceUrl(url)
    void createNote()
  })
  React.useEffect(() => {
    readAction()
    const read = () => readAction()
    window.addEventListener(PANEL_NAVIGATION, read)
    return () => window.removeEventListener(PANEL_NAVIGATION, read)
  }, [])

  // The selection only keeps notes still in the list (view, folder or search changed).
  const picked = notes.filter((n) => sel.ids.has(n.id))
  const clearSel = React.useCallback(() => setSel({ ids: new Set(), anchor: null }), [])

  // Shortcuts, as in Mail: c new note, / search, x select, ⌘A select all, Esc clears the selection, then closes the note.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘A selects the list unless the editor, a field or a dialog has the keys.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !e.defaultPrevented && !isTyping(e.target) && !document.querySelector("[role=dialog][data-state=open], [role=alertdialog], [role=menu]")) {
        e.preventDefault()
        setSel({ ids: new Set(notes.map((n) => n.id)), anchor: notes[0]?.id ?? null })
        return
      }
      if (shortcutsPaused(e)) return
      if (e.key === "x" && selectedId) {
        setSel((cur) => clickSelect(cur, notes.map((n) => n.id), selectedId, { meta: true }))
      } else if (e.key === "Escape" && picked.length) clearSel()
      else if (e.key === "c") {
        e.preventDefault()
        void createNote()
      } else if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === "Escape" && selectedId) open(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [createNote, open, selectedId, notes, picked.length, clearSel])

  function pickView(v: NoteView) {
    setView(v)
    setFolderId(null)
  }

  async function saveFolder(name: string) {
    try {
      if (typeof folderDialog === "object") {
        const folder = await api<NoteFolder>("PATCH", `/api/app/notes/folders/${folderDialog.id}`, { name })
        setFolders((list) => list.map((f) => (f.id === folder.id ? folder : f)).sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        const folder = await api<NoteFolder>("POST", "/api/app/notes/folders", { name })
        setFolders((list) => [...list, folder].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setFolderDialog(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function removeFolder(folder: NoteFolder) {
    try {
      await api("DELETE", `/api/app/notes/folders/${folder.id}`)
      setFolders((list) => list.filter((f) => f.id !== folder.id))
      if (folderId === folder.id) setFolderId(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const onChanged = React.useCallback((note: NoteDetail | null, id: string) => {
    if (!note) foldAway([id], () => setNotes((list) => list.filter((n) => n.id !== id)))
    else setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, ...note } : n)))
  }, [])

  async function patchNote(id: string, body: Record<string, unknown>, done?: string) {
    try {
      const saved = await api<NoteDetail>("PATCH", `/api/app/notes/${id}`, body)
      onChanged(saved, id)
      setDetailVersion((v) => v + 1)
      if (done) toast.success(done)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function deleteNote(id: string) {
    try {
      await api("DELETE", `/api/app/notes/${id}`)
      onChanged(null, id)
      if (selectedId === id) open(null)
      toast.success(t("Note deleted"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function copy(text: string | Promise<string>, done: string) {
    try {
      await navigator.clipboard.writeText(await text)
      toast.success(done)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function openShare(id: string) {
    try {
      setSharing(await api<NoteDetail>("GET", `/api/app/notes/${id}`))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // shortcut: one request per note, add a batch route if people select hundreds
  async function bulk(list: NoteSummary[], run: (n: NoteSummary) => Promise<void>, done: string) {
    const id = toast.loading(t("Updating {n} notes…", { n: list.length }))
    const failed: string[] = []
    for (const n of list) {
      try { await run(n) } catch (e) { failed.push(`${n.title || t("Untitled")}: ${(e as Error).message}`) }
    }
    setDetailVersion((v) => v + 1)
    if (failed.length) toast.error(t("{n} of {m} notes not changed", { n: failed.length, m: list.length }), { id, description: failed.join("\n"), duration: 0 })
    else toast.success(done, { id })
    clearSel()
  }
  const patchMany = (list: NoteSummary[], body: Record<string, unknown>, done: string) =>
    bulk(list, async (n) => onChanged(await api<NoteDetail>("PATCH", `/api/app/notes/${n.id}`, body), n.id), done)
  const deleteMany = (list: NoteSummary[]) =>
    bulk(list, async (n) => {
      await api("DELETE", `/api/app/notes/${n.id}`)
      onChanged(null, n.id)
      if (selectedId === n.id) open(null)
    }, t("Notes deleted: {n}", { n: list.length }))

  const canEdit = (n: NoteSummary) => n.role !== "view" && !n.archived
  // Owners of the note, and owners/admins for team notes (the server checks again).
  const canManage = (n: NoteSummary) => n.role === "owner" || (n.sharing === "team" && props.canManage)

  /** Actions on several notes: offered only when the viewer may do them on every one. */
  const bulkActions = (list: NoteSummary[]): MenuAction[] => {
    const n = list.length
    const editable = list.every(canEdit)
    const manage = list.every(canManage)
    const archived = list.every((x) => x.archived)
    const active = list.every((x) => !x.archived)
    const pinned = list.every((x) => x.pinned)
    return cleanActions([
      editable && { label: pinned ? t("Unpin {n} notes", { n }) : t("Pin {n} notes", { n }), icon: pinned ? PinOff : Pin, onSelect: () => patchMany(list, { pinned: !pinned }, pinned ? t("Unpinned: {n}", { n }) : t("Pinned: {n}", { n })) },
      editable && {
        label: t("Move to folder"),
        icon: Folder,
        items: [
          { label: t("No folder"), onSelect: () => patchMany(list, { folderId: null }, t("Moved: {n}", { n })) },
          ...folders.map((f) => ({ label: f.name, icon: Folder, onSelect: () => patchMany(list, { folderId: f.id }, t("Moved: {n}", { n })) })),
        ],
      },
      { separator: true },
      manage && active && { label: t("Archive {n} notes", { n }), icon: Archive, onSelect: () => patchMany(list, { archived: true }, t("Notes archived: {n}", { n })) },
      manage && archived && { label: t("Restore {n} notes", { n }), icon: ArchiveRestore, onSelect: () => patchMany(list, { archived: false }, t("Notes restored: {n}", { n })) },
      manage &&
        archived && {
          label: t("Delete {n} notes for good", { n }),
          icon: Trash2,
          destructive: true,
          confirm: { title: t("Delete {n} notes for good?", { n }), description: t("They can't be restored afterwards."), confirmLabel: t("Delete") },
          onSelect: () => deleteMany(list),
        },
    ])
  }

  /** A note's actions: the row's right-click menu and "…", and the "…" in the open note's header. */
  const noteActions = (n: NoteSummary, where: "list" | "detail"): MenuAction[] => {
    if (where === "list" && picked.length > 1 && sel.ids.has(n.id)) return bulkActions(picked)
    const editable = canEdit(n)
    const manage = canManage(n)
    return cleanActions([
      where === "list" && { label: t("Open"), icon: FileText, onSelect: () => open(n.id) },
      { label: t("Open in new tab"), icon: ExternalLink, onSelect: () => void window.open(`/app/notes/${n.id}`, "_blank") },
      { separator: true },
      editable && { label: n.pinned ? t("Unpin") : t("Pin"), icon: n.pinned ? PinOff : Pin, onSelect: () => patchNote(n.id, { pinned: !n.pinned }) },
      editable && {
        label: t("Move to folder"),
        icon: Folder,
        items: [
          { label: n.folderId ? t("No folder") : `✓ ${t("No folder")}`, onSelect: () => patchNote(n.id, { folderId: null }) },
          ...folders.map((f) => ({ label: n.folderId === f.id ? `✓ ${f.name}` : f.name, icon: Folder, onSelect: () => patchNote(n.id, { folderId: f.id }) })),
        ],
      },
      manage && !n.archived && { label: t("Share…"), icon: Share2, onSelect: () => openShare(n.id) },
      { separator: true },
      { label: t("Copy link"), icon: Link2, onSelect: () => copy(`${location.origin}/app/notes/${n.id}`, t("Link copied")) },
      {
        label: t("Copy as Markdown"),
        icon: Copy,
        onSelect: () => copy(api<NoteDetail>("GET", `/api/app/notes/${n.id}`).then((d) => d.markdown), t("Copied as Markdown")),
      },
      { separator: true },
      manage && !n.archived && { label: t("Archive"), icon: Archive, onSelect: () => patchNote(n.id, { archived: true }, t("Note archived")) },
      manage && n.archived && { label: t("Restore"), icon: ArchiveRestore, onSelect: () => patchNote(n.id, { archived: false }, t("Note restored")) },
      manage &&
        n.archived && {
          label: t("Delete for good"),
          icon: Trash2,
          destructive: true,
          confirm: { title: t("Delete this note for good?"), description: t("It can't be restored afterwards."), confirmLabel: t("Delete") },
          onSelect: () => deleteNote(n.id),
        },
    ])
  }

  const folderActions = (f: NoteFolder): MenuAction[] =>
    cleanActions([
      { label: t("Open"), icon: FolderOpen, onSelect: () => (setFolderId(f.id), setView("all")) },
      { label: t("New note in this folder"), icon: Plus, onSelect: () => createNote(f.id) },
      { separator: true },
      { label: t("Rename…"), icon: Pencil, onSelect: () => setFolderDialog(f) },
      props.canManage && {
        label: t("Delete folder"),
        icon: Trash2,
        destructive: true,
        confirm: { title: t("Delete the folder \"{name}\"?", { name: f.name }), description: t("Its notes stay, without a folder."), confirmLabel: t("Delete folder") },
        onSelect: () => removeFolder(f),
      },
    ])

  const folder = folders.find((f) => f.id === folderId)
  const viewMeta = VIEWS.find((v) => v.value === view)!
  const title = query ? t("Search") : folder ? folder.name : t(viewMeta.label)
  const pinnedCount = view === "all" && !folderId && !query ? notes.filter((n) => n.pinned).length : 0

  const rail = (
    <Rail
      label={t("Notes")}
      hint={
        <>
          <Kbd>C</Kbd> {t("New note")} <Kbd>/</Kbd> {t("Search")}
        </>
      }
      footer={<AccountMenu user={props.account} canManage={props.canManage} />}
    >
      <RailAction icon={Plus} label={t("New note")} shortcut="C" onClick={() => createNote()} />
      <RailList>
        {VIEWS.map(({ value, label, icon }) => (
          <RailItem
            key={value}
            icon={icon}
            label={t(label)}
            active={view === value && !folderId}
            count={value === "pinned" ? pinnedCount : undefined}
            onClick={() => pickView(value)}
          />
        ))}
      </RailList>
      <RailSection
        title={t("Folders")}
        action={
          <RailSectionButton label={t("New folder")} onClick={() => setFolderDialog(true)}>
            <FolderPlus />
          </RailSectionButton>
        }
      >
        {folders.length ? (
          <RailList>
            {folders.map((f) => (
              <RailItem
                key={f.id}
                icon={Folder}
                label={f.name}
                title={f.name}
                active={folderId === f.id}
                onClick={() => {
                  setFolderId(f.id)
                  setView("all")
                }}
                actions={() => folderActions(f)}
              />
            ))}
          </RailList>
        ) : (
          <p className="text-muted-foreground px-2 text-xs">{t("No folders yet.")}</p>
        )}
      </RailSection>
    </Rail>
  )

  const list = (
    <ListPane label={t("Notes")}>
      <ListHeader
        title={title}
        subtitle={query ? undefined : folder ? t("Folder") : undefined}
        loading={loading}
        actions={
          desktop ? undefined : (
            <>
              <Select
                value={folderId ? `f:${folderId}` : view}
                onValueChange={(v) => {
                  if (v.startsWith("f:")) {
                    setFolderId(v.slice(2))
                    setView("all")
                  } else pickView(v as NoteView)
                }}
              >
                <SelectTrigger size="sm" className="max-w-36" aria-label={t("Notes views")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIEWS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {t(v.label)}
                    </SelectItem>
                  ))}
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={`f:${f.id}`}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => createNote()}>
                <NotebookPen /> {t("New")}
              </Button>
              <AccountMenu user={props.account} canManage={props.canManage} compact />
            </>
          )
        }
      >
        {picked.length ? (
          <div className="flex h-8 items-center gap-1 px-1">
            <span className="mr-auto min-w-0 truncate text-sm font-medium tabular-nums">{t("{n} selected", { n: picked.length })}</span>
            <ActionMenuButton actions={() => bulkActions(picked)} label={t("Note actions")} size="icon-sm" />
            <Button variant="ghost" size="icon-sm" onClick={clearSel} aria-label={t("Clear selection")} title={t("Clear selection")}>
              <X />
            </Button>
          </div>
        ) : (
          <ListSearch ref={searchRef} value={query} onChange={setQuery} placeholder={t("Search notes")} />
        )}
      </ListHeader>
      <ListBody dimmed={loading}>
        {notes.map((n) => {
          const share = SHARING[n.sharing]
          return (
            <ListRow
              key={n.id}
              rowId={n.id}
              color={share.color}
              selected={picked.length ? sel.ids.has(n.id) : selectedId === n.id}
              title={n.title || t("Untitled")}
              meta={
                <>
                  {n.pinned ? <Pin className="text-muted-foreground size-3" aria-label={t("Pinned")} /> : null}
                  <share.icon className="text-muted-foreground size-3" aria-label={t(share.label)} />
                </>
              }
              time={mounted ? shortDate(n.updatedAt) : null}
              snippet={previewWithoutTitle(n) || t("Empty note")}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                  // The open note joins the selection, as in Finder and Drive.
                  const base = !sel.ids.size && selectedId ? { ids: new Set([selectedId]), anchor: selectedId } : sel
                  setSel(clickSelect(base, notes.map((x) => x.id), n.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey }))
                } else {
                  setSel({ ids: new Set(), anchor: n.id })
                  open(n.id)
                }
              }}
              actions={() => noteActions(n, "list")}
              menuLabel={t("Note actions")}
            />
          )
        })}
        {notes.length === 0 && !loading ? (
          <ListEmpty
            icon={query ? <SearchX /> : view === "archived" ? <Archive /> : <FileText />}
            title={query ? t("Nothing matches that search") : view === "archived" ? t("Nothing archived") : t("No notes here yet")}
            action={
              !query && view !== "archived" ? (
                <Button size="sm" variant="outline" onClick={() => createNote()}>
                  <Plus /> {t("New note")}
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {hasMore ? (
          <li className="p-3 text-center">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading}>
              {t("Load more")}
            </Button>
          </li>
        ) : null}
      </ListBody>
    </ListPane>
  )

  const detail = selectedId ? (
    <NotePane
      key={selectedId}
      id={selectedId}
      version={detailVersion}
      user={props.user}
      onBack={() => open(null)}
      actions={(n) => noteActions(n, "detail")}
      onPatch={(body, done) => patchNote(selectedId, body, done)}
      onShare={() => openShare(selectedId)}
    />
  ) : (
    <div className="grid h-full place-items-center p-6">
      <EmptyState
        variant="plain" density="dense"
        icon={<FileText />}
        title={t("No note open")}
        description={
          <>
            {t("Pick one on the left, or press")} <kbd className="bg-muted rounded px-1 font-mono text-xs">C</kbd> {t("for a new note.")}
          </>
        }
      />
    </div>
  )

  return (
    <AppFrame ref={frameRef}>
      {desktop ? rail : null}
      <SplitView list={list} detail={detail} showDetail={!!selectedId} />
      <FolderDialog folder={typeof folderDialog === "object" ? folderDialog : null} open={!!folderDialog} onOpenChange={(o) => !o && setFolderDialog(false)} onSave={saveFolder} />
      {sharing ? (
        <ShareDialog
          note={sharing}
          endpoint={`/api/app/notes/${sharing.id}/share`}
          title={t("Share note")}
          description={t("People who can open the note see changes as they happen.")}
          open
          onOpenChange={(o) => !o && setSharing(null)}
          onSaved={(n) => {
            onChanged(n, n.id)
            setDetailVersion((v) => v + 1)
          }}
        />
      ) : null}
    </AppFrame>
  )
}

function previewWithoutTitle(n: NoteSummary) {
  const lines = n.preview.split("\n")
  return (lines[0]?.trim() === n.title.trim() ? lines.slice(1) : lines).join(" ").trim()
}

function FolderDialog({ folder, open, onOpenChange, onSave }: { folder: NoteFolder | null; open: boolean; onOpenChange: (o: boolean) => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (open) setName(folder?.name ?? "")
  }, [open, folder])
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
            <DialogTitle>{folder ? t("Rename folder") : t("New folder")}</DialogTitle>
            <DialogDescription>{t("Folders are shared by the whole organization; each note keeps its own sharing.")}</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Folder name")} maxLength={80} aria-label={t("Folder name")} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {folder ? t("Save") : t("Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NotePane({
  id,
  version,
  user,
  onBack,
  actions,
  onPatch,
  onShare,
}: {
  id: string
  /** Changes after a menu action, so the details reload. */
  version: number
  user: { id: string; name: string }
  onBack: () => void
  actions: (note: NoteDetail) => MenuAction[]
  onPatch: (body: Record<string, unknown>, done?: string) => Promise<void>
  onShare: () => void
}) {
  const [note, setNote] = React.useState<NoteDetail | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [presence, setPresence] = React.useState<Presence[]>([])
  const [lost, setLost] = React.useState(false)
  // The editor is browser-only (Yjs over a WebSocket): rendering it on the server never finishes the stream.
  const mounted = useMounted()

  React.useEffect(() => {
    let live = true
    api<NoteDetail>("GET", `/api/app/notes/${id}`)
      .then((n) => live && (setNote(n), setError(null)))
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [id, version])

  const initial = React.useMemo(() => (note && note.id === id ? { title: note.title, value: note.value } : undefined), [note, id])

  if (error || lost)
    return (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          variant="plain"
          icon={<Lock />}
          title={lost ? t("You can no longer open this note") : t("This note can't be opened")}
          description={lost ? undefined : error}
          action={
            <Button size="sm" variant="outline" onClick={onBack}>
              {t("Back to notes")}
            </Button>
          }
        />
      </div>
    )

  const share = note ? SHARING[note.sharing] : null
  const editable = !!note && note.role !== "view" && !note.archived
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <DetailHeader onBack={onBack} backLabel={t("Back to notes")}>
        {note && share ? (
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 px-1 text-xs">
            <share.icon className="size-3.5 shrink-0" style={{ color: share.color }} />
            <span className="truncate">{t(share.label)}</span>
            {note.archived && <span className="bg-muted rounded px-1.5 py-0.5 font-medium">{t("Archived")}</span>}
            {note.role === "view" && !note.archived && <span className="bg-muted rounded px-1.5 py-0.5 font-medium">{t("View only")}</span>}
          </span>
        ) : null}
        {note?.meeting ? (
          <a
            href={`/app/calendar?event=${note.meeting.event}`}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs"
            title={t("Open the meeting in the calendar")}
          >
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="truncate">{note.meeting.title || t("Meeting")}</span>
          </a>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          <PresenceStack people={presence} />
          {note && editable ? (
            <IconAction label={note.pinned ? t("Unpin") : t("Pin")} onClick={() => onPatch({ pinned: !note.pinned })}>
              {note.pinned ? <PinOff /> : <Pin />}
            </IconAction>
          ) : null}
          {note?.canManage && !note.archived ? (
            <IconAction label={t("Archive")} onClick={() => onPatch({ archived: true }, t("Note archived"))}>
              <Archive />
            </IconAction>
          ) : null}
          {note?.canManage && note.archived ? (
            <IconAction label={t("Restore")} onClick={() => onPatch({ archived: false }, t("Note restored"))}>
              <ArchiveRestore />
            </IconAction>
          ) : null}
          {note ? <ActionMenuButton actions={() => actions(note)} label={t("More")} size="icon-sm" /> : null}
          {note?.canManage && !note.archived ? (
            <Button size="sm" variant="outline" className="ml-1" onClick={onShare}>
              <Share2 />
              {t("Share")}
            </Button>
          ) : null}
        </div>
      </DetailHeader>
      <div className="min-h-0 flex-1">
        {mounted ? (
          <React.Suspense fallback={<EditorSkeleton toolbar={!note || editable} />}>
            <NoteEditor
              noteId={id}
              user={user}
              initial={initial}
              editable={note && note.id === id ? editable : undefined}
              onPresence={setPresence}
              onLost={() => setLost(true)}
            />
          </React.Suspense>
        ) : (
          <EditorSkeleton toolbar={!note || editable} />
        )}
      </div>
    </section>
  )
}

function PresenceStack({ people }: { people: Presence[] }) {
  if (!people.length) return null
  const shown = people.slice(0, 4)
  return (
    <div className="mr-1.5 flex -space-x-1.5" aria-label={t("Also here: {names}", { names: people.map((p) => p.name).join(", ") })}>
      {shown.map((p) => (
        <span
          key={p.clientId}
          title={p.name}
          className="border-background grid size-6 place-items-center rounded-full border-2 text-[10px] font-medium text-white"
          style={{ background: p.color }}
        >
          {initials(p.name)}
        </span>
      ))}
      {people.length > shown.length ? (
        <span className="border-background bg-muted grid size-6 place-items-center rounded-full border-2 text-[10px] font-medium">+{people.length - shown.length}</span>
      ) : null}
    </div>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")

function EditorSkeleton({ toolbar }: { toolbar: boolean }) {
  return (
    <div aria-hidden>
      {/* Same height as FixedToolbar (h-8 buttons + py-1 + border), so the note doesn't move when it mounts. */}
      {toolbar && <div className="h-[41px] border-b" />}
      <div className="mx-auto grid max-w-3xl gap-3 px-6 py-8 sm:px-12">
        <div className="bg-muted h-9 w-2/3 animate-pulse rounded-md" />
        <div className="bg-muted h-4 w-full animate-pulse rounded" />
        <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
        <div className="bg-muted h-4 w-4/6 animate-pulse rounded" />
      </div>
    </div>
  )
}
