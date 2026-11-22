/**
 * The bell, after GitHub's, Linear's and Jira's inboxes. "For you" (mentions, DMs, assignments, invitations, shares,
 * mail to one's own mailbox) and "Watching" (the rest); the badge counts only "For you". Done (E) clears a group until
 * something new happens in it, Snooze (S) brings it back later, Mute (M) silences it; both side views sit in the foot,
 * every change has Undo. Rows act in place: RSVP to an invitation, reply to a chat mention or DM. Chips filter by app,
 * "Unread only" hides the rest, ⤢ opens the same list full size with a detail pane. J/K, Enter, U, R as in Mail.
 * One list for mail, chat and the other apps, grouped by thread, conversation or item (lib/server/notifications.ts).
 * Live through the chat room's socket (polling while chat is off); the count also rides in the tab title and the app
 * badge, and a short toast tells about something new while the panel is closed.
 */
import * as React from "react"
import {
  AtSign, Bell, BellOff, CalendarDays, CalendarPlus, Check, CheckCheck, ChevronLeft, CircleDot, Clock, Database, Eye, ExternalLink, HardDrive, HelpCircle, Inbox, Mail,
  Maximize2, MessageCircle, MessageSquare, MessagesSquare, Minimize2, RefreshCw, Send, Settings2, Share2, StickyNote, Sunrise, Sunset, UserCheck, X, Zap, type LucideIcon,
} from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { UserAvatar } from "@/components/app/user-avatar"
import { useChatSocket } from "@/components/chat/use-chat-socket"
import { openSettings } from "@/components/settings/open-settings"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { isTyping } from "@/components/workspace/ui"
import { appOn } from "@/config/modules"
import { api } from "@/lib/api-client"
import { appLocale, t, tp } from "@/lib/i18n/panel"
import { actorsText, dayBucket, snoozeTimes } from "@/lib/notifications"
import { navigatePanel } from "@/lib/panel-history"
import { onRefreshBell, onRefreshCounts, refreshCountsHere } from "@/lib/mail/unread-badge"
import type { GroupKind, NotificationGroup } from "@/lib/server/notifications"
import { cn } from "@/lib/utils"

type Tab = "direct" | "watching"
type View = "inbox" | "snoozed" | "done"
type App = NotificationGroup["app"]
type Result = { groups: NotificationGroup[]; unread: number; watching: number; snoozed: NotificationGroup[]; done: NotificationGroup[] }
type Action =
  | { action: "read" | "unread" | "dismiss" | "mute" | "restore"; keys: string[] }
  | { action: "snooze"; keys: string[]; until: number }

const APPS: Record<App, { icon: LucideIcon; tone: string; label: string }> = {
  mail: { icon: Mail, tone: "bg-indigo-500 text-white", label: "Mail" },
  chat: { icon: MessagesSquare, tone: "bg-emerald-500 text-white", label: "Chat" },
  calendar: { icon: CalendarDays, tone: "bg-sky-500 text-white", label: "Calendar" },
  collections: { icon: Database, tone: "bg-violet-500 text-white", label: "Collections" },
  notes: { icon: StickyNote, tone: "bg-amber-500 text-white", label: "Notes" },
  drive: { icon: HardDrive, tone: "bg-slate-500 text-white", label: "Drive" },
}
const APP_ORDER = Object.keys(APPS) as App[]

/** The small badge on the avatar says what happened; its colour says where. */
const KIND_ICON: Record<GroupKind, LucideIcon> = {
  mail: Mail, dm: MessageSquare, "chat-mention": AtSign, thread: MessagesSquare, share: Share2, invite: CalendarPlus,
  assign: UserCheck, mention: AtSign, comment: MessageCircle, update: RefreshCw, automation: Zap,
}

const CHAT_KINDS: GroupKind[] = ["dm", "chat-mention", "thread"]

/** "shared a note with you", "sent you 5 messages"… after the people's names. */
function verb(g: NotificationGroup) {
  switch (g.kind) {
    case "mail":
      return tp(g.count, { one: "sent an e-mail", other: "sent {n} e-mails" })
    case "dm":
      return tp(g.count, { one: "sent you a message", other: "sent you {n} messages" })
    case "chat-mention":
      return tp(g.count, { one: "mentioned you", other: "mentioned you {n} times" })
    case "thread":
      return tp(g.count, { one: "replied in a thread", other: "{n} replies in a thread" })
    case "share":
      return t("shared {what} with you", { what: t(g.preview || "something") })
    case "invite":
      return t("invited you")
    case "assign":
      return t("assigned you")
    case "mention":
      return g.app === "collections" ? t("mentioned you in a comment") : tp(g.count, { one: "mentioned you in a note", other: "mentioned you {n} times in a note" })
    case "comment":
      return tp(g.count, { one: "commented", other: "left {n} comments" })
    case "update":
      return t("updated")
    case "automation":
      return t("ran an automation")
  }
}

/** The text under the title: the message, the event's date, the field. Shares have none. */
const detail = (g: NotificationGroup) => (g.kind === "share" ? "" : g.preview)
const names = (g: NotificationGroup) => (g.actors.length ? actorsText(g.actors.map((a) => a.name), t) : t("Automation"))

