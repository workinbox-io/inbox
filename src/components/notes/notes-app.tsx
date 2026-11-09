/**
 * /app/notes on the workspace kit (components/workspace, the same parts as Mail): the rail with views and folders,
 * the list with search, and the open note (components/notes/editor, synced live through the note's Durable Object).
 * The user view (members, and owners/admins who pick it) is full screen; the admin view sits in the dashboard.
 */
import * as React from "react"
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileText,
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
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmButton } from "@/components/app/confirm-button"
import { EmptyState } from "@/components/app/empty-state"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { shortDate } from "@/components/mailbox/message-view"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AppFrame } from "@/components/workspace/app-frame"
import { DetailHeader, IconAction } from "@/components/workspace/detail-header"
import { ListBody, ListEmpty, ListHeader, ListPane, ListRow, ListSearch } from "@/components/workspace/list-pane"
import { Rail, RailAction, RailItem, RailList, RailSection, RailSectionButton } from "@/components/workspace/rail"
import { SplitView } from "@/components/workspace/split-view"
import { isTyping, Kbd, useMediaQuery, useMounted, WORKSPACE_COLORS } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { pushUrl, replaceUrl } from "@/lib/panel-history"
import { cn } from "@/lib/utils"
import type { Presence } from "./editor/note-editor"
import { ShareDialog } from "./share-dialog"
import type { NoteDetail, NoteFolder, NoteSummary, NoteView, Sharing } from "./types"

// Plate and Yjs load only when a note is opened (and never during SSR).
const NoteEditor = React.lazy(() => import("./editor/note-editor").then((m) => ({ default: m.NoteEditor })))

export interface NotesAppProps {
  user: { id: string; name: string; email: string }
  notes: NoteSummary[]
  hasMore: boolean
  folders: NoteFolder[]
  selectedId: string | null
  canManage: boolean
  /** The user view: full screen, the account menu at the bottom of the rail. */
  account?: MailUser
}

const VIEWS: { value: NoteView; label: string; icon: typeof FileText }[] = [
  { value: "all", label: "All notes", icon: FileText },
  { value: "mine", label: "My notes", icon: User },
  { value: "shared", label: "Shared with me", icon: Users },
  { value: "pinned", label: "Pinned", icon: Pin },
  { value: "archived", label: "Archive", icon: Archive },
]

/** Rows wear the sharing kind's colour, like mailboxes in Mail. */
const SHARING: Record<Sharing, { icon: typeof Lock; label: string; color: string }> = {
  private: { icon: Lock, label: "Only me", color: "#9ca3af" },
  people: { icon: Users, label: "Shared with people", color: WORKSPACE_COLORS[1] },
  team: { icon: Globe, label: "Everyone in the organization", color: WORKSPACE_COLORS[0] },
}

