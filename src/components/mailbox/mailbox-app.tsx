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
import { ConfirmButton } from "@/components/app/confirm-button"
import { EmptyState } from "@/components/app/empty-state"
import { ComposeWindow, sendSavedDraft, useUndoSend } from "./composer"
import { NEW_DRAFT, syncDrafts, syncTeamDrafts, useDraftKeys, useTeamDrafts, writeDraft } from "./drafts"
import { draftRows, isTeamRow, TeamDraftDetail, teamRowId, useDraftCount } from "./drafts-panel"
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
import { FilePen, MessagesSquare, Send, X as XIcon } from "lucide-react"
import { SnoozeDialog, ThreadView, snoozeActions, type ThreadViewHandle } from "./thread-view"
import { isVirtualFolder, type MailThread, type ReplyMode, type ThreadDetail, type ThreadPatch } from "./types"
import { onRefreshCounts, publishUnread, refreshBell } from "@/lib/mail/unread-badge"
import { t, tp } from "@/lib/i18n/panel"

const shortcuts = (): [string, string][] => [
  ["j / k", t("Next / previous thread")],
  ["g i", t("Go to inbox (g s starred, g t sent, g e archived)")],
  ["g 1–9", t("Go to a mailbox (g 0 all mailboxes)")],
  ["Enter", t("Open the first thread")],
  ["r / a / f", t("Reply / reply all / forward")],
  ["c", t("New e-mail")],
  ["e", t("Archive")],
  ["#", t("Move to trash")],
  ["u", t("Mark unread")],
  ["⇧ I", t("Mark read")],
  ["s", t("Star / unstar")],
  ["!", t("Report spam")],
  ["x", t("Select the thread")],
  ["/", t("Search")],
  ["Esc", t("Close the thread")],
  ["?", t("These shortcuts")],
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
  /** The signed-in person, for the account menu at the bottom of the rail. */
  account: MailUser
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
  const outboxCount = scheduledCount(outboxJobs)
  const queued = outboxCount > 0
  React.useEffect(() => {
    // Also while a send is queued, wherever the person is, so the rail's count drops once it goes out.
    if (folder !== "outbox" && !queued) return
    const timer = setInterval(refreshOutbox, 10_000)
    return () => clearInterval(timer)
  }, [folder, queued, refreshOutbox])
  const draftCount = useDraftCount(props.mailboxes)
  React.useEffect(() => {
    const url = new URL(location.href)
    if (isVirtualFolder(folder)) url.searchParams.set("pane", folder)
    else url.searchParams.delete("pane")
    replaceUrl(url)
  }, [folder])
  const [query, setQuery] = React.useState("")
  const [unreadOnly, setUnreadOnly] = React.useState(false)
  // The sender panel's collapsed state is a per-device preference.
  const [senderHidden, setSenderHidden] = React.useState(() => {
    try {
      return localStorage.getItem("mail:sender-hidden") === "1"
    } catch {
      return false
    }
  })
  const toggleSender = () =>
    setSenderHidden((h) => {
      try {
        localStorage.setItem("mail:sender-hidden", h ? "0" : "1")
      } catch {}
      return !h
    })
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
  // Phones: the folder rail as a side menu.
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)
  // The settings dialog opens at the mailbox in view; a signature saved there shows in the composer at once.
  // Plain "Settings" starts at the signature on desktop; phones get the list of sections first.
  const openSettings = (section?: SettingsSection) =>
    openSettingsDialog(section ?? (desktop ? "signature" : undefined), { mailbox: mailbox === ALL_MAILBOXES ? props.mailboxes[0] : mailbox })
  React.useEffect(
    () => onSettingsSaved((saved) => saved.kind === "signatures" && setSignatures(saved.signatures as Record<string, MailboxSignature>)),
    [],
  )
  const searchRef = React.useRef<HTMLInputElement>(null)
  const gPending = React.useRef(false)
  const threadRef = React.useRef<ThreadViewHandle>(null)
  const drafts = useDraftKeys()
  const teamDrafts = useTeamDrafts()
  const boxes = mailbox === ALL_MAILBOXES ? props.mailboxes : [mailbox]
  const contacts = React.useMemo(() => [...new Set([...threads.map((t) => t.contactEmail), ...(detail ? [detail.thread.contactEmail, ...detail.messages.flatMap((m) => [m.fromEmail])] : [])])], [threads, detail])

  const listUrl = React.useCallback(
    (before?: string) => {
      // Drafts and Outbox aren't server folders; the inbox keeps the unread counts fresh meanwhile.
      const p = new URLSearchParams({ mailbox, folder: isVirtualFolder(folder) ? "inbox" : folder })
      if (query.trim()) p.set("q", query.trim())
      else if (unreadOnly && folder === "inbox") p.set("unread", "1")
      if (before) p.set("before", String(new Date(before).getTime()))
      return `/api/app/mail/threads?${p}`
    },
    [mailbox, folder, query, unreadOnly],
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

  // Folder counts (and through them the sidebar / rail badge) after reading, archiving or moving threads.
  // The bell recounts too: the server's socket ping doesn't arrive with chat off or the socket down.
  const refreshUnread = React.useCallback(
    () => (refreshBell(), void api<{ unread: Record<string, number> }>("GET", listUrl()).then((r) => setUnread(r.unread)).catch(() => {})),
    [listUrl],
  )

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
      .then(refreshUnread)
      .catch((e) => {
        toast.error((e as Error).message)
        setSelectedId(null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loadDetail])

  // Refresh with notifications; polling also covers missed socket events.
  React.useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return
      const list = await loadThreads().catch(() => null)
      const open = list?.find((t) => t.id === selectedId)
      if (open && detail && open.lastMessageAt !== detail.thread.lastMessageAt) loadDetail(open.id).catch(() => {})
    }
    const timer = setInterval(tick, 30_000)
    const stopRefresh = onRefreshCounts(tick)
    document.addEventListener("visibilitychange", tick)
    return () => {
      stopRefresh()
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
      refreshUnread()
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
          ? t("Moved to the trash")
          : change.spam === true
            ? t("Reported as spam")
            : change.archived === true
              ? t("Archived")
              : change.snoozedUntil
                ? t("Snoozed")
                : change.starred !== undefined
                  ? null
                  : leaves
                    ? t("Moved to the inbox")
                    : null
      if (label) toast.success(ids.length > 1 ? t("{label}: {n}", { label, n: ids.length }) : label)
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
      toast.success(t("Deleted"))
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
    setSelectedId(isThreadKey(key) && !isTeamRow(key) ? key : null)
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
        ? draftRows(drafts, visibleBoxes, query, teamDrafts)
        : folder === "outbox"
          ? outboxRows(outboxJobs.filter((j) => !j.mailbox || visibleBoxes.includes(j.mailbox)), query, props.mailboxes[0] ?? "")
          : threads,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folder, drafts, teamDrafts, mailbox, query, outboxJobs, threads],
  )
  const job = folder === "outbox" && item ? outboxJobs.find((j) => j.id === item) : undefined
  async function cancelSends(ids: string[]) {
    const results = await Promise.allSettled(ids.map((id) => api("DELETE", `/api/app/mail/outbox/${id}`)))
    const failed = results.filter((r) => r.status === "rejected").length
    if (failed) toast.error(failed === ids.length ? t("Sending has already started") : t("{n} could not be cancelled: sending had started", { n: failed }))
    if (failed < ids.length) toast.success(ids.length - failed > 1 ? t("Sends cancelled: {n}", { n: ids.length - failed }) : t("Send cancelled"))
    setSelection(new Set())
    if (item && ids.includes(item)) setItem(null)
    refreshOutbox()
  }
  function discardDrafts(all: string[]) {
    const keys = all.filter((key) => !isTeamRow(key))
    if (!keys.length) return
    for (const key of keys) writeDraft(key, null)
    toast.success(keys.length > 1 ? t("Drafts discarded: {n}", { n: keys.length }) : t("Draft discarded"))
    setSelection(new Set())
    if (item && keys.includes(item)) closeItem()
  }
  /** Queues each selected draft (one at a time); the rest stay in Drafts with the reason. */
  async function sendDrafts(all: string[]) {
    const keys = all.filter((key) => !isTeamRow(key))
    if (!keys.length) return
    const id = toast.loading(t("Sending {n} drafts…", { n: keys.length }))
    const failed: string[] = []
    const left = new Set<string>()
    for (const key of keys) {
      try { await sendSavedDraft(key) } catch (e) {
        left.add(key)
        failed.push(`${rows.find((r) => r.id === key)?.subject || t("(no subject)")}: ${(e as Error).message}`)
      }
    }
    const sent = keys.length - failed.length
    if (failed.length) toast.error(sent ? t("{n} sent to the outbox, {m} left in Drafts", { n: sent, m: failed.length }) : t("Nothing sent"), { id, description: failed.join("\n"), duration: 0 })
    else toast.success(t("Queued for sending: {n}", { n: sent }), { id })
    setSelection(new Set())
    if (item && keys.includes(item) && !left.has(item)) closeItem()
    refreshOutbox()
  }
  /** Row menu in Drafts and Outbox, acting on the selection when the row is in it. */
  const itemActions = (row: MailThread): MenuAction[] => {
    const ids = selection.size > 1 && selection.has(row.id) ? [...selection] : [row.id]
    if (folder === "drafts" && isTeamRow(row.id)) return [{ label: t("Open"), icon: FilePen, onSelect: () => openDraft(row.id) }]
    if (folder === "drafts")
      return cleanActions([
        { label: t("Open"), icon: FilePen, onSelect: () => openDraft(row.id) },
        {
          label: ids.length > 1 ? t("Send {n} drafts", { n: ids.length }) : t("Send"),
          icon: Send,
          confirm: { title: ids.length > 1 ? t("Send {n} drafts?", { n: ids.length }) : t("Send this draft?"), description: t("Each one goes to the Outbox, where it can still be cancelled for a moment."), confirmLabel: t("Send") },
          onSelect: () => void sendDrafts(ids),
        },
        { separator: true },
        {
          label: ids.length > 1 ? t("Discard {n} drafts", { n: ids.length }) : t("Discard draft"),
          icon: Trash2,
          destructive: true,
          confirm: { title: ids.length > 1 ? t("Discard {n} drafts?", { n: ids.length }) : t("Discard this draft?"), description: t("Removed on every device."), confirmLabel: t("Discard") },
          onSelect: () => discardDrafts(ids),
        },
      ])
    const j = outboxJobs.find((x) => x.id === row.id)
    return cleanActions([
      ...(j?.threadId ? [{ label: t("Open thread"), icon: MessagesSquare, onSelect: () => { goFolder("sent"); setSelectedId(j.threadId!) } }] : []),
      ...(ids.some((id) => outboxJobs.find((x) => x.id === id)?.status === "pending")
        ? [{
            label: ids.length > 1 ? t("Cancel {n} sends", { n: ids.length }) : t("Cancel send"),
            icon: XIcon,
            destructive: true,
            confirm: { title: ids.length > 1 ? t("Cancel {n} sends?", { n: ids.length }) : t("Cancel this send?"), description: t("The e-mail is discarded and won't be sent."), confirmLabel: t("Cancel send") },
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
  const threadActions = (th: MailThread): MenuAction[] => {
    const ids = selection.size > 1 && selection.has(th.id) ? [...selection] : [th.id]
    const many = ids.length > 1
    const trash = folder === "trash"
    const back = folder === "archived" || folder === "snoozed"
    const reply = (mode: ReplyMode) => {
      if (selectedId === th.id && detail?.thread.id === th.id) threadRef.current?.reply(mode)
      else {
        pendingReply.current = { id: th.id, mode }
        setSelectedId(th.id)
      }
    }
    return cleanActions([
      many && { heading: tp(ids.length, { one: "{n} conversation", other: "{n} conversations" }) },
      !many && { label: t("Open"), icon: MailOpen, onSelect: () => setSelectedId(th.id) },
      !many && { label: t("Open in new tab"), icon: ExternalLink, onSelect: () => void window.open(`/app/mail?t=${th.id}`, "_blank") },
      !many && !trash && { separator: true },
      !many && !trash && { label: t("Reply"), icon: Reply, shortcut: "r", onSelect: () => reply("reply") },
      !many && !trash && { label: t("Reply all"), icon: ReplyAll, shortcut: "a", onSelect: () => reply("replyAll") },
      !many && !trash && { label: t("Forward"), icon: Forward, shortcut: "f", onSelect: () => reply("forward") },
      { separator: true },
      trash
        ? { label: t("Move to inbox"), icon: Inbox, onSelect: () => patch(ids, { trashed: false, archived: false }) }
        : back
          ? { label: t("Move to inbox"), icon: Inbox, shortcut: "e", onSelect: () => patch(ids, { archived: false, snoozedUntil: null }) }
          : { label: t("Archive"), icon: Archive, shortcut: "e", onSelect: () => patch(ids, { archived: true }) },
      !trash && (th.unread
        ? { label: t("Mark as read"), icon: MailOpen, onSelect: () => patch(ids, { unread: false }) }
        : { label: t("Mark as unread"), icon: Mail, shortcut: "u", onSelect: () => patch(ids, { unread: true }) }),
      !trash && (th.starred
        ? { label: t("Unstar"), icon: StarOff, shortcut: "s", onSelect: () => patch(ids, { starred: false }) }
        : { label: t("Star"), icon: Star, shortcut: "s", onSelect: () => patch(ids, { starred: true }) }),
      !trash && { label: t("Snooze"), icon: Clock, items: snoozeActions((at) => patch(ids, { snoozedUntil: at }), () => setSnoozeIds(ids)) },
      { separator: true },
      !trash && (folder === "spam"
        ? { label: t("Not spam"), icon: ShieldCheck, shortcut: "!", onSelect: () => patch(ids, { spam: false }) }
        : { label: t("Report spam"), icon: ShieldAlert, shortcut: "!", onSelect: () => patch(ids, { spam: true }) }),
      trash
        ? {
            label: t("Delete forever"),
            icon: Trash2,
            destructive: true,
            confirm: { title: many ? t("Delete {n} forever?", { n: ids.length }) : t("Delete forever?"), description: t("The threads and their files are removed. This can't be undone."), confirmLabel: t("Delete forever") },
            onSelect: () => remove(ids),
          }
        : { label: t("Move to trash"), icon: Trash2, shortcut: "#", destructive: true, onSelect: () => patch(ids, { trashed: true }) },
      { separator: true },
      {
        label: selection.has(th.id) ? t("Deselect") : t("Select"),
        icon: SquareCheck,
        shortcut: "x",
        onSelect: () => {
          const next = new Set(selection)
          if (next.has(th.id)) next.delete(th.id)
          else next.add(th.id)
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
    void syncTeamDrafts().catch(() => {})
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
    const sync = () => { if (document.visibilityState === "visible") { void syncDrafts().catch(() => {}); void syncTeamDrafts().catch(() => {}) } }
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
          if (ids.length && folder !== "trash") patch(ids, folder === "archived" ? { archived: false } : { archived: true })
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
        I: () => {
          const ids = selection.size ? [...selection] : selectedId ? [selectedId] : []
          if (ids.length) patch(ids, { unread: false })
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
        title={t("No mailbox yet")}
        description={props.canManage ? t("Add your domain and create mailboxes in the admin console.") : t("Ask an owner or admin of your organization to create your mailbox.")}
        action={props.canManage ? <Button asChild><a href="/admin/mail">{t("Set up mail")}</a></Button> : undefined}
      />
    )
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
      unread={unread}
      folder={folder}
      query={query}
      onQuery={setQuery}
      unreadOnly={unreadOnly}
      onUnreadOnly={setUnreadOnly}
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
      counts={{ drafts: draftCount, outbox: outboxCount }}
      bulkActions={
        folder === "drafts" ? (
          <>
          <ConfirmButton title={t("Send {n} drafts?", { n: selection.size })} description={t("Each one goes to the Outbox, where it can still be cancelled for a moment.")} confirmLabel={t("Send")} onConfirm={() => sendDrafts([...selection])}>
            <Button variant="ghost" size="sm">
              <Send /> {t("Send")}
            </Button>
          </ConfirmButton>
          <ConfirmButton title={t("Discard {n} drafts?", { n: selection.size })} description={t("The selected drafts are removed on every device. This can't be undone.")} confirmLabel={t("Discard")} onConfirm={() => discardDrafts([...selection])}>
            <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={t("Discard drafts")} title={t("Discard drafts")}>
              <Trash2 />
            </Button>
          </ConfirmButton>
          </>
        ) : folder === "outbox" ? (
          <ConfirmButton title={t("Cancel selected sends?")} description={t("The selected queued e-mails are discarded and won't be sent. Messages that have already started sending cannot be cancelled.")} confirmLabel={t("Cancel sends")} onConfirm={() => cancelSends([...selection].filter((id) => outboxJobs.find((x) => x.id === id)?.status === "pending"))}>
            <Button variant="ghost" size="sm">
              <XIcon /> {t("Cancel sends")}
            </Button>
          </ConfirmButton>
        ) : undefined
      }
      rail={desktop}
      actionsFor={virtual ? itemActions : threadActions}
      onMenu={() => setMenuOpen(true)}
      account={!desktop ? <AccountMenu canManage={props.canManage} user={props.account} onSettings={openSettings} compact /> : null}
    />
    </div></div>
  )

  const folderRail = (close?: () => void) => (
    <FolderRail
      canManage={props.canManage}
      mailboxes={props.mailboxes}
      mailbox={mailbox}
      folder={folder}
      onOpen={(m, f) => {
        openFolder(m, f)
        close?.()
      }}
      unread={unread}
      onCompose={() => {
        close?.()
        openCompose()
      }}
      onSettings={(m) => (m ? openSettingsDialog("signature", { mailbox: m }) : openSettings())}
      outboxJobs={outboxJobs}
      compact={!!close}
      footer={close ? undefined : <AccountMenu canManage={props.canManage} user={props.account} onSettings={openSettings} />}
    />
  )

  const sender = detail ? <SenderPanel detail={detail} multipleMailboxes={multiple} onOpen={setSelectedId} onCompose={openCompose} /> : null

  const teamDraft = folder === "drafts" && item && isTeamRow(item) ? teamDrafts.find((d) => teamRowId(d) === item) : undefined
  const draftPane =
    teamDraft ? (
      <TeamDraftDetail key={item} draft={teamDraft} onTaken={openDraft} onBack={desktop ? undefined : closeItem} />
    ) : folder === "drafts" && item && !isThreadKey(item) ? (
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
        onInfo={wide ? toggleSender : () => setInfoOpen(true)}
      />
    ) : (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          variant="plain"
          icon={<Mail />}
          title={selectedId ? t("Opening…") : folder === "drafts" ? t("No draft open") : folder === "outbox" ? t("No send open") : t("No thread open")}
          description={
            <>
              {t("Pick one on the left, or press ? for shortcuts.")}
            </>
          }
        />
      </div>
    ))

  return (
    <TooltipProvider delayDuration={400}>
      <AppFrame ref={frameRef}>
        {desktop ? folderRail() : null}
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
          <SidePanel open={!senderHidden && (!!detail || (!!selectedId && !virtual))} width="clamp(240px,18vw,320px)">
            {sender ? <aside className="h-full overflow-y-auto">{sender}</aside> : null}
          </SidePanel>
        ) : null}
        </div>
      </AppFrame>
      <SnoozeDialog open={!!snoozeIds} onOpenChange={(o) => !o && setSnoozeIds(null)} onSnooze={(at) => snoozeIds && patch(snoozeIds, { snoozedUntil: at })} />
      <Sheet open={menuOpen && !desktop} onOpenChange={setMenuOpen}>
        {/* !w-full beats the rail's own width (an inline CSS variable). */}
        <SheetContent side="left" showCloseButton={false} className="w-[85vw] max-w-xs gap-0 p-0 pt-[env(safe-area-inset-top)] [&>div]:!w-full [&>div]:border-r-0">
          <SheetTitle className="sr-only">{t("Folders")}</SheetTitle>
          {folderRail(() => setMenuOpen(false))}
        </SheetContent>
      </Sheet>
      <Sheet open={infoOpen && !wide} onOpenChange={setInfoOpen}>
        <SheetContent className="w-[22rem] max-w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("Sender")}</SheetTitle>
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
            <DialogTitle>{t("Keyboard shortcuts")}</DialogTitle>
            <DialogDescription>{t("They pause while you type.")}</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 text-sm">
            {shortcuts().map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>
                  <span className="flex items-center gap-1">
                    {keys.split(" ").map((k, i) => (k === "/" && i > 0 ? <span key={i} className="text-muted-foreground text-xs">{t("or")}</span> : <Kbd key={i}>{k}</Kbd>))}
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