/** "now", "5m", "3h", "Yesterday", then the date. */
function ago(ms: number) {
  const min = Math.floor((Date.now() - ms) / 60_000)
  if (min < 1) return t("now")
  if (min < 60) return `${min}m`
  if (dayBucket(ms) === "today") return `${Math.floor(min / 60)}h`
  if (dayBucket(ms) === "yesterday") return t("Yesterday")
  const d = new Date(ms)
  return d.toLocaleDateString(appLocale(), { day: "numeric", month: "short", ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) })
}
const when = (ms: number) => new Date(ms).toLocaleString(appLocale(), { weekday: "short", hour: "numeric", minute: "2-digit" })

/** Keeps "(3) " in front of whatever title the page sets, and the installed app's badge. */
function useTitleCount(count: number) {
  React.useEffect(() => {
    const apply = () => {
      const bare = document.title.replace(/^\(\d+\+?\) /, "")
      const next = count ? `(${count > 99 ? "99+" : count}) ${bare}` : bare
      if (document.title !== next) document.title = next
    }
    apply()
    const title = document.querySelector("title")
    const observer = title ? new MutationObserver(apply) : null
    observer?.observe(title!, { childList: true })
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    void (count ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {})
    return () => observer?.disconnect()
  }, [count])
}

/** A number that slides in from below when it grows and from above when it shrinks (an odometer, in CSS). */
function Rolling({ value, className }: { value: number; className?: string }) {
  const prev = React.useRef(value)
  const up = value >= prev.current
  React.useEffect(() => void (prev.current = value), [value])
  return (
    <span className={cn("inline-grid overflow-hidden", className)}>
      <span key={value} className={cn("motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200", up ? "motion-safe:slide-in-from-bottom-2" : "motion-safe:slide-in-from-top-2")}>
        {value > 99 ? "99+" : value}
      </span>
    </span>
  )
}

/** The list as the change leaves it, before the server answers. */
function applyAction(cur: Result, body: Action): Result {
  const hit = (g: NotificationGroup) => body.keys.includes(g.key)
  let { groups, snoozed, done } = cur
  if (body.action === "read" || body.action === "unread") {
    groups = groups.map((g) => (hit(g) ? { ...g, unread: body.action === "unread" ? Math.max(1, g.unread) : 0 } : g))
  } else if (body.action === "restore") {
    const back = [...snoozed, ...done].filter(hit).map((g) => ({ ...g, until: undefined, muted: undefined }))
    groups = [...groups, ...back].sort((a, b) => b.at - a.at)
    snoozed = snoozed.filter((g) => !hit(g))
    done = done.filter((g) => !hit(g))
  } else {
    const gone = groups.filter(hit)
    groups = groups.filter((g) => !hit(g))
    if (body.action === "snooze") snoozed = [...snoozed, ...gone.map((g) => ({ ...g, until: body.until }))].sort((a, b) => a.until! - b.until!)
    else done = [...gone.map((g) => ({ ...g, unread: 0, muted: body.action === "mute" })), ...done]
  }
  return { groups, snoozed, done, unread: groups.filter((g) => g.unread && g.direct).length, watching: groups.filter((g) => g.unread && !g.direct).length }
}

