/**
 * /app/notes: views and folders, the list with search, and the open note (components/notes/editor, synced
 * live through the note's Durable Object). Members get it full screen (MailLayout), owners and admins inside
 * the dashboard.
 */
import * as React from "react"
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Copy,
  FileText,
  Folder,
  FolderPlus,
  Globe,
  Inbox,
  Link2,
  Lock,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
  Share2,
  Trash2,
  User,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api-client"
import { timeAgo } from "@/lib/format"
import { t } from "@/lib/i18n/panel"
import { pushUrl, replaceUrl } from "@/lib/panel-history"
import { cn } from "@/lib/utils"
import type { Presence } from "./editor/note-editor"
import { ShareDialog } from "./share-dialog"
import type { NoteDetail, NoteFolder, NoteSummary, NoteView } from "./types"

// Plate and Yjs load only when a note is opened (and never during SSR).
const NoteEditor = React.lazy(() => import("./editor/note-editor").then((m) => ({ default: m.NoteEditor })))

export interface NotesAppProps {
  user: { id: string; name: string; email: string }
  notes: NoteSummary[]
  hasMore: boolean
  folders: NoteFolder[]
  selectedId: string | null
  canManage: boolean
  /** Members' full-screen view: the account menu sits in the sidebar. */
  account?: MailUser
}

const VIEWS: { value: NoteView; label: string; icon: typeof Inbox }[] = [
  { value: "all", label: "All notes", icon: FileText },
  { value: "mine", label: "My notes", icon: User },
  { value: "shared", label: "Shared with me", icon: Users },
  { value: "pinned", label: "Pinned", icon: Pin },
  { value: "archived", label: "Archive", icon: Archive },
]

const sharingIcon = { private: Lock, people: Users, team: Globe }
const sharingLabel = { private: "Only me", people: "Shared with people", team: "Everyone in the organization" }

