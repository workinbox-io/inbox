/**
 * /app/chat: team chat on the workspace kit, laid out like Slack. The rail has Threads, Mentions and Saved, then
 * channels and direct messages; the middle is the conversation; threads open on the right (over it on narrow
 * screens). Live through the org's ChatRoom socket (use-chat-socket.ts); D1 stays the source of truth.
 */
import * as React from "react"
import {
  ArrowLeft,
  AtSign,
  Bell,
  BellOff,
  Bookmark,
  Check,
  Hash,
  Lock,
  LogOut,
  MessagesSquare,
  Pencil,
  Pin,
  Plus,
  Search,
  SearchX,
  Archive,
  Users,
  X,
} from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { ActionMenuButton, cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import { AppFrame } from "@/components/workspace/app-frame"
import { PresenceAvatar, type Presence } from "@/components/workspace/presence-avatar"
import { openCommandPalette, useAppCommands } from "@/components/workspace/app-commands"
import { IconAction } from "@/components/workspace/detail-header"
import { ListEmpty } from "@/components/workspace/list-pane"
import { Rail, RailAction, RailItem, RailList, RailSection, RailSectionButton } from "@/components/workspace/rail"
import { SidePanel } from "@/components/workspace/split-view"
import { Kbd, shortcutsPaused, useAppLayout } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import { decodeMentions, encodeMentions, plainChat } from "@/lib/chat/format"
import { parseRefs, replaceRef } from "@/lib/mentions"
import { useMentionAccess } from "@/components/workspace/mentions"
import { startsGroup, unreadMarker } from "@/lib/chat/rules"
import type { ChatChannel, ChatEvent, ChatFile, ChatHit, ChatMessage, ChatPerson, ChatView } from "@/lib/chat/types"
import { t } from "@/lib/i18n/panel"
import { publishChatUnread } from "@/lib/mail/unread-badge"
import { PANEL_NAVIGATION, pushUrl, replaceUrl } from "@/lib/panel-history"
import { cn } from "@/lib/utils"
import { Composer, type ComposerHandle } from "./composer"
import { clock, dayLabel, firstName, MessageRow, RichText, type MessageHandlers } from "./message-row"
import { useChatSocket } from "./use-chat-socket"

export interface ChatAppProps {
  user: { id: string; name: string; email: string }
  channels: ChatChannel[]
  counts: { threads: number }
  people: ChatPerson[]
  selectedId: string | null
  canManage: boolean
  /** The user view: full screen, the account menu at the bottom of the rail. */
  account?: MailUser
}

interface Page {
  messages: ChatMessage[]
  hasMore: boolean
  pins: ChatMessage[]
}

type Route = { channelId: string } | { view: ChatView }

const VIEWS: { value: ChatView; label: string; icon: typeof AtSign; empty: string }[] = [
  { value: "threads", label: "Threads", icon: MessagesSquare, empty: "Threads you started, replied to or were mentioned in show up here." },
  { value: "mentions", label: "Mentions", icon: AtSign, empty: "When someone @mentions you, it lands here." },
  { value: "saved", label: "Saved", icon: Bookmark, empty: "Hover a message and press the bookmark to keep it here for later." },
]

const replaceMessage = (list: ChatMessage[], m: ChatMessage) => list.map((x) => (x.id === m.id ? { ...m, saved: m.saved || x.saved } : x))
const appendMessage = (list: ChatMessage[], m: ChatMessage) => (list.some((x) => x.id === m.id) ? replaceMessage(list, m) : [...list, m])

export function ChatApp(props: ChatAppProps) {
  const me = props.user.id
  const [channels, setChannels] = React.useState(props.channels)
  const [counts, setCounts] = React.useState(props.counts)
  const [people] = React.useState(props.people)
  const mentionAccess = useMentionAccess()
  const peopleById = React.useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const nameOf = React.useCallback((id: string) => peopleById.get(id)?.name, [peopleById])
  const initial = props.selectedId ?? channels.find((c) => c.name === "general" && c.kind === "channel")?.id ?? channels[0]?.id ?? ""
  const [route, setRoute] = React.useState<Route>(() => ({ channelId: initial }))
  const [pages, setPages] = React.useState<Record<string, Page>>({})
  const [threadId, setThreadId] = React.useState<string | null>(null)
  const [thread, setThread] = React.useState<{ root: ChatMessage; replies: ChatMessage[] } | null>(null)
  const [hits, setHits] = React.useState<ChatHit[] | null>(null)
  const [presence, setPresence] = React.useState<{ online: Set<string>; away: Set<string> }>({ online: new Set(), away: new Set() })
  const [typing, setTyping] = React.useState<Record<string, { userId: string; until: number }[]>>({})
  const [markers, setMarkers] = React.useState<Record<string, string | null>>({})
  const [search, setSearch] = React.useState<string | null>(null)
  const [results, setResults] = React.useState<ChatMessage[] | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [editingTopic, setEditingTopic] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [flash, setFlash] = React.useState<string | null>(null)
  const [mobileRail, setMobileRail] = React.useState(!props.selectedId)
  const composer = React.useRef<ComposerHandle>(null)
  const threadComposer = React.useRef<ComposerHandle>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const atBottom = React.useRef(true)
  const { ref: frameRef, desktop, wide } = useAppLayout()
  const userView = !!props.account

  const channelId = "channelId" in route ? route.channelId : null
  const channel = channels.find((c) => c.id === channelId) ?? null
  const page = channelId ? pages[channelId] : undefined
  const routeRef = React.useRef(route)
  routeRef.current = route
  const threadRef = React.useRef(threadId)
  threadRef.current = threadId

  const channelName = React.useCallback(
    (c: ChatChannel) => {
      if (c.kind === "channel") return c.name
      const others = c.memberIds.filter((id) => id !== me)
      return others.length ? others.map((id) => peopleById.get(id)?.name ?? t("Former member")).join(", ") : `${props.user.name} (${t("you")})`
    },
    [me, peopleById, props.user.name],
  )
  const dmPerson = (c: ChatChannel) => (c.kind === "dm" ? peopleById.get(c.memberIds.find((id) => id !== me) ?? me) : undefined)
  const label = (c: ChatChannel) => (c.kind === "channel" ? `#${c.name}` : channelName(c))

  // ---- Loading ------------------------------------------------------------------------------------------------

  const refreshChannels = React.useCallback(async () => {
    const res = await api<{ channels: ChatChannel[]; counts: { threads: number } }>("GET", "/api/app/chat")
    setChannels(res.channels)
    setCounts(res.counts)
    return res.channels
  }, [])

  const loadChannel = React.useCallback(async (id: string) => {
    const res = await api<Page & { channel: ChatChannel }>("GET", `/api/app/chat/channels/${id}`)
    setPages((p) => ({ ...p, [id]: { messages: res.messages, hasMore: res.hasMore, pins: res.pins ?? [] } }))
    setChannels((list) => (list.some((c) => c.id === id) ? list.map((c) => (c.id === id ? { ...res.channel, unread: c.unread, mentions: c.mentions } : c)) : [...list, res.channel]))
    return res
  }, [])

  const markRead = React.useCallback((id: string) => {
    setChannels((list) => list.map((c) => (c.id === id ? { ...c, unread: 0, mentions: 0, lastReadAt: Date.now() } : c)))
    void api("PATCH", `/api/app/chat/channels/${id}`, { action: "read" }).catch(() => {})
  }, [])

  // Opening a channel: remember where the "New" line goes, load it, mark it read.
  React.useEffect(() => {
    if (!channelId) return
    const c = channels.find((x) => x.id === channelId)
    const lastRead = c?.lastReadAt ?? Date.now()
    const hadUnread = !!c?.unread
    void loadChannel(channelId)
      .then((res) => {
        setMarkers((m) => ({ ...m, [channelId]: hadUnread ? unreadMarker(res.messages, lastRead, me) : null }))
        if (res.channel.joined) markRead(channelId)
      })
      .catch((e: Error) => toast.error(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  React.useEffect(() => {
    if (!("view" in route)) return
    setHits(null)
    void api<{ hits: ChatHit[] }>("GET", `/api/app/chat/views?view=${route.view}`)
      .then((r) => setHits(r.hits))
      .catch((e: Error) => toast.error(e.message))
  }, [route])

  React.useEffect(() => {
    if (!threadId) return setThread(null)
    void api<{ root: ChatMessage; replies: ChatMessage[] }>("GET", `/api/app/chat/messages/${threadId}`)
      .then((r) => {
        setThread(r)
        setCounts((c) => ({ ...c, threads: Math.max(0, c.threads - 1) }))
      })
      .catch((e: Error) => {
        toast.error(e.message)
        setThreadId(null)
      })
  }, [threadId])

  // Search in the open channel, after typing pauses.
  React.useEffect(() => {
    const q = search?.trim()
    if (!q || !channelId) return setResults(null)
    const timer = window.setTimeout(() => {
      void api<Page>("GET", `/api/app/chat/channels/${channelId}?q=${encodeURIComponent(q)}`).then((r) => setResults(r.messages))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, channelId])

  // ---- Navigation -----------------------------------------------------------------------------------------------

  const writeUrl = (next: Route, thread: string | null, push = true) => {
    const url = new URL(location.href)
    url.pathname = "channelId" in next && next.channelId ? `/app/chat/${next.channelId}` : "/app/chat"
    url.search = ""
    if ("view" in next) url.searchParams.set("view", next.view)
    if (thread) url.searchParams.set("thread", thread)
    if (push) pushUrl(url)
    else replaceUrl(url)
  }

  const openChannel = React.useCallback((id: string, opts: { thread?: string | null; flash?: string } = {}) => {
    setRoute({ channelId: id })
    setThreadId(opts.thread ?? null)
    setSearch(null)
    setEditingId(null)
    setMobileRail(false)
    if (opts.flash) setFlash(opts.flash)
    writeUrl({ channelId: id }, opts.thread ?? null)
    requestAnimationFrame(() => composer.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openView = (view: ChatView) => {
    setRoute({ view })
    setThreadId(null)
    setSearch(null)
    setMobileRail(false)
    writeUrl({ view }, null)
  }

  const openThread = (m: ChatMessage) => {
    setThreadId(m.id)
    writeUrl(route, m.id, false)
    requestAnimationFrame(() => threadComposer.current?.focus())
  }
  const closeThread = () => {
    setThreadId(null)
    writeUrl(route, null, false)
    composer.current?.focus()
  }

  // ?view=, ?thread=, ?m= on load (links from push notifications), and back/forward.
  React.useEffect(() => {
    const read = () => {
      const url = new URL(location.href)
      const id = /^\/app\/chat\/([0-9a-f-]{36})/.exec(url.pathname)?.[1]
      const view = url.searchParams.get("view") as ChatView | null
      if (view && VIEWS.some((v) => v.value === view)) setRoute({ view })
      else if (id) setRoute({ channelId: id })
      else setRoute({ channelId: initial })
      setThreadId(url.searchParams.get("thread"))
      const m = url.searchParams.get("m")
      if (m) setFlash(m)
    }
    read()
    window.addEventListener(PANEL_NAVIGATION, read)
    return () => window.removeEventListener(PANEL_NAVIGATION, read)
  }, [])

  // ---- Live events --------------------------------------------------------------------------------------------

  const onEvent = React.useCallback(
    (e: ChatEvent) => {
      const here = routeRef.current
      const visible = document.visibilityState === "visible"
      switch (e.type) {
        case "message": {
          const m = e.message
          if (m.parentId) {
            if (threadRef.current === m.parentId) setThread((th) => (th ? { ...th, replies: appendMessage(th.replies, m) } : th))
            const key = `thread:${m.parentId}`
            setTyping((ty) => ({ ...ty, [key]: (ty[key] ?? []).filter((x) => x.userId !== m.authorId) }))
            if (m.authorId !== me && m.text.includes(`<@${me}>`)) setCounts((c) => ({ ...c, threads: c.threads + 1 }))
            break
          }
          setPages((p) => (p[m.channelId] ? { ...p, [m.channelId]: { ...p[m.channelId]!, messages: appendMessage(p[m.channelId]!.messages, m) } } : p))
          const open = "channelId" in here && here.channelId === m.channelId && visible
          setChannels((list) => {
            if (!list.some((c) => c.id === m.channelId)) {
              void refreshChannels()
              return list
            }
            return list.map((c) =>
              c.id !== m.channelId
                ? c
                : {
                    ...c,
                    lastMessageAt: m.createdAt,
                    unread: !open && c.joined && m.authorId !== me ? c.unread + 1 : c.unread,
                    mentions: !open && c.joined && m.text.includes(`<@${me}>`) ? c.mentions + 1 : c.mentions,
                  },
            )
          })
          if (open && m.authorId !== me) markRead(m.channelId)
          setTyping((ty) => ({ ...ty, [m.channelId]: (ty[m.channelId] ?? []).filter((x) => x.userId !== m.authorId) }))
          break
        }
        case "message.updated": {
          const m = e.message
          setPages((p) => (p[m.channelId] ? { ...p, [m.channelId]: { ...p[m.channelId]!, messages: replaceMessage(p[m.channelId]!.messages, m) } } : p))
          setThread((th) => (th ? { root: th.root.id === m.id ? { ...m, saved: th.root.saved } : th.root, replies: replaceMessage(th.replies, m) } : th))
          setHits((h) => h?.map((x) => (x.message.id === m.id ? { ...x, message: { ...m, saved: x.message.saved } } : x)) ?? h)
          break
        }
        case "message.deleted":
          setPages((p) => {
            const pg = p[e.channelId]
            if (!pg) return p
            return { ...p, [e.channelId]: { ...pg, messages: pg.messages.flatMap((x) => (x.id !== e.id ? [x] : x.replyCount ? [{ ...x, deleted: true, text: "", files: [], reactions: [] }] : [])) } }
          })
          setThread((th) => (th ? { ...th, replies: th.replies.filter((x) => x.id !== e.id) } : th))
          break
        case "channel":
          void refreshChannels()
          break
        case "typing": {
          const key = e.parentId ? `thread:${e.parentId}` : e.channelId
          setTyping((ty) => ({ ...ty, [key]: [...(ty[key] ?? []).filter((x) => x.userId !== e.userId), { userId: e.userId, until: Date.now() + 5000 }] }))
          break
        }
        case "presence":
          setPresence({ online: new Set(e.online), away: new Set(e.away) })
          break
      }
    },
    [me, markRead, refreshChannels],
  )

  const connected = useChatSocket(onEvent, () => {
    void refreshChannels()
    const here = routeRef.current
    if ("channelId" in here && here.channelId) void loadChannel(here.channelId)
  })

  // Typing indicators fade out on their own.
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setTyping((ty) => {
        const now = Date.now()
        let changed = false
        const next: typeof ty = {}
        for (const [k, list] of Object.entries(ty)) {
          const kept = list.filter((x) => x.until > now)
          if (kept.length !== list.length) changed = true
          if (kept.length) next[k] = kept
        }
        return changed ? next : ty
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Marks the open channel read when coming back to the tab.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !channelId) return
      if (channels.find((c) => c.id === channelId)?.unread) markRead(channelId)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [channelId, channels, markRead])

  const lastTyping = React.useRef(0)
  const sendTyping = (parentId: string | null) => {
    if (!channelId || Date.now() - lastTyping.current < 3000) return
    lastTyping.current = Date.now()
    void api("POST", `/api/app/chat/channels/${channelId}/typing`, { parentId }).catch(() => {})
  }

  // ---- Scrolling ----------------------------------------------------------------------------------------------

  const count = page?.messages.length ?? 0
  React.useLayoutEffect(() => {
    const el = scroller.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [count, channelId])
  React.useLayoutEffect(() => {
    atBottom.current = true
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [channelId, results])
  React.useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => atBottom.current && (el.scrollTop = el.scrollHeight))
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [channelId, page === undefined])
  React.useEffect(() => {
    if (!flash || !page) return
    const target = scroller.current?.querySelector<HTMLElement>(`[data-msg="${flash}"]`)
    if (target) {
      atBottom.current = false
      target.scrollIntoView({ block: "center" })
    }
    const timer = window.setTimeout(() => setFlash(null), 1600)
    return () => window.clearTimeout(timer)
  }, [flash, page])

  const loadOlder = async () => {
    if (!channelId || !page?.messages.length) return
    const el = scroller.current
    const before = el?.scrollHeight ?? 0
    const res = await api<Page>("GET", `/api/app/chat/channels/${channelId}?before=${page.messages[0]!.createdAt}`)
    setPages((p) => ({ ...p, [channelId]: { ...p[channelId]!, messages: [...res.messages, ...p[channelId]!.messages], hasMore: res.hasMore } }))
    requestAnimationFrame(() => el && (el.scrollTop += el.scrollHeight - before))
  }

  // ---- Actions ------------------------------------------------------------------------------------------------

  const updateEverywhere = (m: ChatMessage) => {
    setPages((p) => (p[m.channelId] ? { ...p, [m.channelId]: { ...p[m.channelId]!, messages: p[m.channelId]!.messages.map((x) => (x.id === m.id ? m : x)), pins: m.pinned ? appendMessage(p[m.channelId]!.pins.filter((x) => x.id !== m.id), m) : p[m.channelId]!.pins.filter((x) => x.id !== m.id) } } : p))
    setThread((th) => (th ? { root: th.root.id === m.id ? m : th.root, replies: th.replies.map((x) => (x.id === m.id ? m : x)) } : th))
    setHits((h) => (h ? (route as { view?: ChatView }).view === "saved" && !m.saved ? h.filter((x) => x.message.id !== m.id) : h.map((x) => (x.message.id === m.id ? { ...x, message: m } : x)) : h))
  }

  const patch = async (m: ChatMessage, body: Record<string, unknown>) => {
    try {
      updateEverywhere(await api<ChatMessage>("PATCH", `/api/app/chat/messages/${m.id}`, body))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handlers: MessageHandlers = {
    onReact: (m, emoji) => void patch(m, { action: "react", emoji }),
    onSave: (m) => {
      void patch(m, { action: "save", saved: !m.saved })
      toast.success(m.saved ? t("Removed from saved") : t("Saved for later"))
    },
    onPin: (m) => void patch(m, { action: "pin", pinned: !m.pinned }),
    onEdit: async (m, text) => {
      const next = encodeMentions(text, people, parseRefs(m.text))
      if (next === m.text) return
      await patch(m, { action: "edit", text: next })
    },
    onDelete: async (m) => {
      try {
        await api("DELETE", `/api/app/chat/messages/${m.id}`)
        onEvent({ type: "message.deleted", id: m.id, channelId: m.channelId, parentId: m.parentId })
        if (threadId === m.id) closeThread()
      } catch (e) {
        toast.error((e as Error).message)
      }
    },
    onOpenThread: openThread,
    onCopyLink: (m) => {
      const url = new URL(`/app/chat/${m.channelId}`, location.href)
      if (m.parentId) url.searchParams.set("thread", m.parentId)
      url.searchParams.set("m", m.id)
      void navigator.clipboard.writeText(url.toString()).then(() => toast.success(t("Link copied")))
    },
  }

  const send = async (text: string, files: ChatFile[], parentId: string | null) => {
    if (!channelId) return
    try {
      let body = encodeMentions(text, people)
      // Mentioned something some of the channel can't open: the sender picks access or a link first.
      const linked = await mentionAccess.check(parseRefs(body), { channelId })
      if (!linked) throw new Error("cancelled")
      for (const r of linked) body = replaceRef(body, r)
      const m = await api<ChatMessage>("POST", "/api/app/chat/messages", { channelId, parentId, text: body, files })
      atBottom.current = true
      onEvent({ type: "message", message: m })
      if (!channel?.joined) void refreshChannels()
    } catch (e) {
      if ((e as Error).message !== "cancelled") toast.error((e as Error).message)
      throw e
    }
  }

  const channelPatch = async (c: ChatChannel, body: Record<string, unknown>) => {
    try {
      await api("PATCH", `/api/app/chat/channels/${c.id}`, body)
      const list = await refreshChannels()
      if (body.action === "leave" || body.action === "archive") {
        if (channelId === c.id && (c.private || body.action === "archive")) {
          const general = list.find((x) => x.name === "general" && x.kind === "channel")
          if (general) openChannel(general.id)
        }
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const createChannel = async (input: { name: string; topic: string; private: boolean }) => {
    try {
      const c = await api<ChatChannel>("POST", "/api/app/chat/channels", input)
      setChannels((list) => [...list.filter((x) => x.id !== c.id), c])
      setCreating(false)
      openChannel(c.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const openDm = async (userId: string) => {
    try {
      const c = await api<ChatChannel>("POST", "/api/app/chat/dm", { userIds: [userId] })
      setChannels((list) => (list.some((x) => x.id === c.id) ? list : [...list, c]))
      openChannel(c.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const channelActions = (c: ChatChannel): MenuAction[] =>
    cleanActions([
      c.unread > 0 && { label: t("Mark as read"), icon: Check, onSelect: () => markRead(c.id) },
      c.joined && { label: c.muted ? t("Unmute") : t("Mute"), icon: c.muted ? Bell : BellOff, onSelect: () => channelPatch(c, { action: "mute", muted: !c.muted }) },
      c.kind === "channel" && c.joined && { label: t("Edit topic"), icon: Pencil, onSelect: () => (openChannel(c.id), setEditingTopic(true)) },
      c.kind === "channel" && c.joined && c.name !== "general" && { separator: true },
      c.kind === "channel" && c.joined && c.name !== "general" && { label: t("Leave channel"), icon: LogOut, onSelect: () => channelPatch(c, { action: "leave" }) },
      c.kind === "channel" &&
        c.name !== "general" &&
        (c.createdBy === me || props.canManage) && {
          label: t("Archive channel"),
          icon: Archive,
          destructive: true,
          confirm: { title: t("Archive #{name}?").replace("{name}", c.name), description: t("It disappears from everyone's list. Messages stay in the database."), confirmLabel: t("Archive") },
          onSelect: () => channelPatch(c, { action: "archive" }),
        },
    ])

  // ---- Shortcuts ----------------------------------------------------------------------------------------------

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        openCommandPalette()
        return
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault()
        const list = channels.filter((c) => c.joined)
        const at = list.findIndex((c) => c.id === channelId)
        const next = list[(at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]
        if (next) openChannel(next.id)
        return
      }
      if (e.key === "Escape" && threadId && !document.querySelector("[role=dialog][data-state=open], [role=menu]")) {
        closeThread()
        return
      }
      if (shortcutsPaused(e)) return
      if (e.key === "/") {
        e.preventDefault()
        if (channelId) setSearch("")
      } else if (e.key === "c") {
        e.preventDefault()
        composer.current?.focus()
      } else if (e.key.length === 1 && /\S/.test(e.key) && channelId) composer.current?.focus()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  // The app rail's and sidebar's "Chat" badge follows the rail here without waiting for its poll.
  const badge = channels.reduce((n, c) => n + c.mentions + (c.kind === "dm" && !c.muted ? c.unread : 0), 0)
  React.useEffect(() => publishChatUnread(badge), [badge])

  // Chat's part of the shared ⌘K: conversations, people (opens a DM), channels to join, the views.
  useAppCommands({
    placeholder: t("Jump to a channel or person, or search…"),
    groups: () => [
      {
        heading: t("Conversations"),
        items: channels
          .filter((c) => c.joined)
          .map((c) => ({
            id: `chat:${c.id}`,
            label: label(c),
            description: c.kind === "channel" ? c.topic || undefined : undefined,
            icon: c.kind === "dm" ? avatar(dmPerson(c), 18, false) : c.private ? <Lock /> : <Hash />,
            keywords: c.kind === "channel" ? [c.name] : [],
            onSelect: () => openChannel(c.id),
          })),
      },
      {
        heading: t("People"),
        items: people
          .filter((p) => p.id !== me && !channels.some((c) => c.kind === "dm" && c.memberIds.length === 2 && c.memberIds.includes(p.id)))
          .map((p) => ({ id: `chat-dm:${p.id}`, label: p.name, description: p.email, icon: avatar(p, 18, false), keywords: [p.email], onSelect: () => void openDm(p.id) })),
      },
      {
        heading: t("Channels to join"),
        items: channels
          .filter((c) => c.kind === "channel" && !c.joined)
          .map((c) => ({ id: `chat-join:${c.id}`, label: `#${c.name}`, description: c.topic || t("{n} members").replace("{n}", String(c.memberIds.length)), icon: <Hash />, onSelect: () => openChannel(c.id) })),
      },
      {
        heading: t("Chat"),
        items: [
          ...VIEWS.map((v) => ({ id: `chat-view:${v.value}`, label: t(v.label), icon: <v.icon />, onSelect: () => openView(v.value) })),
          { id: "chat-new-channel", label: t("Create a channel"), icon: <Plus />, onSelect: () => setCreating(true) },
        ],
      },
    ],
  })

  // ---- Rendering ----------------------------------------------------------------------------------------------

  const typingLine = (key: string) => {
    const who = (typing[key] ?? []).filter((x) => x.userId !== me).map((x) => firstName(peopleById.get(x.userId)))
    if (!who.length) return null
    return who.length === 1 ? t("{name} is typing").replace("{name}", who[0]!) : t("{names} are typing").replace("{names}", who.join(", "))
  }

  const statusOf = (userId: string): Presence => (presence.online.has(userId) ? "active" : presence.away.has(userId) ? "away" : "offline")

  const avatar = (p: ChatPerson | undefined, size = 18, dot = true) => <PresenceAvatar seed={p?.email ?? "?"} size={size} status={dot && p ? statusOf(p.id) : undefined} />

  const channelRow = (c: ChatChannel) => {
    const loud = !c.muted && (c.unread > 0 || c.mentions > 0)
    const active = channelId === c.id
    const person = dmPerson(c)
    return (
      <RailItem
        key={c.id}
        leading={c.kind === "dm" ? avatar(person) : c.private ? <Lock className="text-muted-foreground size-3.5 shrink-0" /> : <Hash className="text-muted-foreground size-3.5 shrink-0" />}
        label={
          <span className={cn("flex items-center gap-1.5", loud && !active && "text-foreground font-semibold", c.muted && "opacity-60")}>
            <span className="truncate">{channelName(c)}</span>
            {c.muted ? <BellOff className="size-3 shrink-0" aria-label={t("Muted")} /> : null}
            {c.mentions > 0 ? (
              <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white tabular-nums">{c.mentions}</span>
            ) : c.unread > 0 && c.kind === "dm" ? (
              <span className="bg-foreground text-background ml-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">{c.unread}</span>
            ) : null}
          </span>
        }
        title={label(c)}
        active={active}
        onClick={() => openChannel(c.id)}
        actions={() => channelActions(c)}
      />
    )
  }

  const joinedChannels = channels.filter((c) => c.kind === "channel" && c.joined)
  const dms = channels.filter((c) => c.kind === "dm")
  const unjoined = channels.filter((c) => c.kind === "channel" && !c.joined)

  const rail = (
    <Rail
      label={t("Chat")}
      hint={
        <>
          <Kbd>⌘K</Kbd> {t("Jump to")} <Kbd>⌥↑↓</Kbd> {t("Switch")}
        </>
      }
      footer={props.account ? <AccountMenu user={props.account} canManage={props.canManage} /> : undefined}
    >
      <RailAction icon={Search} label={t("Jump to…")} shortcut="⌘K" onClick={openCommandPalette} />
      <RailList>
        {VIEWS.map((v) => (
          <RailItem
            key={v.value}
            icon={v.icon}
            label={t(v.label)}
            active={"view" in route && route.view === v.value}
            count={v.value === "threads" ? counts.threads : undefined}
            onClick={() => openView(v.value)}
          />
        ))}
      </RailList>
      <RailSection
        title={t("Channels")}
        action={
          <span className="flex items-center gap-0.5">
            {unjoined.length ? (
              <RailSectionButton label={t("Browse channels")} onClick={openCommandPalette}>
                <Search />
              </RailSectionButton>
            ) : null}
            <RailSectionButton label={t("Create a channel")} onClick={() => setCreating(true)}>
              <Plus />
            </RailSectionButton>
          </span>
        }
      >
        <RailList>{joinedChannels.map(channelRow)}</RailList>
      </RailSection>
      <RailSection
        title={t("Direct messages")}
        action={
          <RailSectionButton label={t("New direct message")} onClick={openCommandPalette}>
            <Plus />
          </RailSectionButton>
        }
      >
        {dms.length ? <RailList>{dms.map(channelRow)}</RailList> : <p className="text-muted-foreground px-2 text-xs">{t("Nobody yet. Press + to message someone.")}</p>}
      </RailSection>
    </Rail>
  )

  const backButton = !desktop ? (
    <Button variant="ghost" size="icon-sm" aria-label={t("Conversations")} onClick={() => setMobileRail(true)}>
      <ArrowLeft />
    </Button>
  ) : null

  const messageList = (list: ChatMessage[], opts: { marker?: string | null; searching?: boolean }) =>
    list.map((m, i) => {
      const prev = list[i - 1]
      const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
      const grouped = !opts.searching && !newDay && opts.marker !== m.id && !m.saved && !m.pinned && !prev.deleted && !startsGroup(prev, m)
      return (
        <React.Fragment key={m.id}>
          {newDay ? (
            <div className="relative my-3 flex items-center justify-center" role="separator">
              <span className="bg-border absolute inset-x-4 h-px" />
              <span className="bg-background text-muted-foreground relative rounded-full border px-2.5 text-xs leading-5 font-medium" suppressHydrationWarning>
                {dayLabel(m.createdAt)}
              </span>
            </div>
          ) : null}
          {opts.marker === m.id ? (
            <div className="relative my-1.5 flex items-center" role="separator" aria-label={t("New messages")}>
              <span className="absolute inset-x-4 h-px bg-red-500/50" />
              <span className="bg-background relative mr-4 ml-auto pl-2 text-[11px] font-semibold text-red-600">{t("New")}</span>
            </div>
          ) : null}
          <MessageRow
            message={m}
            grouped={grouped}
            people={peopleById}
            me={me}
            canModerate={props.canManage && channel?.kind === "channel"}
            active={threadId === m.id}
            flash={flash === m.id}
            editing={editingId === m.id}
            setEditing={(on) => {
              setEditingId(on ? m.id : null)
              if (!on) composer.current?.focus()
            }}
            editText={decodeMentions(m.text, nameOf)}
            handlers={handlers}
          />
        </React.Fragment>
      )
    })

  const conversation = channel ? (
    <section aria-label={label(channel)} className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-12 items-center gap-1.5 border-b px-2 py-2 md:px-4">
        {backButton}
        {channel.kind === "dm" ? avatar(dmPerson(channel), 22) : channel.private ? <Lock className="text-muted-foreground size-4" /> : <Hash className="text-muted-foreground size-4" />}
        <div className="ml-0.5 flex min-w-0 flex-1 items-baseline gap-2">
          <h2 className="truncate text-[14px] font-semibold">{channelName(channel)}</h2>
          {channel.kind === "channel" ? (
            <button type="button" onClick={() => channel.joined && setEditingTopic(true)} className="text-muted-foreground hover:text-foreground hidden truncate text-xs sm:block" title={t("Edit topic")}>
              {channel.topic || (channel.joined ? t("Add a topic") : "")}
            </button>
          ) : dmPerson(channel) ? (
            <span className="text-muted-foreground hidden truncate text-xs sm:block">
              {t({ active: "Active", away: "Away", offline: "Offline" }[statusOf(dmPerson(channel)!.id)])}
            </span>
          ) : null}
        </div>
        {channel.kind === "channel" ? (
          <Popover>
            <PopoverTrigger className="text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent mr-1 hidden h-7 items-center gap-1.5 rounded-md border px-2 text-xs sm:flex" aria-label={t("Members")}>
              <Users className="size-3.5" />
              <span className="tabular-nums">{channel.memberIds.length}</span>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1.5">
              <p className="text-muted-foreground px-1.5 pb-1 text-xs font-medium">
                {channel.memberIds.length} {channel.memberIds.length === 1 ? t("member") : t("members")}
              </p>
              <ul className="max-h-72 overflow-y-auto">
                {channel.memberIds.map((id) => {
                  const p = peopleById.get(id)
                  return (
                    <li key={id} className="flex h-8 items-center gap-2 px-1.5 text-[13px]">
                      {avatar(p, 20)}
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {p?.name ?? t("Former member")}
                        {id === me ? <span className="text-muted-foreground font-normal"> ({t("you")})</span> : null}
                      </span>
                      {id !== me && p ? (
                        <button type="button" className="text-muted-foreground hover:text-foreground text-xs" onClick={() => void openDm(id)}>
                          {t("Message")}
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
              {channel.joined && channel.private ? <AddMembers people={people.filter((p) => !channel.memberIds.includes(p.id))} onAdd={(ids) => channelPatch(channel, { action: "members", userIds: ids })} /> : null}
            </PopoverContent>
          </Popover>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("Pinned messages")} title={t("Pinned")}>
              <Pin />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-1.5">
            <p className="text-muted-foreground px-1.5 pb-1 text-xs font-medium">{t("Pinned in {where}").replace("{where}", channel.kind === "dm" ? t("this conversation") : `#${channel.name}`)}</p>
            {page?.pins.length ? (
              <ul className="grid max-h-80 gap-0.5 overflow-y-auto">
                {page.pins.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="hover:bg-accent flex w-full gap-2 rounded-md p-1.5 text-left" onClick={() => setFlash(m.id)}>
                      {avatar(m.authorId ? peopleById.get(m.authorId) : undefined, 20, false)}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1.5 text-xs">
                          <span className="font-semibold">{(m.authorId && peopleById.get(m.authorId)?.name) || t("Former member")}</span>
                          <span className="text-muted-foreground tabular-nums">{dayLabel(m.createdAt)}</span>
                        </span>
                        <span className="line-clamp-2 text-xs leading-5">
                          <RichText text={m.text} people={peopleById} me={me} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground px-1.5 py-3 text-xs">{t("Nothing pinned yet. Pins keep decisions and links easy to find.")}</p>
            )}
          </PopoverContent>
        </Popover>
        <IconAction label={t("Search (/)")} onClick={() => setSearch(search === null ? "" : null)}>
          <Search />
        </IconAction>
        <ActionMenuButton actions={() => channelActions(channel)} label={t("Conversation actions")} size="icon-sm" />
      </header>

      {search !== null ? (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <input
            autoFocus
            aria-label={t("Search in {where}").replace("{where}", label(channel))}
            placeholder={t("Search in {where}").replace("{where}", label(channel))}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation()
                setSearch(null)
                composer.current?.focus()
              }
            }}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
          {results ? <span className="text-muted-foreground text-xs tabular-nums">{results.length === 1 ? t("1 result") : t("{n} results").replace("{n}", String(results.length))}</span> : null}
          <Button variant="ghost" size="icon-xs" aria-label={t("Close search")} onClick={() => setSearch(null)}>
            <X />
          </Button>
        </div>
      ) : null}

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]"
        onScroll={(e) => {
          const el = e.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32
        }}
      >
        <div className="flex min-h-full flex-col justify-end pt-6 pb-2">
          {results ? (
            results.length ? (
              messageList(
                results.filter((m) => !m.parentId),
                { searching: true },
              )
            ) : (
              <ListEmpty icon={<SearchX />} title={t("No messages match")} description={t("Nothing in {where} mentions that.").replace("{where}", label(channel))} />
            )
          ) : (
            <>
              {page?.hasMore ? (
                <div className="py-2 text-center">
                  <Button variant="ghost" size="sm" onClick={() => void loadOlder()}>
                    {t("Load older messages")}
                  </Button>
                </div>
              ) : page ? (
                <div className="mb-4 px-4">
                  {channel.kind === "dm" ? (
                    avatar(dmPerson(channel), 40, false)
                  ) : (
                    <span className="bg-card text-muted-foreground flex size-10 items-center justify-center rounded-lg border">
                      {channel.private ? <Lock className="size-5" /> : <Hash className="size-5" />}
                    </span>
                  )}
                  <h3 className="mt-3 text-base font-semibold">{channel.kind === "dm" ? channelName(channel) : t("Welcome to #{name}").replace("{name}", channel.name)}</h3>
                  <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
                    {channel.kind === "dm"
                      ? t("This is the start of your conversation with {name}.").replace("{name}", channelName(channel))
                      : channel.topic || t("Say what the channel is for so people know when to use it.")}
                  </p>
                </div>
              ) : null}
              {page ? messageList(page.messages, { marker: markers[channel.id] }) : null}
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 md:px-4">
        <p aria-live="polite" className="text-muted-foreground flex h-5 items-center px-1 text-xs">
          {typingLine(channel.id) ? <span className="animate-in fade-in">{typingLine(channel.id)}…</span> : !connected ? t("Reconnecting…") : null}
        </p>
        {channel.joined ? (
          <Composer
            ref={composer}
            draftId={channel.id}
            placeholder={channel.kind === "dm" ? t("Message {name}").replace("{name}", channelName(channel)) : t("Message #{name}").replace("{name}", channel.name)}
            onSend={(text, files) => send(text, files, null)}
            onTyping={() => sendTyping(null)}
            onEditLast={() => {
              const last = [...(page?.messages ?? [])].reverse().find((m) => m.authorId === me && !m.deleted)
              if (last) setEditingId(last.id)
            }}
          />
        ) : (
          <div className="bg-muted/40 flex flex-col items-center gap-2 rounded-xl border p-4 text-center">
            <p className="text-[13px]">
              {t("You are viewing")} <span className="font-semibold">#{channel.name}</span>
            </p>
            <Button size="sm" onClick={() => void channelPatch(channel, { action: "join" })}>
              {t("Join channel")}
            </Button>
          </div>
        )}
      </div>
    </section>
  ) : (
    <div className="grid flex-1 place-items-center p-6">
      <ListEmpty icon={<Hash />} title={t("No conversation open")} description={t("Pick a channel or person on the left.")} />
    </div>
  )

  const viewMeta = "view" in route ? VIEWS.find((v) => v.value === route.view)! : null
  const viewPane = viewMeta ? (
    <section aria-label={t(viewMeta.label)} className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-12 items-center gap-2 border-b px-2 py-2 md:px-4">
        {backButton}
        <viewMeta.icon className="text-muted-foreground size-4" />
        <h2 className="text-[14px] font-semibold">{t(viewMeta.label)}</h2>
        {hits ? <span className="text-muted-foreground text-xs tabular-nums">{hits.length}</span> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {hits?.length === 0 ? (
          <ListEmpty icon={<viewMeta.icon />} title={t("Nothing here yet")} description={t(viewMeta.empty)} />
        ) : (
          <ul className="grid gap-0.5 px-2">
            {(hits ?? []).map((h) => {
              const m = h.message
              const c = channels.find((x) => x.id === m.channelId)
              const author = m.authorId ? peopleById.get(m.authorId) : undefined
              const rootMsg = h.root ?? (m.parentId ? undefined : m)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => (m.parentId || viewMeta.value === "threads" ? openChannel(m.channelId, { thread: m.parentId ?? m.id, flash: m.parentId ? undefined : m.id }) : openChannel(m.channelId, { flash: m.id }))}
                    className="hover:bg-foreground/[0.035] flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                  >
                    <UserAvatar seed={author?.email ?? "?"} size={32} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={cn("truncate text-[13px]", h.unread ? "font-bold" : "font-semibold")}>{author?.name ?? t("Former member")}</span>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums" suppressHydrationWarning>
                          {dayLabel(m.createdAt) === t("Today") ? clock(m.createdAt) : dayLabel(m.createdAt)}
                        </span>
                        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                          {c ? label(c) : ""}
                          {m.parentId ? ` · ${t("thread")}` : ""}
                        </span>
                      </span>
                      <span className="line-clamp-2 text-[13px] leading-6">{m.text ? <RichText text={m.text} people={peopleById} me={me} /> : <span className="text-muted-foreground">{t("Sent a file")}</span>}</span>
                      {viewMeta.value === "threads" && rootMsg?.replyCount ? (
                        <span className="text-primary mt-0.5 block text-xs font-semibold">
                          {rootMsg.replyCount} {rootMsg.replyCount === 1 ? t("reply") : t("replies")}
                          {h.unread ? <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{t("New")}</span> : null}
                        </span>
                      ) : h.root ? (
                        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                          {t("In reply to")}: {plainChat(h.root.text, nameOf) || t("a file")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  ) : null

  const threadPane =
    threadId && channel ? (
      <aside aria-label={t("Thread")} className={cn("bg-background flex min-h-0 flex-col", !wide && "border-l", wide ? "h-full" : "absolute inset-0 z-30 motion-safe:animate-in motion-safe:slide-in-from-right-8 motion-safe:fade-in motion-safe:duration-200")}>
        <header className="flex min-h-12 items-center gap-2 border-b px-3">
          {!wide ? (
            <Button variant="ghost" size="icon-sm" aria-label={t("Back to the channel")} onClick={closeThread}>
              <ArrowLeft />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[14px] font-semibold">{t("Thread")}</div>
            <div className="text-muted-foreground truncate text-xs">{label(channel)}</div>
          </div>
          {wide ? <Kbd>Esc</Kbd> : null}
          {wide ? (
            <Button variant="ghost" size="icon-sm" aria-label={t("Close thread")} onClick={closeThread}>
              <X />
            </Button>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {thread ? (
            <>
              <MessageRow
                message={thread.root}
                grouped={false}
                inThread
                people={peopleById}
                me={me}
                canModerate={props.canManage && channel.kind === "channel"}
                editing={editingId === thread.root.id}
                setEditing={(on) => setEditingId(on ? thread.root.id : null)}
                editText={decodeMentions(thread.root.text, nameOf)}
                handlers={handlers}
              />
              <div className="my-3 flex items-center gap-2 px-4" role="separator">
                <span className="text-muted-foreground text-xs tabular-nums">
                  {thread.replies.length} {thread.replies.length === 1 ? t("reply") : t("replies")}
                </span>
                <span className="bg-border h-px flex-1" />
              </div>
              {thread.replies.map((r, i) => (
                <MessageRow
                  key={r.id}
                  message={r}
                  grouped={!startsGroup(thread.replies[i - 1], r) && !r.saved}
                  inThread
                  people={peopleById}
                  me={me}
                  flash={flash === r.id}
                  canModerate={props.canManage && channel.kind === "channel"}
                  editing={editingId === r.id}
                  setEditing={(on) => setEditingId(on ? r.id : null)}
                  editText={decodeMentions(r.text, nameOf)}
                  handlers={handlers}
                />
              ))}
            </>
          ) : null}
        </div>
        <div className="shrink-0 px-3 pb-3">
          <p aria-live="polite" className="text-muted-foreground h-5 px-1 text-xs">
            {typingLine(`thread:${threadId}`) ? `${typingLine(`thread:${threadId}`)}…` : null}
          </p>
          {channel.joined ? (
            <Composer ref={threadComposer} compact draftId={`thread:${threadId}`} placeholder={t("Reply…")} onSend={(text, files) => send(text, files, threadId)} onTyping={() => sendTyping(threadId)} />
          ) : null}
        </div>
      </aside>
    ) : null

  return (
    <AppFrame ref={frameRef} userView={userView}>
      {desktop || mobileRail ? <div className={cn(!desktop && "flex-1 [&>div]:!w-full")}>{rail}</div> : null}
      {desktop || !mobileRail ? (
        <div className="relative flex min-w-0 flex-1">
          {viewPane ?? conversation}
          {wide ? <SidePanel open={!!threadPane} width={380}>{threadPane}</SidePanel> : threadPane}
        </div>
      ) : null}
      {mentionAccess.dialog}
      <NewChannelDialog open={creating} onOpenChange={setCreating} onCreate={createChannel} />
      {channel && editingTopic ? <TopicDialog channel={channel} onClose={() => setEditingTopic(false)} onSave={(body) => channelPatch(channel, { action: "update", ...body }).then(() => setEditingTopic(false))} /> : null}
    </AppFrame>
  )
}

function NewChannelDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (input: { name: string; topic: string; private: boolean }) => Promise<void> }) {
  const [name, setName] = React.useState("")
  const [topic, setTopic] = React.useState("")
  const [priv, setPriv] = React.useState(false)
  React.useEffect(() => {
    if (open) {
      setName("")
      setTopic("")
      setPriv(false)
    }
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Create a channel")}</DialogTitle>
          <DialogDescription>{t("Channels are where a team talks about a topic. Anyone can join a public one.")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void onCreate({ name, topic, private: priv })
          }}
        >
          <label className="grid gap-1.5 text-[13px] font-medium">
            {t("Name")}
            <span className="relative">
              <Hash className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. marketing")} className="pl-7" maxLength={80} />
            </span>
          </label>
          <label className="grid gap-1.5 text-[13px] font-medium">
            {t("Topic")} <span className="text-muted-foreground font-normal">({t("optional")})</span>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("What it's for")} maxLength={250} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-[13px]">
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <Lock className="size-3.5" /> {t("Private")}
              </span>
              <span className="text-muted-foreground text-xs">{t("Only people you add can see it. Owners and admins too.")}</span>
            </span>
            <Switch checked={priv} onCheckedChange={setPriv} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {t("Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TopicDialog({ channel, onClose, onSave }: { channel: ChatChannel; onClose: () => void; onSave: (body: { name?: string; topic: string }) => Promise<void> }) {
  const [name, setName] = React.useState(channel.name)
  const [topic, setTopic] = React.useState(channel.topic)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Edit #{name}").replace("{name}", channel.name)}</DialogTitle>
          <DialogDescription>{t("Everyone in the channel sees the change.")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void onSave({ name: channel.name === "general" ? undefined : name, topic })
          }}
        >
          {channel.name !== "general" ? (
            <label className="grid gap-1.5 text-[13px] font-medium">
              {t("Name")}
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </label>
          ) : null}
          <label className="grid gap-1.5 text-[13px] font-medium">
            {t("Topic")}
            <Input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={250} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit">{t("Save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddMembers({ people, onAdd }: { people: ChatPerson[]; onAdd: (ids: string[]) => Promise<void> }) {
  const [q, setQ] = React.useState("")
  if (!people.length) return null
  const shown = people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.email.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
  return (
    <div className="mt-1.5 border-t pt-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Add people…")} className="h-7 text-xs" />
      <ul className="mt-1">
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" className="hover:bg-accent flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-xs" onClick={() => void onAdd([p.id])}>
              <UserAvatar seed={p.email} size={16} />
              <span className="truncate">{p.name}</span>
              <Plus className="text-muted-foreground ml-auto size-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
