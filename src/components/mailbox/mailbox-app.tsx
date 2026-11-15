import * as React from "react"
import { signaturePreview, type MailboxSignature, type SignatureBrand } from "@/lib/mail/signature"
import { Archive, Clock, ExternalLink, Forward, Inbox, Mail, MailOpen, Reply, ReplyAll, ShieldAlert, ShieldCheck, SquareCheck, Star, StarOff, Trash2 } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { ALL_MAILBOXES } from "@/lib/admin-mail/rules"
import type { MailView as MailFolder } from "./types"
import { PANEL_NAVIGATION, replaceUrl } from "@/lib/panel-history"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/app/empty-state"
import { ComposeWindow, useUndoSend } from "./composer"
import { NEW_DRAFT, syncDrafts, useDraftKeys, writeDraft } from "./drafts"
import { draftRows, useDraftCount } from "./drafts-panel"
import { SenderPanel } from "./sender-panel"
import { ThreadList } from "./thread-list"
import { LabelActions } from "./mail-rules"
import { onSettingsSaved, openSettings as openSettingsDialog, type SettingsSection } from "@/components/settings/open-settings"
import { FolderRail } from "./folder-rail"
import { AccountMenu, type MailUser } from "./account-menu"
import { OutboxDetail, outboxRows, scheduledCount, type OutboxRow } from "./outbox-panel"
import { AppFrame } from "@/components/workspace/app-frame"
import { SidePanel } from "@/components/workspace/split-view"
import { foldAway, shortcutsPaused, useAppLayout } from "@/components/workspace/ui"
import { cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import { FOLDER_KEYS, Kbd, assignMailboxColors } from "./mail-ui"
import { FilePen, MessagesSquare, X as XIcon } from "lucide-react"
import { SnoozeDialog, ThreadView, snoozeActions, type ThreadViewHandle } from "./thread-view"
import { isVirtualFolder, type MailThread, type ReplyMode, type ThreadDetail, type ThreadPatch } from "./types"
import { publishUnread } from "@/lib/mail/unread-badge"

const SHORTCUTS: [string, string][] = [
  ["j / k", "Next / previous thread"],
  ["g i", "Go to inbox (g s starred, g t sent, g e archived)"],
  ["g 1–9", "Go to a mailbox (g 0 all mailboxes)"],
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



export interface MailboxAppProps {
  mailboxes: string[]
  threads: MailThread[]
  hasMore: boolean
  unread: Record<string, number>
  signatures: Record<string, MailboxSignature>
  /** The org's signature template, for the composer's preview. */
  signatureBrand: SignatureBrand
  selectedId: string | null
  /** Owners and admins: the empty state links to Settings → Mail. */
  canManage?: boolean
  /** The user view: full screen, with the account menu instead of the dashboard sidebar. */
  account?: MailUser
  /** Open the outbox (scheduled and recent sends) instead of a folder: `/app/mail?pane=outbox`. */
  outbox?: boolean
  /** Open Drafts instead of a folder: `/app/mail?pane=drafts`. `?draft=<key>` (AI apps' links) opens one. */
  drafts?: boolean
}

/** The member's mailboxes, laid out like a mail app: folders and threads, the open thread, and who it's with. */
export function MailboxApp(props: MailboxAppProps) {
  // Before the first render: every child reads the colours.
  React.useMemo(() => assignMailboxColors(props.mailboxes), [props.mailboxes])
  const { ref: frameRef, desktop, wide } = useAppLayout()
  const multiple = props.mailboxes.length > 1
  const [mailbox, setMailbox] = React.useState(multiple ? ALL_MAILBOXES : (props.mailboxes[0] ?? ""))
  const [folder, setFolder] = React.useState<MailFolder>(props.outbox ? "outbox" : props.drafts ? "drafts" : "inbox")
  // Drafts and Outbox list drafts and send jobs in the same list; `item` is the open one (a draft key or a job id).
  const virtual = isVirtualFolder(folder)
  const [item, setItem] = React.useState<string | null>(null)
  const [outboxJobs, setOutboxJobs] = React.useState<OutboxRow[]>([])
  const refreshOutbox = React.useCallback(() => {
    api<{ jobs: OutboxRow[] }>("GET", "/api/app/mail/outbox").then((r) => setOutboxJobs(r.jobs)).catch(() => {})
  }, [])
  React.useEffect(refreshOutbox, [refreshOutbox])
  React.useEffect(() => {
    if (folder !== "outbox") return
    const timer = setInterval(refreshOutbox, 10_000)
    return () => clearInterval(timer)
  }, [folder, refreshOutbox])
  const outboxCount = scheduledCount(outboxJobs)
  const draftCount = useDraftCount(props.mailboxes)
  React.useEffect(() => {
    const url = new URL(location.href)
    if (isVirtualFolder(folder)) url.searchParams.set("pane", folder)
    else url.searchParams.delete("pane")
    replaceUrl(url)
  }, [folder])
  const [query, setQuery] = React.useState("")
  const [threads, setThreads] = React.useState(props.threads)
  const [hasMore, setHasMore] = React.useState(props.hasMore)
  const [unread, setUnread] = React.useState(props.unread)
  // The sidebar / app rail badge follows Mail's own counts, so reading a thread clears it right away.
  React.useEffect(() => publishUnread(Object.values(unread).reduce((a, b) => a + b, 0)), [unread])
  const [loading, setLoading] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(props.selectedId)
  const [detail, setDetail] = React.useState<ThreadDetail | null>(null)
  const [selection, setSelection] = React.useState<Set<string>>(() => new Set())
  const [signatures, setSignatures] = React.useState(props.signatures)
  const [compose, setCompose] = React.useState<{ open: boolean; prefill: { to?: string; nonce: number } | null; draftKey?: string }>({ open: false, prefill: null })
  const [infoOpen, setInfoOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)
  // The settings dialog opens at the mailbox in view; a signature saved there shows in the composer at once.
  const openSettings = (section: SettingsSection = "signature") =>
    openSettingsDialog(section, { mailbox: mailbox === ALL_MAILBOXES ? props.mailboxes[0] : mailbox })
  React.useEffect(
    () => onSettingsSaved((saved) => saved.kind === "signatures" && setSignatures(saved.signatures as Record<string, MailboxSignature>)),
    [],
  )
  const searchRef = React.useRef<HTMLInputElement>(null)
  const gPending = React.useRef(false)
  const threadRef = React.useRef<ThreadViewHandle>(null)
  const drafts = useDraftKeys()
  const boxes = mailbox === ALL_MAILBOXES ? props.mailboxes : [mailbox]
  const contacts = React.useMemo(() => [...new Set([...threads.map((t) => t.contactEmail), ...(detail ? [detail.thread.contactEmail, ...detail.messages.flatMap((m) => [m.fromEmail])] : [])])], [threads, detail])

  const listUrl = React.useCallback(
    (before?: string) => {
      // Drafts and Outbox aren't server folders; the inbox keeps the unread counts fresh meanwhile.
      const p = new URLSearchParams({ mailbox, folder: isVirtualFolder(folder) ? "inbox" : folder })
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
      if (!virtual) return
    }
    setSelection(new Set())
    if (virtual) return
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
    refreshOutbox()
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
      if (leaves) foldAway(ids, () => setThreads((list) => list.filter((t) => !ids.includes(t.id))))
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
      foldAway(ids, () => setThreads((list) => list.filter((t) => !ids.includes(t.id))))
      setSelection(new Set())
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
      toast.success("Deleted")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const openCompose = (to?: string) => setCompose({ open: true, prefill: { to, nonce: Date.now() }, draftKey: NEW_DRAFT })
  const goFolder = (f: MailFolder) => {
    setFolder(f)
    setQuery("")
    setSelectedId(null)
    setItem(null)
  }
  /** A folder of one mailbox, or of all of them (the rail, g 0–9). */
  const openFolder = (m: string, f: MailFolder) => {
    if (m !== mailbox) setMailbox(m)
    goFolder(f)
  }
  const isThreadKey = (key: string) => key !== NEW_DRAFT && !key.startsWith("d-")
  /** A draft (a row in Drafts, or an AI app's link): a reply opens its thread with the draft, a new e-mail the composer in the detail pane. */
  const openDraft = (key: string) => {
    if (folder !== "drafts") goFolder("drafts")
    setItem(key)
    setSelectedId(isThreadKey(key) ? key : null)
    // The docked window edits the same "new" draft: one editor at a time.
    if (key === NEW_DRAFT) setCompose((c) => ({ ...c, open: false }))
  }
  const openItem = (id: string) => (folder === "drafts" ? openDraft(id) : setItem(id))
  const closeItem = () => {
    setItem(null)
    setSelectedId(null)
  }
  const visibleBoxes = mailbox === ALL_MAILBOXES ? props.mailboxes : [mailbox]
  const rows = React.useMemo(
    () =>
      folder === "drafts"
        ? draftRows(drafts, visibleBoxes, query)
        : folder === "outbox"
          ? outboxRows(outboxJobs.filter((j) => !j.mailbox || visibleBoxes.includes(j.mailbox)), query, props.mailboxes[0] ?? "")
          : threads,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folder, drafts, mailbox, query, outboxJobs, threads],
  )
  const job = folder === "outbox" && item ? outboxJobs.find((j) => j.id === item) : undefined
  async function cancelSends(ids: string[]) {
    const results = await Promise.allSettled(ids.map((id) => api("DELETE", `/api/app/mail/outbox/${id}`)))
    const failed = results.filter((r) => r.status === "rejected").length
    if (failed) toast.error(failed === ids.length ? "Sending has already started" : `${failed} could not be cancelled: sending had started`)
    if (failed < ids.length) toast.success(ids.length - failed > 1 ? `Sends cancelled: ${ids.length - failed}` : "Send cancelled")
    setSelection(new Set())
    if (item && ids.includes(item)) setItem(null)
    refreshOutbox()
  }
  function discardDrafts(keys: string[]) {
    for (const key of keys) writeDraft(key, null)
    toast.success(keys.length > 1 ? `Drafts discarded: ${keys.length}` : "Draft discarded")
    setSelection(new Set())
    if (item && keys.includes(item)) closeItem()
  }
  /** Row menu in Drafts and Outbox, acting on the selection when the row is in it. */
  const itemActions = (row: MailThread): MenuAction[] => {
    const ids = selection.size > 1 && selection.has(row.id) ? [...selection] : [row.id]
    if (folder === "drafts")
      return cleanActions([
        { label: "Open", icon: FilePen, onSelect: () => openDraft(row.id) },
        { separator: true },
        {
          label: ids.length > 1 ? `Discard ${ids.length} drafts` : "Discard draft",
          icon: Trash2,
          destructive: true,
          confirm: { title: ids.length > 1 ? `Discard ${ids.length} drafts?` : "Discard this draft?", description: "Removed on every device.", confirmLabel: "Discard" },
          onSelect: () => discardDrafts(ids),
        },
      ])
    const j = outboxJobs.find((x) => x.id === row.id)
    return cleanActions([
      ...(j?.threadId ? [{ label: "Open thread", icon: MessagesSquare, onSelect: () => { goFolder("sent"); setSelectedId(j.threadId!) } }] : []),
      ...(ids.some((id) => outboxJobs.find((x) => x.id === id)?.status === "pending")
        ? [{
            label: ids.length > 1 ? `Cancel ${ids.length} sends` : "Cancel send",
            icon: XIcon,
            destructive: true,
            confirm: { title: ids.length > 1 ? `Cancel ${ids.length} sends?` : "Cancel this send?", description: "The e-mail is discarded and won't be sent.", confirmLabel: "Cancel send" },
            onSelect: () => cancelSends(ids.filter((id) => outboxJobs.find((x) => x.id === id)?.status === "pending")),
          }]
        : []),
    ])
  }

  // Reply / reply all / forward from a row's menu: open the thread, then start the reply once it has loaded.
  const pendingReply = React.useRef<{ id: string; mode: ReplyMode } | null>(null)
  React.useEffect(() => {
    const pending = pendingReply.current
    if (!pending || detail?.thread.id !== pending.id) return
    pendingReply.current = null
    setTimeout(() => threadRef.current?.reply(pending.mode))
  }, [detail])
  const [snoozeIds, setSnoozeIds] = React.useState<string[] | null>(null)

  /**
   * A thread's right-click menu and "…". On a row inside a selection of several, it acts on the selection (like the
   * keyboard shortcuts); otherwise on that thread alone, without touching the selection.
   */
  const threadActions = (t: MailThread): MenuAction[] => {
    const ids = selection.size > 1 && selection.has(t.id) ? [...selection] : [t.id]
    const many = ids.length > 1
    const trash = folder === "trash"
    const back = folder === "archived" || folder === "snoozed"
    const reply = (mode: ReplyMode) => {
      if (selectedId === t.id && detail?.thread.id === t.id) threadRef.current?.reply(mode)
      else {
        pendingReply.current = { id: t.id, mode }
        setSelectedId(t.id)
      }
    }
    return cleanActions([
      many && { heading: `${ids.length} conversations` },
      !many && { label: "Open", icon: MailOpen, onSelect: () => setSelectedId(t.id) },
      !many && { label: "Open in new tab", icon: ExternalLink, onSelect: () => void window.open(`/app/mail?t=${t.id}`, "_blank") },
      !many && !trash && { separator: true },
      !many && !trash && { label: "Reply", icon: Reply, shortcut: "r", onSelect: () => reply("reply") },
      !many && !trash && { label: "Reply all", icon: ReplyAll, shortcut: "a", onSelect: () => reply("replyAll") },
      !many && !trash && { label: "Forward", icon: Forward, shortcut: "f", onSelect: () => reply("forward") },
      { separator: true },
      trash
        ? { label: "Move to inbox", icon: Inbox, onSelect: () => patch(ids, { trashed: false, archived: false }) }
        : back
          ? { label: "Move to inbox", icon: Inbox, shortcut: "e", onSelect: () => patch(ids, { archived: false, snoozedUntil: null }) }
          : { label: "Archive", icon: Archive, shortcut: "e", onSelect: () => patch(ids, { archived: true }) },
      !trash && (t.unread
        ? { label: "Mark as read", icon: MailOpen, onSelect: () => patch(ids, { unread: false }) }
        : { label: "Mark as unread", icon: Mail, shortcut: "u", onSelect: () => patch(ids, { unread: true }) }),
      !trash && (t.starred
        ? { label: "Unstar", icon: StarOff, shortcut: "s", onSelect: () => patch(ids, { starred: false }) }
        : { label: "Star", icon: Star, shortcut: "s", onSelect: () => patch(ids, { starred: true }) }),
      !trash && { label: "Snooze", icon: Clock, items: snoozeActions((at) => patch(ids, { snoozedUntil: at }), () => setSnoozeIds(ids)) },
      { separator: true },
      !trash && (folder === "spam"
        ? { label: "Not spam", icon: ShieldCheck, shortcut: "!", onSelect: () => patch(ids, { spam: false }) }
        : { label: "Report spam", icon: ShieldAlert, shortcut: "!", onSelect: () => patch(ids, { spam: true }) }),
      trash
        ? {
            label: "Delete forever",
            icon: Trash2,
            destructive: true,
            confirm: { title: many ? `Delete ${ids.length} forever?` : "Delete forever?", description: "The threads and their files are removed. This can't be undone.", confirmLabel: "Delete forever" },
            onSelect: () => remove(ids),
          }
        : { label: "Move to trash", icon: Trash2, shortcut: "#", destructive: true, onSelect: () => patch(ids, { trashed: true }) },
      { separator: true },
      {
        label: selection.has(t.id) ? "Deselect" : "Select",
        icon: SquareCheck,
        shortcut: "x",
        onSelect: () => {
          const next = new Set(selection)
          if (next.has(t.id)) next.delete(t.id)
          else next.add(t.id)
          setSelection(next)
        },
      },
    ])
  }

  // Deep links and command-palette actions also work while Mail is already open.
  const readAddress = React.useEffectEvent(() => {
    const p = new URLSearchParams(window.location.search)
    setSelectedId(p.get("t"))
    setFolder(p.get("pane") === "outbox" ? "outbox" : p.get("pane") === "drafts" ? "drafts" : "inbox")
    if (p.get("compose") === "1" && props.mailboxes.length) {
      openCompose(p.get("to") ?? undefined)
      const url = new URL(location.href)
      url.searchParams.delete("compose")
      url.searchParams.delete("to")
      replaceUrl(url)
    }
    const key = p.get("draft")
    void syncDrafts().then(() => {
      if (!key) return
      const url = new URL(location.href)
      url.searchParams.delete("draft")
      replaceUrl(url)
      openDraft(key)
    }).catch(() => {})
  })
  React.useEffect(() => {
    readAddress()
    const read = () => readAddress()
    window.addEventListener(PANEL_NAVIGATION, read)
    return () => window.removeEventListener(PANEL_NAVIGATION, read)
  }, [])

  React.useEffect(() => {
    const sync = () => { if (document.visibilityState === "visible") void syncDrafts().catch(() => {}) }
    window.addEventListener("focus", sync)
    document.addEventListener("visibilitychange", sync)
    const timer = setInterval(sync, 30_000)
    return () => { clearInterval(timer); window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", sync) }
  }, [])

  // Keyboard shortcuts, like Gmail's; they pause while typing or with a dialog open.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutsPaused(e)) return
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
        Escape: () => (selection.size ? setSelection(new Set()) : closeItem()),
      }
      // Two-key "g" shortcuts jump to a folder: g i inbox, g s starred…
      if (gPending.current) {
        gPending.current = false
        const target = (Object.entries(FOLDER_KEYS) as [MailFolder, string][]).find(([, k]) => k === e.key)?.[0]
        if (target) {
          e.preventDefault()
          goFolder(target)
          return
        }
        // g 0 all mailboxes, g 1–9 the nth mailbox's inbox.
        const n = /^[0-9]$/.test(e.key) ? Number(e.key) : -1
        const box = n === 0 && multiple ? ALL_MAILBOXES : props.mailboxes[n - 1]
        if (n >= 0 && box) {
          e.preventDefault()
          openFolder(box, "inbox")
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
      </div>
    )
  }

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
    <LabelActions threadIds={virtual ? [] : selection.size ? [...selection] : selectedId ? [selectedId] : []} onApplied={() => { void loadThreads() }} onFilter={setQuery} />
    <div className="min-h-0 flex-1">
    <ThreadList
      mailboxes={props.mailboxes}
      mailbox={mailbox}
      onMailbox={(m) => {
        setMailbox(m)
        closeItem()
      }}
      unread={unread}
      folder={folder}
      onFolder={goFolder}
      query={query}
      onQuery={setQuery}
      searchRef={searchRef}
      threads={rows}
      hasMore={!virtual && hasMore}
      onLoadMore={loadMore}
      loading={!virtual && loading}
      selectedId={virtual ? item : selectedId}
      onOpen={virtual ? openItem : setSelectedId}
      selection={selection}
      onSelection={setSelection}
      onBulk={(change) => patch([...selection], change)}
      onBulkDelete={() => remove([...selection])}
      drafts={drafts}
      onCompose={() => openCompose()}
      onSettings={() => openSettings()}
      counts={{ drafts: draftCount, outbox: outboxCount }}
      bulkActions={
        folder === "drafts" ? (
          <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => discardDrafts([...selection])} aria-label="Discard drafts" title="Discard drafts">
            <Trash2 />
          </Button>
        ) : folder === "outbox" ? (
          <Button variant="ghost" size="sm" onClick={() => cancelSends([...selection].filter((id) => outboxJobs.find((x) => x.id === id)?.status === "pending"))}>
            <XIcon /> Cancel sends
          </Button>
        ) : undefined
      }
      rail={desktop}
      actionsFor={virtual ? itemActions : threadActions}
      account={props.account && !desktop ? <AccountMenu canManage={props.canManage} user={props.account} onSettings={openSettings} compact /> : null}
    />
    </div></div>
  )

  const sender = detail ? <SenderPanel detail={detail} multipleMailboxes={multiple} onOpen={setSelectedId} onCompose={openCompose} /> : null

  const draftPane =
    folder === "drafts" && item && !isThreadKey(item) ? (
      <ComposeWindow
        key={item}
        inline
        open
        prefill={null}
        draftKey={item}
        mailboxes={props.mailboxes}
        mailbox={mailbox === ALL_MAILBOXES ? props.mailboxes[0]! : mailbox}
        contacts={contacts}
        signatures={signatures}
        signatureBrand={props.signatureBrand}
        schedule={schedule}
        onClose={closeItem}
      />
    ) : job ? (
      <OutboxDetail
        job={job}
        onChanged={refreshOutbox}
        onOpenThread={(threadId) => {
          goFolder("sent")
          setSelectedId(threadId)
        }}
        onBack={desktop ? undefined : closeItem}
      />
    ) : null

  const threadPane =
    draftPane ?? (detail && selectedId ? (
      <ThreadView
        key={detail.thread.id}
        ref={threadRef}
        detail={detail}
        mailboxes={props.mailboxes}
        multipleMailboxes={multiple}
        contacts={contacts}
        signatureHtml={signaturePreview(signatures[detail.thread.mailbox], props.signatureBrand, detail.thread.mailbox)}
        schedule={schedule}
        onPatch={(change) => patch([detail.thread.id], change)}
        onDelete={() => remove([detail.thread.id])}
        onBack={closeItem}
        onInfo={wide ? undefined : () => setInfoOpen(true)}
      />
    ) : (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          variant="plain"
          icon={<Mail />}
          title={selectedId ? "Opening…" : folder === "drafts" ? "No draft open" : folder === "outbox" ? "No send open" : "No thread open"}
          description={
            <>
              Pick one on the left, or press <kbd className="bg-muted rounded px-1 font-mono text-xs">?</kbd> for shortcuts.
            </>
          }
        />
      </div>
    ))

  return (
    <TooltipProvider delayDuration={400}>
      <AppFrame ref={frameRef} userView={!!props.account}>
        {desktop ? (
          <FolderRail
            mailboxes={props.mailboxes}
            mailbox={mailbox}
            folder={folder}
            onOpen={openFolder}
            unread={unread}
            onCompose={() => openCompose()}
            onSettings={(m) => (m ? openSettingsDialog("signature", { mailbox: m }) : openSettings())}
            outboxJobs={outboxJobs}
            footer={props.account ? <AccountMenu canManage={props.canManage} user={props.account} onSettings={openSettings} /> : undefined}
          />
        ) : null}
        <div className="flex min-w-0 flex-1">
        <div className="min-w-0 flex-1">
        {desktop ? (
          <ResizablePanelGroup key={wide ? "wide" : "narrow"} orientation="horizontal">
            <ResizablePanel id="list" defaultSize={wide ? "28%" : "36%"} minSize="260px" maxSize="50%">
              {listPane}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="thread" minSize="360px">
              {threadPane}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (virtual ? item : selectedId) ? (
          <div className="h-full motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-8 motion-safe:duration-200">{threadPane}</div>
        ) : (
          listPane
        )}
        </div>
        {/* Outside the resizable group so it slides open instead of resizing the panes in one frame. Kept open while the next thread loads. */}
        {desktop && wide ? (
          <SidePanel open={!!detail || (!!selectedId && !virtual)} width="clamp(240px,18vw,320px)">
            {sender ? <aside className="h-full overflow-y-auto">{sender}</aside> : null}
          </SidePanel>
        ) : null}
        </div>
      </AppFrame>
      <SnoozeDialog open={!!snoozeIds} onOpenChange={(o) => !o && setSnoozeIds(null)} onSnooze={(at) => snoozeIds && patch(snoozeIds, { snoozedUntil: at })} />
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
        draftKey={compose.draftKey}
        mailboxes={props.mailboxes}
        mailbox={mailbox === ALL_MAILBOXES ? props.mailboxes[0]! : mailbox}
        contacts={contacts}
        signatures={signatures}
        signatureBrand={props.signatureBrand}
        schedule={schedule}
        onClose={() => setCompose((c) => ({ ...c, open: false }))}
      />
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
    </TooltipProvider>
  )
}