export function NotificationCenter({ side = "bottom" }: { side?: "bottom" | "right" }) {
  const [opened, setOpened] = React.useState(false)
  const [wide, setWide] = React.useState(false)
  const [tab, setTab] = React.useState<Tab>("direct")
  const [view, setView] = React.useState<View>("inbox")
  const [unreadOnly, setUnreadOnly] = React.useState(false)
  const [appFilter, setAppFilter] = React.useState<App | null>(null)
  const [sel, setSel] = React.useState<string | null>(null)
  const [stacked, setStacked] = React.useState<string | null>(null)
  const [replying, setReplying] = React.useState<string | null>(null)
  const [snoozeFor, setSnoozeFor] = React.useState<string | null>(null)
  const [answered, setAnswered] = React.useState<Record<string, string>>({})
  const [all, setAll] = React.useState<Result | null>(null)
  const [error, setError] = React.useState(false)
  const seen = React.useRef<Map<string, number> | null>(null)
  const shown = opened || wide
  const shownRef = React.useRef(shown)
  shownRef.current = shown
  const listRef = React.useRef<HTMLDivElement>(null)

  // One fetch of everything; tabs, chips and views filter it here, so switching is instant and counts stay right.
  const refresh = React.useCallback(async () => {
    try {
      const raw = await api<Partial<Result>>("GET", "/api/app/notifications?filter=all")
      // Fields may be missing from an older server mid-deploy.
      const arr = (v: unknown) => (Array.isArray(v) ? (v as NotificationGroup[]).map((g) => ({ ...g, items: g.items ?? [] })) : [])
      const res: Result = { groups: arr(raw.groups), unread: Number(raw.unread) || 0, watching: Number(raw.watching) || 0, snoozed: arr(raw.snoozed), done: arr(raw.done) }
      setAll(res)
      setError(false)
      const before = seen.current
      seen.current = new Map(res.groups.map((g) => [g.key, g.at]))
      if (before && !shownRef.current && document.visibilityState === "visible") {
        const fresh = res.groups.find((g) => g.unread && g.direct && (before.get(g.key) ?? 0) < g.at && !location.href.includes(g.href.split("?")[0]!))
        if (fresh) toast.info(`${names(fresh)}: ${fresh.title}`)
      }
    } catch {
      setError(true)
    }
  }, [])

  const live = appOn("chat")
  const timer = React.useRef<number | undefined>(undefined)
  const soon = React.useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void refresh(), 800)
  }, [refresh])
  // The server's ping (reads, DMs, mentions, other apps) recounts the bell and the sidebar / rail badges; any other
  // message only refreshes the bell, as each tab gets it on its own socket.
  useChatSocket((e) => (e.type === "notification" ? refreshCountsHere() : e.type === "message" ? soon() : undefined), refreshCountsHere, live)
  React.useEffect(() => onRefreshCounts(soon), [soon])
  React.useEffect(() => onRefreshBell(soon), [soon])
  React.useEffect(() => {
    void refresh()
    const every = window.setInterval(() => document.visibilityState === "visible" && void refresh(), live ? 120_000 : 30_000)
    const onFocus = () => document.visibilityState === "visible" && void refresh()
    document.addEventListener("visibilitychange", onFocus)
    return () => (window.clearInterval(every), document.removeEventListener("visibilitychange", onFocus))
  }, [refresh, live])
  const unread = all?.unread ?? 0
  useTitleCount(unread)

  // What the list shows now.
  const pool = !all ? [] : view === "inbox" ? all.groups.filter((g) => g.direct === (tab === "direct")) : view === "snoozed" ? all.snoozed : all.done
  const appsHere = APP_ORDER.filter((a) => pool.some((g) => g.app === a))
  const list = pool.filter((g) => (!unreadOnly || view !== "inbox" || g.unread) && (!appFilter || g.app === appFilter))
  const current = list.find((g) => g.key === sel) ?? (wide ? list[0] : undefined)

  /** Changes shown at once, then saved; a failure puts the list back as the server has it. */
  async function act(body: Action) {
    setAll((cur) => (cur ? applyAction(cur, body) : cur))
    try {
      await api("POST", "/api/app/notifications", body)
    } catch (e) {
      toast.error((e as Error).message || t("Could not update notifications"))
    }
    void refresh()
  }

  /** Done, snooze or mute, with Undo; the selection moves to the next row. */
  function clear(g: NotificationGroup, body: Action, text: string) {
    const i = list.findIndex((x) => x.key === g.key)
    setSel((list[i + 1] ?? list[i - 1])?.key ?? null)
    if (replying === g.key) setReplying(null)
    void act(body)
    toast.success(text, { action: { label: t("Undo"), onClick: () => void act({ action: "restore", keys: body.keys }) } })
  }
  const done = (g: NotificationGroup) => clear(g, { action: "dismiss", keys: [g.key] }, t("Marked done"))
  const mute = (g: NotificationGroup) => clear(g, { action: "mute", keys: [g.key] }, t("Muted. No more notifications from it."))
  const snooze = (g: NotificationGroup, until: number) => clear(g, { action: "snooze", keys: [g.key], until }, t("Snoozed until {when}", { when: when(until) }))
  const restore = (g: NotificationGroup) => {
    void act({ action: "restore", keys: [g.key] })
    toast.success(t("Moved to inbox"))
  }
  const toggleRead = (g: NotificationGroup) => void act({ action: g.unread ? "read" : "unread", keys: [g.key] })

  function open(g: NotificationGroup) {
    setOpened(false)
    setWide(false)
    if (g.unread) void act({ action: "read", keys: [g.key] })
    navigatePanel(g.href)
  }

  async function rsvp(g: NotificationGroup, status: "accepted" | "tentative" | "declined") {
    const id = new URL(g.href, location.origin).searchParams.get("event")
    if (!id) return open(g)
    setAnswered((a) => ({ ...a, [g.key]: status }))
    try {
      await api("POST", `/api/app/calendar/events/${encodeURIComponent(id)}/rsvp`, { status })
      if (g.unread) void act({ action: "read", keys: [g.key] })
      toast.success(status === "accepted" ? t("You're going") : status === "tentative" ? t("Replied maybe") : t("Declined"))
    } catch (e) {
      setAnswered(({ [g.key]: _, ...rest }) => rest)
      toast.error((e as Error).message)
    }
  }

  async function reply(g: NotificationGroup, text: string) {
    const [, channelId, parentId] = g.key.split(":")
    try {
      await api("POST", "/api/app/chat/messages", { channelId, parentId: parentId || null, text })
      clear(g, { action: "dismiss", keys: [g.key] }, t("Reply sent · marked done"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const switchTo = (next: { tab?: Tab; view?: View }) => {
    if (next.tab) setTab(next.tab)
    if (next.view) setView(next.view)
    setAppFilter(null)
    setSel(null)
    setReplying(null)
  }

  // J/K, Enter, E, S, U, M, R while the panel is open.
  React.useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || snoozeFor) return
      const i = list.findIndex((g) => g.key === current?.key)
      const go = (d: number) => {
        const next = list[i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + d))]
        if (!next) return
        setSel(next.key)
        requestAnimationFrame(() => listRef.current?.querySelector(`[data-key="${CSS.escape(next.key)}"]`)?.scrollIntoView({ block: "nearest" }))
      }
      const k = e.key.toLowerCase()
      if (k === "j" || e.key === "ArrowDown") (e.preventDefault(), go(1))
      else if (k === "k" || e.key === "ArrowUp") (e.preventDefault(), go(-1))
      else if (!current) return
      else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) (e.preventDefault(), open(current))
      else if (k === "e") view === "inbox" ? done(current) : restore(current)
      else if (k === "u" && view === "inbox") toggleRead(current)
      else if (k === "s" && view === "inbox") (e.preventDefault(), setSnoozeFor(current.key))
      else if (k === "m" && view !== "done") mute(current)
      else if (k === "r" && view === "inbox" && CHAT_KINDS.includes(current.kind)) (e.preventDefault(), setReplying(current.key))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const viewTitle = view === "snoozed" ? t("Snoozed") : view === "done" ? t("Done") : t("Notifications")
  const inboxPool = all ? all.groups.filter((g) => g.direct === (tab === "direct")) : []
  const iconBtn = "text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 shrink-0 place-items-center rounded-lg transition-colors"

  const panel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-3.5">
        <div className="flex items-center gap-0.5">
          <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-semibold tracking-tight">
            {view !== "inbox" ? (
              <button type="button" onClick={() => switchTo({ view: "inbox" })} className="text-muted-foreground hover:text-foreground -ml-1 flex items-center gap-0.5 text-[13px] font-medium">
                <ChevronLeft className="size-4" />{t("Inbox")}<span className="text-muted-foreground/60 px-1">/</span>
              </button>
            ) : null}
            {viewTitle}
          </h2>
          {view === "inbox" && inboxPool.some((g) => g.unread) ? (
            <button type="button" title={t("Mark all read")} aria-label={t("Mark all read")} className={iconBtn} onClick={() => void act({ action: "read", keys: inboxPool.filter((g) => g.unread).slice(0, 100).map((g) => g.key) })}>
              <CheckCheck className="size-[17px]" strokeWidth={1.75} />
            </button>
          ) : null}
          {view === "inbox" && list.length ? (
            <button type="button" title={t("Mark all done")} aria-label={t("Mark all done")} className={iconBtn} onClick={() => {
              const keys = list.slice(0, 100).map((g) => g.key)
              void act({ action: "dismiss", keys })
              toast.success(tp(keys.length, { one: "{n} marked done", other: "{n} marked done" }), { action: { label: t("Undo"), onClick: () => void act({ action: "restore", keys }) } })
            }}>
              <Inbox className="size-4" strokeWidth={1.75} />
            </button>
          ) : null}
          <button type="button" title={t("Notification settings")} aria-label={t("Notification settings")} className={iconBtn} onClick={() => (setOpened(false), setWide(false), openSettings("notifications"))}>
            <Settings2 className="size-4" strokeWidth={1.75} />
          </button>
          <button type="button" title={wide ? t("Collapse") : t("Expand")} aria-label={wide ? t("Collapse") : t("Expand")} className={cn(iconBtn, "max-sm:hidden")} onClick={() => (wide ? (setWide(false), setOpened(true)) : (setOpened(false), setWide(true)))}>
            {wide ? <Minimize2 className="size-[15px]" strokeWidth={1.75} /> : <Maximize2 className="size-[15px]" strokeWidth={1.75} />}
          </button>
          <button type="button" title={t("Close")} aria-label={t("Close notifications")} className={iconBtn} onClick={() => (setOpened(false), setWide(false))}>
            <X className="size-[17px]" strokeWidth={1.75} />
          </button>
        </div>
        <div className="mt-2 flex items-end gap-5 border-b" role={view === "inbox" ? "tablist" : undefined}>
          {view === "inbox" ? (
            <>
              {([["direct", t("For you"), AtSign, all?.unread ?? 0], ["watching", t("Watching"), Eye, all?.watching ?? 0]] as const).map(([id, label, Icon, n]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => switchTo({ tab: id })}
                  className="text-muted-foreground hover:text-foreground aria-selected:text-foreground relative flex shrink-0 items-center gap-1.5 pt-1.5 pb-2.5 text-[13px] whitespace-nowrap font-medium after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full aria-selected:after:bg-foreground"
                >
                  <Icon className="size-3.5" strokeWidth={2} />
                  {label}
                  <span className={cn("grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-semibold tabular-nums", n && tab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Rolling value={n} /></span>
                </button>
              ))}
              <label className="text-muted-foreground ml-auto flex items-center gap-2 pb-2 text-xs whitespace-nowrap">
                <span className="max-[380px]:hidden">{t("Unread only")}</span>
                <Switch size="sm" checked={unreadOnly} onCheckedChange={(v) => (setUnreadOnly(v), setSel(null))} aria-label={t("Unread only")} />
              </label>
            </>
          ) : <div className="h-px" />}
        </div>
      </div>

      {appsHere.length > 1 ? (
        <div role="group" aria-label={t("Filter by app")} className="flex gap-1.5 overflow-x-auto px-4 pt-2.5 pb-1.5 [scrollbar-width:none]">
          {[null, ...appsHere].map((a) => {
            const Icon = a ? APPS[a].icon : Inbox
            return (
              <button
                key={a ?? "all"}
                type="button"
                aria-pressed={appFilter === a}
                onClick={() => (setAppFilter(a), setSel(null))}
                className="text-muted-foreground hover:text-foreground hover:border-foreground/30 aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:border-foreground flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors"
              >
                <Icon className="size-3.5" strokeWidth={1.9} />
                {a ? t(APPS[a].label) : t("All")}
              </button>
            )
          })}
        </div>
      ) : <div className="h-1.5" />}

      <div className={cn("grid min-h-0 flex-1", wide && "grid-cols-[400px_1fr]")}>
        <div ref={listRef} role="list" aria-label={viewTitle} className={cn("min-h-0 overflow-y-auto overscroll-contain px-2 pb-2.5 [scrollbar-width:thin]", wide && "border-r")}>
          {error ? (
            <p role="alert" className="text-destructive px-3 py-3 text-sm">
              {t("Could not load notifications.")} <button className="underline" onClick={() => void refresh()}>{t("Retry")}</button>
            </p>
          ) : null}
          {!all && !error ? <p className="text-muted-foreground px-3 py-6 text-center text-xs">{t("Loading…")}</p> : null}
          {all && !list.length ? <Empty view={view} filtered={unreadOnly || !!appFilter} snoozed={all.snoozed} /> : null}
          {list.map((g, i) => {
            const day = view === "inbox" ? dayBucket(g.at) : null
            const head = day && (i === 0 || dayBucket(list[i - 1]!.at) !== day) ? day : null
            return (
              <React.Fragment key={g.key}>
                {head ? <div role="presentation" className="text-muted-foreground/80 px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide uppercase">{head === "today" ? t("Today") : head === "yesterday" ? t("Yesterday") : t("Earlier")}</div> : null}
                <Row
                  group={g}
                  view={view}
                  selected={current?.key === g.key}
                  compact={wide}
                  stacked={stacked === g.key}
                  replying={replying === g.key}
                  answered={answered[g.key]}
                  snoozeOpen={snoozeFor === g.key}
                  onSnoozeOpen={(o) => setSnoozeFor(o ? g.key : null)}
                  onSelect={() => (setSel(g.key), wide ? g.unread && void act({ action: "read", keys: [g.key] }) : open(g))}
                  onStack={() => setStacked((k) => (k === g.key ? null : g.key))}
                  onRead={() => toggleRead(g)}
                  onDone={() => done(g)}
                  onSnooze={(until) => snooze(g, until)}
                  onMute={() => mute(g)}
                  onRestore={() => restore(g)}
                  onOpen={() => open(g)}
                  onReply={(on) => setReplying(on ? g.key : null)}
                  onSend={(text) => reply(g, text)}
                  onRsvp={(s) => void rsvp(g, s)}
                />
              </React.Fragment>
            )
          })}
        </div>
        {wide ? (
          <div className="min-h-0 overflow-y-auto px-7 py-6">
            {current ? (
              <Detail
                group={current}
                view={view}
                answered={answered[current.key]}
                onOpen={() => open(current)}
                onDone={() => done(current)}
                onSnooze={(until) => snooze(current, until)}
                onMute={() => mute(current)}
                onRestore={() => restore(current)}
                onSend={(text) => reply(current, text)}
                onRsvp={(s) => void rsvp(current, s)}
              />
            ) : (
              <div className="text-muted-foreground grid h-full place-content-center text-center text-sm">{t("Pick a notification, or press J.")}</div>
            )}
          </div>
        ) : null}
      </div>

      <div className="text-muted-foreground flex min-h-11 items-center gap-4 border-t px-4 py-2 text-xs whitespace-nowrap">
        {view === "inbox" ? (
          <>
            <button type="button" onClick={() => switchTo({ view: "snoozed" })} className="hover:text-foreground flex items-center gap-1.5">
              <Clock className="size-3.5" strokeWidth={1.75} />{t("Snoozed")}{all?.snoozed.length ? <b className="text-foreground font-semibold tabular-nums">{all.snoozed.length}</b> : null}
            </button>
            <button type="button" onClick={() => switchTo({ view: "done" })} className="hover:text-foreground flex items-center gap-1.5">
              <Inbox className="size-3.5" strokeWidth={1.75} />{t("Done")}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => switchTo({ view: "inbox" })} className="hover:text-foreground flex items-center gap-1"><ChevronLeft className="size-3.5" />{t("Back to inbox")}</button>
        )}
        <span className="ml-auto flex items-center gap-3 whitespace-nowrap max-sm:hidden">
          <span><Kbd>J</Kbd> <Kbd>K</Kbd></span>
          <span><Kbd>E</Kbd> {view === "inbox" ? t("done") : t("restore")}</span>
          {view === "inbox" ? <span><Kbd>S</Kbd> {t("snooze")}</span> : null}
        </span>
      </div>
    </div>
  )

  return (
    <>
      <PopoverPrimitive.Root open={opened} onOpenChange={(o) => (setOpened(o), o ? void refresh() : (setStacked(null), setReplying(null)))}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            title={t("Notifications")}
            aria-label={unread ? t("Notifications, {n} unread", { n: unread }) : t("Notifications")}
            data-state={shown ? "open" : "closed"}
            className="hover:bg-muted data-[state=open]:bg-muted relative grid size-9 place-items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Bell className={cn("size-[18px] transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none", shown && "-rotate-12")} strokeWidth={1.75} aria-hidden />
            {unread ? (
              <span aria-hidden className="ring-background absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 motion-safe:animate-in motion-safe:zoom-in-50">
                <Rolling value={unread} />
              </span>
            ) : null}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side={side}
            align="end"
            sideOffset={10}
            collisionPadding={12}
            aria-label={t("Notifications")}
            className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[.97] data-[state=open]:slide-in-from-top-1.5 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[.98] z-50 flex h-[min(660px,calc(100svh-24px))] w-[min(440px,calc(100vw-24px))] origin-(--radix-popover-content-transform-origin) flex-col overflow-hidden rounded-2xl border shadow-[0_24px_60px_-12px_rgba(0,0,0,.25)] duration-200"
          >
            {opened ? panel : null}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      <Dialog open={wide} onOpenChange={(o) => (setWide(o), o ? void refresh() : setReplying(null))}>
        <DialogContent showCloseButton={false} aria-describedby={undefined} className="bg-popover h-[min(740px,calc(100dvh-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[min(1060px,calc(100%-2rem))]">
          <DialogTitle className="sr-only">{t("Notifications")}</DialogTitle>
          {wide ? panel : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="bg-background inline-grid h-[18px] min-w-[18px] place-items-center rounded border border-b-2 px-1 font-sans text-[10.5px] font-medium">{children}</kbd>
)

function Empty({ view, filtered, snoozed }: { view: View; filtered: boolean; snoozed: NotificationGroup[] }) {
  const next = snoozed[0]?.until
  const [title, hint] =
    view === "done" ? [t("Nothing marked done yet"), t("Press E on a notification to clear it.")]
    : view === "snoozed" ? [t("Nothing snoozed"), t("Press S on a notification to bring it back later.")]
    : filtered ? [t("Nothing here"), t("Nothing matches these filters.")]
    : [t("You’re all caught up"), next ? tp(snoozed.length, { one: "{n} snoozed comes back {when}.", other: "{n} snoozed come back from {when}." }, { when: when(next) }) : t("New updates will appear here.")]
  return (
    <div className="grid min-h-56 place-content-center justify-items-center px-3 py-8 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1">
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        {view === "inbox" && !filtered ? <Check className="size-6" /> : <BellOff className="size-5" strokeWidth={1.75} />}
      </span>
      <strong className="text-sm font-medium">{title}</strong>
      <p className="text-muted-foreground mt-1 max-w-64 text-xs">{hint}</p>
    </div>
  )
}

function Faces({ group: g, size = 36 }: { group: NotificationGroup; size?: number }) {
  const { tone } = APPS[g.app]
  const KindIcon = KIND_ICON[g.kind]
  const faces = g.actors.slice(0, 2)
  const small = Math.round(size * 0.72)
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      {faces.length > 1 ? (
        <>
          <UserAvatar seed={faces[1]!.email} size={small} className="absolute top-0 right-0" />
          <UserAvatar seed={faces[0]!.email} size={small} className="ring-popover absolute bottom-0 left-0 ring-2" />
        </>
      ) : faces.length ? (
        <UserAvatar seed={faces[0]!.email} size={size} />
      ) : (
        <span className="bg-muted text-muted-foreground grid size-full place-items-center rounded-full"><Zap className="size-4" /></span>
      )}
      <span title={t(APPS[g.app].label)} className={cn("ring-popover absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-md ring-2", tone)}>
        <KindIcon className="size-2.5" strokeWidth={2.4} />
      </span>
    </span>
  )
}