export function NotesApp(props: NotesAppProps) {
  const [notes, setNotes] = React.useState(props.notes)
  const [hasMore, setHasMore] = React.useState(props.hasMore)
  const [folders, setFolders] = React.useState(props.folders)
  const [view, setView] = React.useState<NoteView>("all")
  const [folderId, setFolderId] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [selectedId, setSelectedId] = React.useState(props.selectedId)
  const [loading, setLoading] = React.useState(false)
  const [folderDialog, setFolderDialog] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const mounted = useMounted()
  const desktop = useMediaQuery("(min-width: 768px)")
  const userView = !!props.account

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
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const createNote = React.useCallback(async () => {
    try {
      const note = await api<NoteDetail>("POST", "/api/app/notes", { folderId })
      if (view === "archived" || view === "shared" || view === "pinned") setView("all")
      setNotes((list) => [note, ...list])
      open(note.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [folderId, view, open])

  // "New note" from the command palette (/app/notes?new=1).
  React.useEffect(() => {
    const url = new URL(location.href)
    if (url.searchParams.get("new") !== "1") return
    url.searchParams.delete("new")
    replaceUrl(url)
    void createNote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Shortcuts, as in Mail: c new note, / search, Esc closes the note.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return
      if (e.key === "c") {
        e.preventDefault()
        void createNote()
      } else if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === "Escape" && selectedId) open(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [createNote, open, selectedId])

  function pickView(v: NoteView) {
    setView(v)
    setFolderId(null)
  }

  async function addFolder(name: string) {
    try {
      const folder = await api<NoteFolder>("POST", "/api/app/notes/folders", { name })
      setFolders((list) => [...list, folder].sort((a, b) => a.name.localeCompare(b.name)))
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
    if (!note) setNotes((list) => list.filter((n) => n.id !== id))
    else setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, ...note } : n)))
  }, [])

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
      footer={props.account ? <AccountMenu user={props.account} canManage={props.canManage} /> : undefined}
    >
      <RailAction icon={Plus} label={t("New note")} shortcut="C" onClick={createNote} />
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
                trailing={
                  props.canManage ? (
                    <ConfirmButton
                      title={t("Delete the folder \"{name}\"?", { name: f.name })}
                      description={t("Its notes stay, without a folder.")}
                      confirmLabel={t("Delete folder")}
                      onConfirm={() => removeFolder(f)}
                    >
                      <button type="button" className="text-muted-foreground hover:text-destructive rounded p-0.5" aria-label={t("Delete folder")}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </ConfirmButton>
                  ) : null
                }
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
              <Button size="sm" className="rounded-full" onClick={createNote}>
                <NotebookPen /> {t("New")}
              </Button>
              {props.account ? <AccountMenu user={props.account} canManage={props.canManage} compact /> : null}
            </>
          )
        }
      >
        <ListSearch ref={searchRef} value={query} onChange={setQuery} placeholder={t("Search notes")} />
      </ListHeader>
      <ListBody dimmed={loading}>
        {notes.map((n) => {
          const share = SHARING[n.sharing]
          return (
            <ListRow
              key={n.id}
              color={share.color}
              selected={selectedId === n.id}
              title={n.title || t("Untitled")}
              meta={
                <>
                  {n.pinned ? <Pin className="text-muted-foreground size-3" aria-label={t("Pinned")} /> : null}
                  <share.icon className="text-muted-foreground size-3" aria-label={t(share.label)} />
                </>
              }
              time={mounted ? shortDate(n.updatedAt) : null}
              snippet={previewWithoutTitle(n) || t("Empty note")}
              onClick={() => open(n.id)}
            />
          )
        })}
        {notes.length === 0 && !loading ? (
          <ListEmpty
            icon={query ? <SearchX /> : view === "archived" ? <Archive /> : <FileText />}
            title={query ? t("Nothing matches that search") : view === "archived" ? t("Nothing archived") : t("No notes here yet")}
            action={
              !query && view !== "archived" ? (
                <Button size="sm" variant="outline" onClick={createNote}>
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
    <NotePane key={selectedId} id={selectedId} user={props.user} folders={folders} onBack={() => open(null)} onChanged={onChanged} />
  ) : (
    <div className="grid h-full place-items-center p-6">
      <EmptyState
        variant="plain"
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
    <AppFrame userView={userView}>
      {desktop ? rail : null}
      <SplitView list={list} detail={detail} showDetail={!!selectedId} />
      <FolderDialog open={folderDialog} onOpenChange={setFolderDialog} onCreate={addFolder} />
    </AppFrame>
  )
}

function previewWithoutTitle(n: NoteSummary) {
  const lines = n.preview.split("\n")
  return (lines[0]?.trim() === n.title.trim() ? lines.slice(1) : lines).join(" ").trim()
}

function FolderDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (open) setName("")
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim()) return
            setSaving(true)
            await onCreate(name.trim())
            setSaving(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("New folder")}</DialogTitle>
            <DialogDescription>{t("Folders are shared by the whole organization; each note keeps its own sharing.")}</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Folder name")} maxLength={80} aria-label={t("Folder name")} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {t("Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NotePane({
  id,
  user,
  folders,
  onBack,
  onChanged,
}: {
  id: string
  user: { id: string; name: string }
  folders: NoteFolder[]
  onBack: () => void
  onChanged: (note: NoteDetail | null, id: string) => void
}) {
  const [note, setNote] = React.useState<NoteDetail | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [presence, setPresence] = React.useState<Presence[]>([])
  const [shareOpen, setShareOpen] = React.useState(false)
  const [lost, setLost] = React.useState(false)

  React.useEffect(() => {
    let live = true
    api<NoteDetail>("GET", `/api/app/notes/${id}`)
      .then((n) => live && (setNote(n), setError(null)))
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [id])

  async function patch(body: Record<string, unknown>, done?: string) {
    try {
      const saved = await api<NoteDetail>("PATCH", `/api/app/notes/${id}`, body)
      setNote(saved)
      onChanged(saved, id)
      if (done) toast.success(done)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function remove() {
    try {
      await api("DELETE", `/api/app/notes/${id}`)
      onChanged(null, id)
      onBack()
      toast.success(t("Note deleted"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function copy(text: string, done: string) {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  }

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
        <div className="ml-auto flex items-center gap-0.5">
          <PresenceStack people={presence} />
          {note && editable ? (
            <IconAction label={note.pinned ? t("Unpin") : t("Pin")} onClick={() => patch({ pinned: !note.pinned })}>
              {note.pinned ? <PinOff /> : <Pin />}
            </IconAction>
          ) : null}
          {note?.canManage && !note.archived ? (
            <IconAction label={t("Archive")} onClick={() => patch({ archived: true }, t("Note archived"))}>
              <Archive />
            </IconAction>
          ) : null}
          {note?.canManage && note.archived ? (
            <>
              <IconAction label={t("Restore")} onClick={() => patch({ archived: false }, t("Note restored"))}>
                <ArchiveRestore />
              </IconAction>
              <ConfirmButton title={t("Delete this note for good?")} description={t("It can't be restored afterwards.")} confirmLabel={t("Delete")} onConfirm={remove}>
                <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={t("Delete for good")} title={t("Delete for good")}>
                  <Trash2 />
                </Button>
              </ConfirmButton>
            </>
          ) : null}
          {note ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={t("More")}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {editable ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Folder />
                      {t("Move to folder")}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onSelect={() => patch({ folderId: null })}>{t("No folder")}</DropdownMenuItem>
                      {folders.map((f) => (
                        <DropdownMenuItem key={f.id} onSelect={() => patch({ folderId: f.id })} className={cn(note.folderId === f.id && "font-medium")}>
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                <DropdownMenuItem onSelect={() => copy(`${location.origin}/app/notes/${id}`, t("Link copied"))}>
                  <Link2 />
                  {t("Copy link")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    const fresh = await api<NoteDetail>("GET", `/api/app/notes/${id}`)
                    await copy(fresh.markdown, t("Copied as Markdown"))
                  }}
                >
                  <Copy />
                  {t("Copy as Markdown")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {note?.canManage && !note.archived ? (
            <Button size="sm" variant="outline" className="ml-1" onClick={() => setShareOpen(true)}>
              <Share2 />
              {t("Share")}
            </Button>
          ) : null}
        </div>
      </DetailHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 sm:px-12">
          <React.Suspense fallback={<EditorSkeleton />}>
            <NoteEditor noteId={id} user={user} onPresence={setPresence} onLost={() => setLost(true)} />
          </React.Suspense>
        </div>
      </div>
      {note ? (
        <ShareDialog
          note={note}
          open={shareOpen}
          onOpenChange={setShareOpen}
          onSaved={(n) => {
            setNote(n)
            onChanged(n, id)
          }}
        />
      ) : null}
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

function EditorSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden>
      <div className="bg-muted h-9 w-2/3 animate-pulse rounded-md" />
      <div className="bg-muted h-4 w-full animate-pulse rounded" />
      <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
      <div className="bg-muted h-4 w-4/6 animate-pulse rounded" />
    </div>
  )
}
