import * as React from "react"
import { Mail } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api-client"
import { ALL_MAILBOXES } from "@/lib/admin-mail/rules"
import type { UserMailFolder as MailFolder } from "@/lib/mail/rules"
import { replaceUrl } from "@/lib/panel-history"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/app/empty-state"
import { ComposeWindow, useUndoSend } from "./composer"
import { useDraftKeys } from "./drafts"
import { SenderPanel } from "./sender-panel"
import { ThreadList } from "./thread-list"
import { LabelActions } from "./mail-rules"
import { MailPreferences, type PreferenceSection } from "./mail-preferences"
import { FolderRail } from "./folder-rail"
import { AccountMenu, type MailUser } from "./account-menu"
import { OutboxPanel, scheduledCount, type OutboxRow } from "./outbox-panel"
import { Toaster } from "@/components/ui/sonner"
import { FOLDER_KEYS, Kbd, assignMailboxColors } from "./mail-ui"
import { ThreadView, type ThreadViewHandle } from "./thread-view"
import type { MailThread, ThreadDetail, ThreadPatch } from "./types"

const SHORTCUTS: [string, string][] = [
  ["j / k", "Next / previous thread"],
  ["g i", "Go to inbox (g s starred, g t sent, g e archived)"],
  ["Enter", "Open the first thread"],
  ["r / a / f", "Reply / reply all / forward"],
  ["c", "New e-mail"],
  ["e", "Archive"],
  ["#", "Move to trash"],
  ["u", "Mark unread"],
  ["s", "Star / unstar"],
  ["!", "Report spam"],
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

export interface MailboxAppProps {
  mailboxes: string[]
  threads: MailThread[]
  hasMore: boolean
  unread: Record<string, number>
  signatures: Record<string, { signature: string; name?: string }>
  selectedId: string | null
  /** Owners and admins: the empty state links to Settings → Mail. */
  canManage?: boolean
  /** The mail-only view (MailLayout, members): full screen, with the account menu instead of the dashboard sidebar. */
  account?: MailUser
  /** Open the outbox (scheduled and recent sends) instead of a folder: `/app/mail?pane=outbox`. */
  outbox?: boolean
}

/** The member's mailboxes, laid out like a mail app: folders and threads, the open thread, and who it's with. */
export function MailboxApp(props: MailboxAppProps) {
  // Before the first render: every child reads the colours.
  React.useMemo(() => assignMailboxColors(props.mailboxes), [props.mailboxes])
  const desktop = useMediaQuery("(min-width: 768px)")
  const wide = useMediaQuery("(min-width: 1280px)")
  const multiple = props.mailboxes.length > 1
  const [mailbox, setMailbox] = React.useState(multiple ? ALL_MAILBOXES : (props.mailboxes[0] ?? ""))
  const [folder, setFolder] = React.useState<MailFolder>("inbox")
  const [outbox, setOutbox] = React.useState(!!props.outbox)
  const [outboxCount, setOutboxCount] = React.useState(0)
  const onOutboxJobs = React.useCallback((jobs: OutboxRow[]) => setOutboxCount(scheduledCount(jobs)), [])
  const refreshOutboxCount = React.useCallback(() => {
    api<{ jobs: OutboxRow[] }>("GET", "/api/app/mail/outbox").then((r) => onOutboxJobs(r.jobs)).catch(() => {})
  }, [onOutboxJobs])
  React.useEffect(refreshOutboxCount, [refreshOutboxCount])
  React.useEffect(() => {
    const url = new URL(location.href)
    if (outbox) url.searchParams.set("pane", "outbox")
    else url.searchParams.delete("pane")
    replaceUrl(url)
  }, [outbox])
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
  const [settingsSection, setSettingsSection] = React.useState<PreferenceSection>("signature")
  const openSettings = (section: PreferenceSection = "signature") => {
    setSettingsSection(section)
    setSettingsOpen(true)
  }
  const searchRef = React.useRef<HTMLInputElement>(null)
  const gPending = React.useRef(false)
  const threadRef = React.useRef<ThreadViewHandle>(null)
  const drafts = useDraftKeys()
  const boxes = mailbox === ALL_MAILBOXES ? props.mailboxes : [mailbox]
  const contacts = React.useMemo(() => [...new Set([...threads.map((t) => t.contactEmail), ...(detail ? [detail.thread.contactEmail, ...detail.messages.flatMap((m) => [m.fromEmail])] : [])])], [threads, detail])

  const listUrl = React.useCallback(
    (before?: string) => {
      const p = new URLSearchParams({ mailbox, folder })
      if (query.trim()) p.set("q", query.trim())
      if (before) p.set("before", String(new Date(before).getTime()))
      return `/api/app/mail/threads?${p}`
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
    const d = await api<ThreadDetail>("GET", `/api/app/mail/threads/${id}`)
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
    refreshOutboxCount()
    if (threadId === selectedId) loadDetail(threadId).catch(() => {})
  })

  /** Opens the thread next to the current one (after archiving it, like Gmail's auto-advance). */
  const neighbour = (id: string, list = threads) => {
    const i = list.findIndex((t) => t.id === id)
    return list[i + 1]?.id ?? list[i - 1]?.id ?? null
  }

  async function patch(ids: string[], change: ThreadPatch) {
    const leaves =
      change.archived === true ||
      change.trashed !== undefined ||
      change.spam !== undefined ||
      (change.snoozedUntil !== undefined && change.snoozedUntil !== null) ||
      change.archived === false ||
      (change.starred === false && folder === "starred")
    const next = selectedId && ids.includes(selectedId) && leaves ? neighbour(selectedId, threads.filter((t) => !ids.includes(t.id) || t.id === selectedId)) : selectedId
    try {
      await api("PATCH", "/api/app/mail/threads", { ids, ...change })
      if (leaves) setThreads((list) => list.filter((t) => !ids.includes(t.id)))
      else
        setThreads((list) =>
          list.map((t) =>
            ids.includes(t.id) ? { ...t, ...(change.unread !== undefined ? { unread: change.unread } : {}), ...(change.starred !== undefined ? { starred: change.starred } : {}) } : t,
          ),
        )
      if (change.starred !== undefined) setDetail((d) => (d && ids.includes(d.thread.id) ? { ...d, thread: { ...d.thread, starred: change.starred! } } : d))
      setSelection(new Set())
      if (change.unread === true && selectedId && ids.includes(selectedId)) setSelectedId(null)
      else if (next !== selectedId) setSelectedId(next)
      const label =
        change.trashed === true
          ? "Moved to the trash"
          : change.spam === true
            ? "Reported as spam"
            : change.archived === true
              ? "Archived"
              : change.snoozedUntil
                ? "Snoozed"
                : change.starred !== undefined
                  ? null
                  : leaves
                    ? "Moved to the inbox"
                    : null
      if (label) toast.success(ids.length > 1 ? `${label}: ${ids.length}` : label)
      loadThreads().catch(() => {})
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function remove(ids: string[]) {
    try {
      await api("DELETE", "/api/app/mail/threads", { ids })
      setThreads((list) => list.filter((t) => !ids.includes(t.id)))
      setSelection(new Set())
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
      toast.success("Deleted")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const openCompose = (to?: string) => setCompose({ open: true, prefill: { to, nonce: Date.now() } })

  // "New e-mail" from the command palette: /app/mail?compose=1 (optionally &to=).
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("compose") === "1" && props.mailboxes.length) openCompose(p.get("to") ?? undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        s: () => {
          const ids = selection.size ? [...selection] : selectedId ? [selectedId] : []
          const starred = threads.find((t) => t.id === ids[0])?.starred ?? false
          if (ids.length) patch(ids, { starred: !starred })
        },
        "!": () => {
          const ids = selection.size ? [...selection] : selectedId ? [selectedId] : []
          if (ids.length) patch(ids, { spam: folder !== "spam" })
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
      // Two-key "g" shortcuts jump to a folder: g i inbox, g s starred…
      if (gPending.current) {
        gPending.current = false
        const target = (Object.entries(FOLDER_KEYS) as [MailFolder, string][]).find(([, k]) => k === e.key)?.[0]
        if (target) {
          e.preventDefault()
          setFolder(target)
          setSelectedId(null)
          return
        }
      }
      if (e.key === "g") {
        gPending.current = true
        setTimeout(() => (gPending.current = false), 1200)
        return
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
    const empty = (
      <EmptyState
        icon={<Mail />}
        title="No mailbox yet"
        description={props.canManage ? "Add your domain and create mailboxes in Settings → Mail." : "Ask an owner or admin of your organization to create your mailbox."}
        action={props.canManage ? <Button asChild><a href="/app/settings/mail">Set up mail</a></Button> : undefined}
      />
    )
    if (!props.account) return empty
    return (
      <div className="relative grid h-full place-items-center p-6">
        <div className="absolute top-3 right-3">
          <AccountMenu canManage={props.canManage} user={props.account} compact />
        </div>
        {empty}
        <Toaster />
      </div>
    )
  }

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
    <LabelActions threadIds={selection.size ? [...selection] : selectedId ? [selectedId] : []} onApplied={() => { void loadThreads() }} onFilter={setQuery} />
    <div className="min-h-0 flex-1">
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
      onSettings={() => openSettings()}
      onOutbox={() => setOutbox(true)}
      outboxCount={outboxCount}
      rail={desktop}
      account={props.account && !desktop ? <AccountMenu canManage={props.canManage} user={props.account} onSettings={openSettings} compact /> : null}
    />
    </div></div>
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
      <div className={props.account ? "bg-background flex h-full min-h-0 overflow-hidden" : "bg-background -mx-2 -mb-2 flex h-full min-h-0 overflow-hidden rounded-b-xl border-t"}>
        {desktop ? (
          <FolderRail
            mailboxes={props.mailboxes}
            mailbox={mailbox}
            onMailbox={(m) => {
              setMailbox(m)
              setSelectedId(null)
              setOutbox(false)
            }}
            folder={folder}
            onFolder={(f) => {
              setFolder(f)
              setQuery("")
              setSelectedId(null)
              setOutbox(false)
            }}
            unread={unread}
            onCompose={() => openCompose()}
            onSettings={() => openSettings()}
            outbox={outbox}
            onOutbox={() => setOutbox(true)}
            outboxCount={outboxCount}
            footer={props.account ? <AccountMenu canManage={props.canManage} user={props.account} onSettings={openSettings} /> : undefined}
          />
        ) : null}
        <div className="min-w-0 flex-1">
        {outbox ? (
          <OutboxPanel
            onJobs={onOutboxJobs}
            onBack={desktop ? undefined : () => setOutbox(false)}
            onOpenThread={(id) => {
              setOutbox(false)
              setFolder("sent")
              setSelectedId(id)
            }}
          />
        ) : desktop ? (
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
      <MailPreferences open={settingsOpen} onOpenChange={setSettingsOpen} section={settingsSection} mailboxes={props.mailboxes} mailbox={mailbox === ALL_MAILBOXES ? props.mailboxes[0]! : mailbox} signatures={signatures} onSignatures={setSignatures} account={!!props.account} />
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
                  <span className="flex items-center gap-1">
                    {keys.split(" ").map((k, i) => (k === "/" && i > 0 ? <span key={i} className="text-muted-foreground text-xs">or</span> : <Kbd key={i}>{k}</Kbd>))}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
      {/* The dashboard's toasts live in its sidebar island, which the mail-only view doesn't have. */}
      {props.account ? <Toaster /> : null}
    </TooltipProvider>
  )
}