function SnoozeMenu({ open, onOpenChange, onSnooze, onMute, children }: { open?: boolean; onOpenChange?: (o: boolean) => void; onSnooze: (until: number) => void; onMute: () => void; children: React.ReactNode }) {
  const label = { later: t("Later today"), in3h: t("In 3 hours"), tomorrow: t("Tomorrow"), nextWeek: t("Next week") }
  const icon = { later: Sunset, in3h: Clock, tomorrow: Sunrise, nextWeek: CalendarDays }
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="text-muted-foreground text-xs">{t("Snooze until")}</DropdownMenuLabel>
        {(open === undefined || open ? snoozeTimes() : []).map((o) => {
          const Icon = icon[o.id]
          return (
            <DropdownMenuItem key={o.id} onSelect={() => onSnooze(o.at)}>
              <Icon className="size-4" strokeWidth={1.75} />{label[o.id]}<DropdownMenuShortcut>{when(o.at)}</DropdownMenuShortcut>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onMute}><BellOff className="size-4" strokeWidth={1.75} />{t("Mute this conversation")}<DropdownMenuShortcut>M</DropdownMenuShortcut></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const chip = "hover:bg-muted inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap transition active:scale-[.97]"

/** RSVP, reply or nothing: what a group can do without opening its app. */
function InlineActions({ group: g, answered, replying, onReply, onSend, onRsvp }: {
  group: NotificationGroup
  answered?: string
  replying?: boolean
  onReply?: (on: boolean) => void
  onSend: (text: string) => Promise<void>
  onRsvp: (s: "accepted" | "tentative" | "declined") => void
}) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  if (g.kind === "invite") {
    const opts = [["accepted", t("Going"), Check], ["tentative", t("Maybe"), HelpCircle], ["declined", t("Decline"), X]] as const
    return (
      <div role="group" aria-label={t("RSVP")} className="mt-2 inline-flex overflow-hidden rounded-lg border">
        {opts.map(([s, label, Icon], i) => (
          <button key={s} type="button" aria-pressed={answered === s} onClick={(e) => (e.stopPropagation(), onRsvp(s))} className={cn("hover:bg-muted text-muted-foreground hover:text-foreground aria-pressed:text-foreground inline-flex h-7 items-center gap-1.5 px-2.5 text-xs font-medium whitespace-nowrap", i && "border-l", answered === s && (s === "accepted" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted"))}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>
    )
  }
  if (!CHAT_KINDS.includes(g.kind)) return null
  if (!replying && onReply) {
    return (
      <div className="mt-2 flex gap-1.5">
        <button type="button" className={chip} onClick={(e) => (e.stopPropagation(), onReply(true))}><MessageSquare className="size-3.5" />{t("Reply")}<Kbd>R</Kbd></button>
      </div>
    )
  }
  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    await onSend(text.trim())
    setBusy(false)
    setText("")
  }
  return (
    <form className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()} onSubmit={(e) => (e.preventDefault(), void send())}>
      <input
        autoFocus={!!onReply}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onReply && (e.preventDefault(), e.stopPropagation(), onReply(false))}
        placeholder={t("Reply to {name}…", { name: g.actors[0]?.name.split(" ")[0] ?? "" })}
        aria-label={t("Reply")}
        className="bg-background focus:border-ring focus:ring-ring/30 h-8 min-w-0 flex-1 rounded-lg border px-2.5 text-[13px] outline-none focus:ring-[3px]"
      />
      <button type="submit" disabled={!text.trim() || busy} className="bg-foreground text-background inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium disabled:opacity-50">
        <Send className="size-3.5" />{t("Send")}
      </button>
    </form>
  )
}

function Row(p: {
  group: NotificationGroup
  view: View
  selected: boolean
  compact: boolean
  stacked: boolean
  replying: boolean
  answered?: string
  snoozeOpen: boolean
  onSnoozeOpen: (o: boolean) => void
  onSelect: () => void
  onStack: () => void
  onRead: () => void
  onDone: () => void
  onSnooze: (until: number) => void
  onMute: () => void
  onRestore: () => void
  onOpen: () => void
  onReply: (on: boolean) => void
  onSend: (text: string) => Promise<void>
  onRsvp: (s: "accepted" | "tentative" | "declined") => void
}) {
  const g = p.group
  const text = detail(g)
  const many = g.items.length > 1 && (g.kind === "dm" || g.kind === "thread" || g.kind === "mail" || g.kind === "chat-mention")
  const lines = many ? (p.stacked ? g.items : g.items.slice(0, 2)) : []
  const hoverBtn = "text-muted-foreground hover:bg-muted hover:text-foreground grid size-7 place-items-center rounded-md"
  return (
    <article
      role="listitem"
      data-key={g.key}
      onClick={p.onSelect}
      className={cn(
        "group/row hover:bg-muted/60 relative grid cursor-pointer grid-cols-[36px_1fr_auto] gap-3 rounded-xl py-2.5 pr-2 pl-2.5 transition-colors",
        p.selected && "bg-muted/70 before:bg-primary before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full",
      )}
    >
      <Faces group={g} />
      <div className="min-w-0">
        <p className={cn("text-muted-foreground text-[13px] leading-snug break-words", g.unread && "text-foreground")}>
          <strong className={cn("font-medium", g.unread ? "text-foreground font-semibold" : "text-foreground/90")}>{names(g)}</strong> {verb(g)}
        </p>
        <p className="mt-0.5 truncate text-[13px]">
          <span className={cn(g.unread ? "text-foreground font-medium" : "text-foreground/80")}>{g.title}</span>
        </p>
        {many ? (
          <div className="border-border mt-1.5 grid gap-0.5 border-l-2 pl-2.5">
            {lines.map((it, i) => (
              <p key={i} className="text-muted-foreground truncate text-xs"><span className="text-foreground/70">{it.name.split(" ")[0]}:</span> {it.text}</p>
            ))}
            {g.items.length > 2 || g.count > g.items.length ? (
              <button type="button" onClick={(e) => (e.stopPropagation(), p.onStack())} className="text-primary w-fit text-xs font-medium hover:underline">
                {p.stacked ? t("Show less") : tp(g.count, { one: "Show {n}", other: "Show all {n}" })}
              </button>
            ) : null}
          </div>
        ) : text ? (
          <p className={cn("mt-0.5 line-clamp-2 text-xs leading-relaxed", g.unread ? "text-foreground/80" : "text-muted-foreground")}>{text}</p>
        ) : null}
        {p.view === "inbox" && !p.compact ? <InlineActions group={g} answered={p.answered} replying={p.replying} onReply={p.onReply} onSend={p.onSend} onRsvp={p.onRsvp} /> : null}
      </div>
      <div className={cn("flex flex-col items-end gap-2 pt-0.5 text-xs whitespace-nowrap", (p.snoozeOpen || p.selected) ? "invisible" : "group-hover/row:invisible")}>
        <time className="text-muted-foreground/80 tabular-nums" dateTime={new Date(g.at).toISOString()} title={new Date(g.at).toLocaleString(appLocale())}>{ago(g.at)}</time>
        {g.until ? <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><Clock className="size-3" />{when(g.until)}</span> : null}
        {g.muted ? <BellOff className="text-muted-foreground size-3.5" aria-label={t("Muted")} /> : null}
        {g.unread ? <span aria-label={t("unread")} className="size-2 rounded-full bg-blue-500" /> : null}
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn("bg-popover absolute top-1.5 right-1.5 gap-0.5 rounded-lg p-0.5 shadow-[0_0_0_1px_var(--border),0_4px_12px_-4px_rgba(0,0,0,.15)]", p.snoozeOpen || p.selected ? "flex" : "hidden group-hover/row:flex group-focus-within/row:flex")}
      >
        {p.view === "inbox" ? (
          <>
            <button type="button" className={hoverBtn} onClick={p.onRead} title={g.unread ? t("Mark read") + " (U)" : t("Mark unread") + " (U)"} aria-label={g.unread ? t("Mark read") : t("Mark unread")}>
              {g.unread ? <Check className="size-[15px]" strokeWidth={1.75} /> : <CircleDot className="size-[15px]" strokeWidth={1.75} />}
            </button>
            <SnoozeMenu open={p.snoozeOpen} onOpenChange={p.onSnoozeOpen} onSnooze={p.onSnooze} onMute={p.onMute}>
              <button type="button" className={hoverBtn} title={t("Snooze") + " (S)"} aria-label={t("Snooze")}><Clock className="size-[15px]" strokeWidth={1.75} /></button>
            </SnoozeMenu>
            <button type="button" className={hoverBtn} onClick={p.onDone} title={t("Done") + " (E)"} aria-label={t("Done")}><Inbox className="size-[15px]" strokeWidth={1.75} /></button>
          </>
        ) : (
          <button type="button" className={hoverBtn} onClick={p.onRestore} title={t("Move to inbox") + " (E)"} aria-label={t("Move to inbox")}><ChevronLeft className="size-[15px]" strokeWidth={1.75} /></button>
        )}
        <button type="button" className={hoverBtn} onClick={p.onOpen} title={t("Open") + " (Enter)"} aria-label={t("Open")}><ExternalLink className="size-[15px]" strokeWidth={1.75} /></button>
      </div>
    </article>
  )
}

function Detail({ group: g, view, answered, onOpen, onDone, onSnooze, onMute, onRestore, onSend, onRsvp }: {
  group: NotificationGroup
  view: View
  answered?: string
  onOpen: () => void
  onDone: () => void
  onSnooze: (until: number) => void
  onMute: () => void
  onRestore: () => void
  onSend: (text: string) => Promise<void>
  onRsvp: (s: "accepted" | "tentative" | "declined") => void
}) {
  const { icon: AppIcon, tone, label } = APPS[g.app]
  const email = (name: string) => g.actors.find((a) => a.name === name)?.email ?? name
  return (
    <div key={g.key} className="motion-safe:animate-in motion-safe:fade-in-0">
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className={cn("grid size-[18px] place-items-center rounded-md", tone)}><AppIcon className="size-2.5" strokeWidth={2.4} /></span>
        {t(label)} · {g.direct ? t("For you") : t("Watching")}
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight break-words">{g.title}</h3>
      <p className="text-muted-foreground mt-1 text-[13px]">{names(g)} {verb(g)} · {ago(g.at)}</p>
      <div className="my-5 flex flex-wrap gap-1.5">
        <button type="button" onClick={onOpen} className="bg-foreground text-background inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium"><ExternalLink className="size-3.5" />{t("Open")}</button>
        {view === "inbox" ? (
          <>
            <button type="button" onClick={onDone} className={cn(chip, "h-8")}><Inbox className="size-3.5" />{t("Done")}<Kbd>E</Kbd></button>
            <SnoozeMenu onSnooze={onSnooze} onMute={onMute}>
              <button type="button" className={cn(chip, "h-8")}><Clock className="size-3.5" />{t("Snooze")}<Kbd>S</Kbd></button>
            </SnoozeMenu>
          </>
        ) : (
          <button type="button" onClick={onRestore} className={cn(chip, "h-8")}><ChevronLeft className="size-3.5" />{t("Move to inbox")}<Kbd>E</Kbd></button>
        )}
        {view !== "done" ? <button type="button" onClick={onMute} className={cn(chip, "h-8")}><BellOff className="size-3.5" />{t("Mute")}<Kbd>M</Kbd></button> : null}
      </div>
      {g.kind === "invite" ? (
        <div className="rounded-xl border p-4">
          <p className="text-sm font-medium">{g.title}</p>
          <p className="text-muted-foreground mt-0.5 text-[13px]">{g.preview}</p>
          {view === "inbox" ? <InlineActions group={g} answered={answered} onSend={onSend} onRsvp={onRsvp} /> : null}
        </div>
      ) : (
        <>
          {(g.items.length ? g.items : [{ name: g.actors[0]?.name ?? "", text: g.preview, at: g.at }]).filter((it) => it.text).map((it, i) => (
            <div key={i} className="grid grid-cols-[32px_1fr] gap-3 border-t py-3.5">
              <UserAvatar seed={email(it.name)} size={32} />
              <div className="min-w-0">
                <p className="text-[13px]"><strong className="font-semibold">{it.name || t("Automation")}</strong> <time className="text-muted-foreground ml-1 text-xs">{ago(it.at)}</time></p>
                <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-line">{it.text}</p>
              </div>
            </div>
          ))}
          {g.count > g.items.length ? <p className="text-muted-foreground border-t pt-3 text-xs">{tp(g.count - g.items.length, { one: "{n} earlier — open to see it", other: "{n} earlier — open to see them" })}</p> : null}
          {view === "inbox" && CHAT_KINDS.includes(g.kind) ? <div className="border-t pt-3"><InlineActions group={g} replying onSend={onSend} onRsvp={onRsvp} /></div> : null}
        </>
      )}
    </div>
  )
}
