import * as React from "react"
import { Mail } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api-client"
import { ALL_MAILBOXES, type MailFolder } from "@/lib/admin-mail/rules"
import { replaceUrl } from "@/lib/panel-history"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { TooltipProvider } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/app/empty-state"
import { ComposeWindow, useUndoSend } from "./composer"
import { useDraftKeys } from "./drafts"
import { SenderPanel } from "./sender-panel"
import { ThreadList } from "./thread-list"
import { ThreadView, type ThreadViewHandle } from "./thread-view"
import type { MailThread, ThreadDetail, ThreadPatch } from "./types"

const SHORTCUTS: [string, string][] = [
  ["j / k", "Next / previous thread"],
  ["Enter", "Open the first thread"],
  ["r / a / f", "Reply / reply all / forward"],
  ["c", "New e-mail"],
  ["e", "Archive"],
  ["#", "Move to trash"],
  ["u", "Mark unread"],
  ["x", "Select the thread"],
  ["/", "Search"],
  ["Esc", "Close the thread"],
  ["?", "These shortcuts"],
]

/** Client-only media query; renders the wide layout on the server (no hydration mismatch). */
function useMediaQuery(query: string) {
  return React.useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query)
      mq.addEventListener("change", notify)
      return () => mq.removeEventListener("change", notify)
    },
    () => window.matchMedia(query).matches,
    () => true,
  )
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))

export interface AdminMailProps {
  mailboxes: string[]
  threads: MailThread[]
  hasMore: boolean
  unread: Record<string, number>
  signatures: Record<string, { signature: string }>
  selectedId: string | null
}