export function NotesApp(props: NotesAppProps) {
  const [notes, setNotes] = React.useState(props.notes)
  const [hasMore, setHasMore] = React.useState(props.hasMore)
  const [folders, setFolders] = React.useState(props.folders)
  const [view, setView] = React.useState<NoteView>("all")
  const [folderId, setFolderId] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [selectedId, setSelectedId] = React.useState(props.selectedId)
  const [loading, setLoading] = React.useState(false)
  // Relative times only after hydration: the server's "now" differs from the browser's.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

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

  function open(id: string | null) {
    setSelectedId(id)
    const url = new URL(location.href)
    url.pathname = id ? `/app/notes/${id}` : "/app/notes"
    pushUrl(url)
  }

  React.useEffect(() => {
    const onPop = () => {
      const m = /^\/app\/notes\/([0-9a-f-]{36})/.exec(location.pathname)
      setSelectedId(m?.[1] ?? null)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // "New note" from the command palette (/app/notes?new=1).
  React.useEffect(() => {
    const url = new URL(location.href)
    if (url.searchParams.get("new") !== "1") return
    url.searchParams.delete("new")
    replaceUrl(url)
    void createNote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createNote() {
    try {
      const note = await api<NoteDetail>("POST", "/api/app/notes", { folderId })
      if (view === "archived" || view === "shared" || view === "pinned") setView("all")
      setNotes((list) => [note, ...list])
      open(note.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function addFolder() {
    const name = window.prompt(t("Folder name"))?.trim()
    if (!name) return
    try {
      const folder = await api<NoteFolder>("POST", "/api/app/notes/folders", { name })
      setFolders((list) => [...list, folder].sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function removeFolder(folder: NoteFolder) {
    if (!window.confirm(t("Delete the folder \"{name}\"? Its notes stay, without a folder.", { name: folder.name }))) return
    try {
      await api("DELETE", `/api/app/notes/folders/${folder.id}`)
      setFolders((list) => list.filter((f) => f.id !== folder.id))
      if (folderId === folder.id) setFolderId(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const onChanged = React.useCallback((note: NoteDetail | null, id: string) => {
    if (!note) {
      setNotes((list) => list.filter((n) => n.id !== id))
      return
    }
    setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, ...note } : n)))
  }, [])

  const currentTitle = folderId ? folders.find((f) => f.id === folderId)?.name : t(VIEWS.find((v) => v.value === view)!.label)

  return (
    <div className="flex h-full min-h-0">
      {/* Views and folders */}
      <aside className="hidden w-56 shrink-0 flex-col border-r lg:flex">
        <div className="p-3">
          <Button className="w-full" onClick={createNote}>
            <Plus />
            {t("New note")}
          </Button>
        </div>
        <nav className="grid gap-0.5 px-2" aria-label={t("Notes views")}>
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setView(value)
                setFolderId(null)
              }}
              aria-current={view === value && !folderId ? "page" : undefined}
              className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              <Icon className="size-4" />
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="mt-4 flex items-center justify-between px-4">
          <span className="eyebrow">{t("Folders")}</span>
          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={addFolder} aria-label={t("New folder")}>
            <FolderPlus className="size-3.5" />
          </button>
        </div>
        <nav className="mt-1 grid gap-0.5 overflow-y-auto px-2 pb-3" aria-label={t("Folders")}>
          {folders.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{t("No folders yet.")}</p>}
          {folders.map((f) => (
            <div key={f.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => {
                  setFolderId(f.id)
                  setView("all")
                }}
                aria-current={folderId === f.id ? "page" : undefined}
                className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                <Folder className="size-4 shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
              {props.canManage && (
                <button type="button" className="invisible rounded p-1 text-muted-foreground group-hover:visible hover:text-destructive" onClick={() => removeFolder(f)} aria-label={t("Delete folder")}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </nav>
        {props.account && (
          <div className="mt-auto border-t p-2">
            <AccountMenu user={props.account} />
          </div>
        )}
      </aside>

      {/* List */}
      <section className={cn("flex w-full min-w-0 flex-col border-r md:w-80 md:shrink-0", selectedId && "hidden md:flex")} aria-label={t("Notes")}>
        <div className="grid gap-2 border-b p-3">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{currentTitle}</h1>
            <MobileViews view={view} setView={(v) => { setView(v); setFolderId(null) }} />
            <Button size="icon-sm" variant="ghost" className="lg:hidden" onClick={createNote} aria-label={t("New note")}>
              <Plus />
            </Button>
          </div>
          <label className="flex h-8 items-center gap-2 rounded-md bg-foreground/[0.04] px-2 text-sm dark:bg-foreground/[0.06]">
            <Search className="size-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search notes")} className="min-w-0 flex-1 bg-transparent outline-none" aria-label={t("Search notes")} />
          </label>
        </div>
        <ul className={cn("min-h-0 flex-1 overflow-y-auto", loading && "opacity-60")}>
          {notes.length === 0 && (
            <li className="grid place-items-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
              <FileText className="size-6" />
              {query ? t("No notes match your search.") : view === "archived" ? t("Nothing archived.") : t("No notes yet.")}
              {!query && view !== "archived" && (
                <Button size="sm" variant="outline" onClick={createNote}>
                  {t("New note")}
                </Button>
              )}
            </li>
          )}
          {notes.map((n) => {
            const Share = sharingIcon[n.sharing]
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n.id)}
                  aria-current={selectedId === n.id ? "true" : undefined}
                  className="grid w-full gap-1 border-b px-4 py-3 text-left hover:bg-accent/40 aria-[current=true]:bg-accent"
                >
                  <span className="flex items-center gap-1.5">
                    {n.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.title || t("Untitled")}</span>
                    <Share className="size-3 shrink-0 text-muted-foreground" aria-label={t(sharingLabel[n.sharing])} />
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{previewWithoutTitle(n) || t("Empty note")}</span>
                  <span className="text-[11px] text-muted-foreground/80" suppressHydrationWarning>{mounted ? timeAgo(n.updatedAt) : "\u00a0"}</span>
                </button>
              </li>
            )
          })}
          {hasMore && (
            <li className="p-3">
              <Button variant="ghost" size="sm" className="w-full" onClick={loadMore}>
                {t("Load more")}
              </Button>
            </li>
          )}
        </ul>
      </section>

      {/* The open note */}
      <main className={cn("min-w-0 flex-1", !selectedId && "hidden md:block")}>
        {selectedId ? (
          <NotePane key={selectedId} id={selectedId} user={props.user} folders={folders} onBack={() => open(null)} onChanged={onChanged} />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
            <div className="grid justify-items-center gap-3">
              <FileText className="size-8" />
              <p>{t("Pick a note or start a new one.")}</p>
              <Button size="sm" onClick={createNote}>
                <Plus />
                {t("New note")}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function previewWithoutTitle(n: NoteSummary) {
  const lines = n.preview.split("\n")
  return (lines[0]?.trim() === n.title.trim() ? lines.slice(1) : lines).join(" ").trim()
}

function MobileViews({ view, setView }: { view: NoteView; setView: (v: NoteView) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" className="lg:hidden" aria-label={t("Notes views")}>
          <Inbox />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {VIEWS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setView(value)} className={cn(view === value && "font-medium")}>
            <Icon />
            {t(label)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [lost, setLost] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setNote(await api<NoteDetail>("GET", `/api/app/notes/${id}`))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

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
      <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
        <div className="grid justify-items-center gap-3">
          <Lock className="size-6" />
          <p>{lost ? t("You can no longer open this note.") : error}</p>
          <Button size="sm" variant="outline" onClick={onBack}>
            {t("Back to notes")}
          </Button>
        </div>
      </div>
    )

  const Share = note ? sharingIcon[note.sharing] : Lock
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label={t("Back to notes")}>
          <ArrowLeft />
        </Button>
        {note && (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Share className="size-3.5 shrink-0" />
            <span className="truncate">{t(sharingLabel[note.sharing])}</span>
            {note.archived && <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{t("Archived")}</span>}
            {note.role === "view" && !note.archived && <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{t("View only")}</span>}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <PresenceStack people={presence} />
          {note?.canManage && !note.archived && (
            <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 />
              {t("Share")}
            </Button>
          )}
          {note && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={t("More")}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {note.role !== "view" && !note.archived && (
                  <DropdownMenuItem onSelect={() => patch({ pinned: !note.pinned })}>
                    {note.pinned ? <PinOff /> : <Pin />}
                    {note.pinned ? t("Unpin") : t("Pin")}
                  </DropdownMenuItem>
                )}
                {note.role !== "view" && !note.archived && (
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
                )}
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
                {note.canManage && (
                  <>
                    <DropdownMenuSeparator />
                    {note.archived ? (
                      <>
                        <DropdownMenuItem onSelect={() => patch({ archived: false }, t("Note restored"))}>
                          <ArchiveRestore />
                          {t("Restore")}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                          <Trash2 />
                          {t("Delete for good")}
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem onSelect={() => patch({ archived: true }, t("Note archived"))}>
                        <Archive />
                        {t("Archive")}
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 sm:px-12">
          <React.Suspense fallback={<EditorSkeleton />}>
            <NoteEditor noteId={id} user={user} onPresence={setPresence} onLost={() => setLost(true)} />
          </React.Suspense>
        </div>
      </div>
      {note && <ShareDialog note={note} open={shareOpen} onOpenChange={setShareOpen} onSaved={(n) => { setNote(n); onChanged(n, id) }} />}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete this note for good?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("It can't be restored afterwards.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              {t("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PresenceStack({ people }: { people: Presence[] }) {
  if (!people.length) return null
  const shown = people.slice(0, 4)
  return (
    <div className="mr-1 flex -space-x-1.5" aria-label={t("Also here: {names}", { names: people.map((p) => p.name).join(", ") })}>
      {shown.map((p) => (
        <span
          key={p.clientId}
          title={p.name}
          className="grid size-7 place-items-center rounded-full border-2 border-background text-[11px] font-medium text-white"
          style={{ background: p.color }}
        >
          {initials(p.name)}
        </span>
      ))}
      {people.length > shown.length && (
        <span className="grid size-7 place-items-center rounded-full border-2 border-background bg-muted text-[11px] font-medium">+{people.length - shown.length}</span>
      )}
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
      <div className="h-9 w-2/3 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
    </div>
  )
}