/** Staff mailboxes, laid out like a mail app: folders and threads, the open thread, and who it's with. */
export function AdminMail(props: AdminMailProps) {
  const desktop = useMediaQuery("(min-width: 768px)")
  const wide = useMediaQuery("(min-width: 1280px)")
  const multiple = props.mailboxes.length > 1
  const [mailbox, setMailbox] = React.useState(multiple ? ALL_MAILBOXES : (props.mailboxes[0] ?? ""))
  const [folder, setFolder] = React.useState<MailFolder>("inbox")
  const [query, setQuery] = React.useState("")
  const [threads, setThreads] = React.useState(props.threads)
  const [hasMore, setHasMore] = React.useState(props.hasMore)
  const [unread, setUnread] = React.useState(props.unread)
  const [loading, setLoading] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(props.selectedId)
  const [detail, setDetail] = React.useState<ThreadDetail | null>(null)
  const [selection, setSelection] = React.useState<Set<string>>(() => new Set())
  const [signatures, setSignatures] = React.useState(props.signatures)
  const [compose, setCompose] = React.useState<{ open: boolean; prefill: { to?: string; nonce: number } | null }>({ open: false, prefill: null })
  const [infoOpen, setInfoOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const threadRef = React.useRef<ThreadViewHandle>(null)
  const drafts = useDraftKeys()
  const boxes = mailbox === ALL_MAILBOXES ? props.mailboxes : [mailbox]
  const contacts = React.useMemo(() => [...new Set([...threads.map((t) => t.contactEmail), ...(detail ? [detail.thread.contactEmail, ...detail.messages.flatMap((m) => [m.fromEmail])] : [])])], [threads, detail])

  const listUrl = React.useCallback(
    (before?: string) => {
      const p = new URLSearchParams({ mailbox, folder })
      if (query.trim()) p.set("q", query.trim())
      if (before) p.set("before", String(new Date(before).getTime()))
      return `/api/app/admin/mail?${p}`
    },
    [mailbox, folder, query],
  )

  const loadThreads = React.useCallback(async () => {
    const res = await api<{ threads: MailThread[]; hasMore: boolean; unread: Record<string, number> }>("GET", listUrl())
    setThreads(res.threads)
    setHasMore(res.hasMore)
    setUnread(res.unread)
    return res.threads
  }, [listUrl])

  // The page rendered the inbox already; reload when the mailbox, folder or search changes.
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setLoading(true)
    setSelection(new Set())
    const t = setTimeout(() => loadThreads().catch((e) => toast.error((e as Error).message)).finally(() => setLoading(false)), query ? 250 : 0)
    return () => clearTimeout(t)
  }, [loadThreads, query])

  async function loadMore() {
    const lastThread = threads.at(-1)
    if (!lastThread) return
    setLoading(true)
    try {
      const res = await api<{ threads: MailThread[]; hasMore: boolean }>("GET", listUrl(lastThread.lastMessageAt))
      setThreads((list) => [...list, ...res.threads.filter((t) => !list.some((x) => x.id === t.id))])
      setHasMore(res.hasMore)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = React.useCallback(async (id: string) => {
    const d = await api<ThreadDetail>("GET", `/api/app/admin/mail/${id}`)
    setDetail((cur) => (cur && cur.thread.id !== id ? cur : d))
    setThreads((list) => list.map((t) => (t.id === id ? { ...t, unread: false } : t)))
    return d
  }, [])

  React.useEffect(() => {
    const url = new URL(location.href)
    if (selectedId) url.searchParams.set("t", selectedId)
    else url.searchParams.delete("t")
    replaceUrl(url)
    setInfoOpen(false)
    if (!selectedId) return setDetail(null)
    setDetail((cur) => (cur?.thread.id === selectedId ? cur : null))
    loadDetail(selectedId)
      .then(() => api<{ unread: Record<string, number> }>("GET", listUrl()).then((r) => setUnread(r.unread)).catch(() => {}))
      .catch((e) => {
        toast.error((e as Error).message)
        setSelectedId(null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loadDetail])

  // New mail arrives without a socket: refresh while the tab is visible, and the open thread when it changed.
  React.useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return
      const list = await loadThreads().catch(() => null)
      const open = list?.find((t) => t.id === selectedId)
      if (open && detail && open.lastMessageAt !== detail.thread.lastMessageAt) loadDetail(open.id).catch(() => {})
    }
    const timer = setInterval(tick, 30_000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [loadThreads, loadDetail, selectedId, detail])

  const schedule = useUndoSend((threadId) => {
    loadThreads().catch(() => {})
    if (threadId === selectedId) loadDetail(threadId).catch(() => {})
  })

  /** Opens the thread next to the current one (after archiving it, like Gmail's auto-advance). */
  const neighbour = (id: string, list = threads) => {
    const i = list.findIndex((t) => t.id === id)
    return list[i + 1]?.id ?? list[i - 1]?.id ?? null
  }

  async function patch(ids: string[], change: ThreadPatch) {
    const leaves = change.archived === true || change.trashed !== undefined || (change.snoozedUntil !== undefined && change.snoozedUntil !== null) || change.archived === false
    const next = selectedId && ids.includes(selectedId) && leaves ? neighbour(selectedId, threads.filter((t) => !ids.includes(t.id) || t.id === selectedId)) : selectedId
    try {
      await api("PATCH", "/api/app/admin/mail", { ids, ...change })
      if (leaves) setThreads((list) => list.filter((t) => !ids.includes(t.id)))
      else setThreads((list) => list.map((t) => (ids.includes(t.id) && change.unread !== undefined ? { ...t, unread: change.unread } : t)))
      setSelection(new Set())
      if (change.unread === true && selectedId && ids.includes(selectedId)) setSelectedId(null)
      else if (next !== selectedId) setSelectedId(next)
      const label =
        change.trashed === true ? "Moved to the trash" : change.archived === true ? "Archived" : change.snoozedUntil ? "Snoozed" : leaves ? "Moved to the inbox" : null
      if (label) toast.success(ids.length > 1 ? `${label}: ${ids.length}` : label)
      loadThreads().catch(() => {})
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function remove(ids: string[]) {
    try {
      await api("DELETE", "/api/app/admin/mail", { ids })
      setThreads((list) => list.filter((t) => !ids.includes(t.id)))
      setSelection(new Set())
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
      toast.success("Deleted")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const openCompose = (to?: string) => setCompose({ open: true, prefill: { to, nonce: Date.now() } })

  // Keyboard shortcuts, like Gmail's; they pause while typing or with a dialog open.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector("[role=dialog][data-state=open], [role=alertdialog]")) return
      const i = threads.findIndex((t) => t.id === selectedId)
      const go = (id: string | undefined) => {
        if (id) setSelectedId(id)
      }
      const run: Record<string, () => void> = {
        j: () => go(threads[i + 1]?.id ?? (i < 0 ? threads[0]?.id : undefined)),
        ArrowDown: () => go(threads[i + 1]?.id ?? (i < 0 ? threads[0]?.id : undefined)),
        k: () => go(threads[i - 1]?.id),
        ArrowUp: () => go(threads[i - 1]?.id),
        Enter: () => !selectedId && go(threads[0]?.id),
        o: () => !selectedId && go(threads[0]?.id),
        c: () => openCompose(),
        "/": () => searchRef.current?.focus(),
        "?": () => setHelpOpen(true),
        x: () => {
          if (!selectedId) return
          const next = new Set(selection)
          if (next.has(selectedId)) next.delete(selectedId)
          else next.add(selectedId)
          setSelection(next)
        },
        e: () => {
          const ids = selection.size ? [...selection] : selectedId ? [selectedId] : []
          if (ids.length) patch(ids, folder === "archived" ? { archived: false } : { archived: true })
        },
        "#": () => {
          const ids = selection.size ? [...selection] : selectedId ? [selectedId] : []
          if (ids.length && folder !== "trash") patch(ids, { trashed: true })
        },
        u: () => {
          const ids = selection.size ? [...selection] : selectedId ? [selectedId] : []
          if (ids.length) patch(ids, { unread: true })
        },
        r: () => threadRef.current?.reply("reply"),
        a: () => threadRef.current?.reply("replyAll"),
        f: () => threadRef.current?.reply("forward"),
        Escape: () => (selection.size ? setSelection(new Set()) : setSelectedId(null)),
      }
      const action = run[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!props.mailboxes.length) {
    return <EmptyState icon={<Mail />} title="No mailboxes" description="Add addresses to ADMIN_MAILBOXES in wrangler.jsonc and route them to the Worker." />
  }

  const listPane = (
    <ThreadList
      mailboxes={props.mailboxes}
      mailbox={mailbox}
      onMailbox={(m) => {
        setMailbox(m)
        setSelectedId(null)
      }}
      unread={unread}
      folder={folder}
      onFolder={(f) => {
        setFolder(f)
        setSelectedId(null)
      }}
      query={query}
      onQuery={setQuery}
      searchRef={searchRef}
      threads={threads}
      hasMore={hasMore}
      onLoadMore={loadMore}
      loading={loading}
      selectedId={selectedId}
      onOpen={setSelectedId}
      selection={selection}
      onSelection={setSelection}
      onBulk={(change) => patch([...selection], change)}
      onBulkDelete={() => remove([...selection])}
      drafts={drafts}
      onCompose={() => openCompose()}
      onSettings={() => setSettingsOpen(true)}
    />
  )

  const sender = detail ? <SenderPanel detail={detail} multipleMailboxes={multiple} onOpen={setSelectedId} onCompose={openCompose} /> : null

  const threadPane =
    detail && selectedId ? (
      <ThreadView
        key={detail.thread.id}
        ref={threadRef}
        detail={detail}
        mailboxes={props.mailboxes}
        multipleMailboxes={multiple}
        contacts={contacts}
        signature={signatures[detail.thread.mailbox]?.signature ?? ""}
        schedule={schedule}
        onPatch={(change) => patch([detail.thread.id], change)}
        onDelete={() => remove([detail.thread.id])}
        onBack={() => setSelectedId(null)}
        onInfo={wide ? undefined : () => setInfoOpen(true)}
      />
    ) : (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          variant="plain"
          icon={<Mail />}
          title={selectedId ? "Opening…" : "No thread open"}
          description={
            <>
              Pick one on the left, or press <kbd className="bg-muted rounded px-1 font-mono text-xs">?</kbd> for shortcuts.
            </>
          }
        />
      </div>
    )

  return (
    <TooltipProvider delayDuration={400}>
      <div className="bg-surface h-[calc(100svh-5rem)] min-h-[520px] overflow-hidden rounded-2xl">
        {desktop ? (
          <ResizablePanelGroup key={wide ? "wide" : "narrow"} orientation="horizontal">
            <ResizablePanel id="list" defaultSize={wide ? "28%" : "36%"} minSize="260px" maxSize="50%">
              {listPane}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="thread" minSize="360px">
              {threadPane}
            </ResizablePanel>
            {wide && detail ? (
              <>
                <ResizableHandle />
                <ResizablePanel id="sender" defaultSize="20%" minSize="220px" maxSize="35%">
                  <aside className="h-full overflow-y-auto">{sender}</aside>
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        ) : selectedId ? (
          threadPane
        ) : (
          listPane
        )}
      </div>
      <Sheet open={infoOpen && !wide} onOpenChange={setInfoOpen}>
        <SheetContent className="w-[22rem] max-w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Sender</SheetTitle>
          </SheetHeader>
          {sender}
        </SheetContent>
      </Sheet>
      <ComposeWindow
        open={compose.open}
        prefill={compose.prefill}
        mailboxes={props.mailboxes}
        mailbox={mailbox === ALL_MAILBOXES ? props.mailboxes[0]! : mailbox}
        contacts={contacts}
        signatures={signatures}
        schedule={schedule}
        onClose={() => setCompose((c) => ({ ...c, open: false }))}
      />
      <SignatureDialog open={settingsOpen} onOpenChange={setSettingsOpen} mailboxes={props.mailboxes} initial={mailbox === ALL_MAILBOXES ? props.mailboxes[0]! : mailbox} signatures={signatures} onSaved={setSignatures} />
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>They pause while you type.</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 text-sm">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>
                  <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

/** Each mailbox's signature: added under new e-mails, replies and forwards. */
function SignatureDialog({
  open,
  onOpenChange,
  mailboxes,
  initial,
  signatures,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mailboxes: string[]
  initial: string
  signatures: Record<string, { signature: string }>
  onSaved: (s: Record<string, { signature: string }>) => void
}) {
  const [mailbox, setMailbox] = React.useState(initial)
  const [text, setText] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (open) setMailbox(initial)
  }, [open, initial])
  React.useEffect(() => {
    setText(signatures[mailbox]?.signature ?? "")
  }, [mailbox, signatures])

  async function save() {
    setSaving(true)
    try {
      await api("PUT", "/api/app/admin/mail/mailboxes", { mailbox, signature: text })
      onSaved({ ...signatures, [mailbox]: { signature: text } })
      toast.success("Signature saved")
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Signature</DialogTitle>
          <DialogDescription>Goes under new e-mails, replies and forwards from this address. You can still edit it in each message.</DialogDescription>
        </DialogHeader>
        {mailboxes.length > 1 ? (
          <Select value={mailbox} onValueChange={setMailbox}>
            <SelectTrigger className="w-full" aria-label="Mailbox">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mailboxes.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"Kuba\nLuxivo · luxivo.app"} />
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
