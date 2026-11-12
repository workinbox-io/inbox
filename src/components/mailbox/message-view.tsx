import * as React from "react"
import { CalendarDays, CheckCheck, Copy, Download, FileCode, Forward, HardDrive, ImageOff, MoreHorizontal, Paperclip, Reply, ReplyAll } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { hasQuotedHtml, hasRemoteImages, linkSegments, mailSrcDoc } from "@/lib/admin-mail/rules"
import { task } from "@/components/drive/task"
import { api } from "@/lib/api-client"
import { formatBytes, isImageType } from "@/lib/uploads"
import { splitQuotedReply } from "@/lib/mail/quotes"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/app/user-avatar"
import { ActionMenu, ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import { trustedSenders, trustSender } from "./drafts"
import type { MailFile, MailInvite, MailMessage, ReplyMode, RsvpStatus } from "./types"

export const shortDate = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) })
}

const fullDate = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

const name = (m: { fromName: string | null; fromEmail: string; direction: "in" | "out" }) => m.fromName ?? m.fromEmail

/** The first line of a message's new text, for a collapsed row. */
export const messageSnippet = (text: string) => splitQuotedReply(text).body.replace(/\s+/g, " ").trim().slice(0, 200)

/**
 * An incoming mail's HTML in a sandboxed iframe (no scripts; same-origin only so the page can size
 * it to its content). The CSP in the document blocks remote images until allowed.
 */
export function HtmlFrame({ html, remoteImages, showQuoted }: { html: string; remoteImages: boolean; showQuoted: boolean }) {
  const ref = React.useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = React.useState(80)
  const doc = React.useMemo(() => mailSrcDoc(html, { origin: location.origin, remoteImages, showQuoted }), [html, remoteImages, showQuoted])
  const measure = React.useCallback(() => {
    const d = ref.current?.contentDocument
    if (d?.documentElement) setHeight(Math.max(40, d.documentElement.scrollHeight))
  }, [])
  const observer = React.useRef<ResizeObserver | null>(null)
  React.useEffect(() => () => observer.current?.disconnect(), [])
  // Grows with the content: images loading, quoted text shown.
  const onLoad = () => {
    measure()
    const d = ref.current?.contentDocument
    if (!d?.body) return
    observer.current?.disconnect()
    observer.current = new ResizeObserver(measure)
    observer.current.observe(d.body)
    for (const img of Array.from(d.images)) img.addEventListener("load", measure)
  }
  return (
    <iframe
      ref={ref}
      title="E-mail"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      onLoad={onLoad}
      style={{ height }}
      className="w-full rounded-lg bg-white"
    />
  )
}

/** Plain text with links and the quoted history folded behind "…". */
export function TextBody({ text, showQuoted }: { text: string; showQuoted: boolean }) {
  const { body, quoted } = splitQuotedReply(text)
  const shown = showQuoted && quoted ? `${body}\n\n${quoted}` : body
  return (
    <p className="text-[15px] leading-6 break-words whitespace-pre-wrap">
      {shown
        ? linkSegments(shown).map((s, i) =>
            s.href ? (
              <a key={i} href={s.href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                {s.text}
              </a>
            ) : (
              <React.Fragment key={i}>{s.text}</React.Fragment>
            ),
          )
        : <span className="text-muted-foreground">(no text)</span>}
    </p>
  )
}

async function saveToDrive(f: MailFile) {
  const job = task(t("Saving {name} to Drive…", { name: f.filename }))
  try {
    const item = await api<{ id: string; name: string }>("POST", "/api/app/drive/save-attachment", { url: f.url, filename: f.filename })
    job.done(t("Saved to Drive as {name}", { name: item.name }), { action: { label: t("Open"), onClick: () => void (location.href = `/app/drive?file=${item.id}`) } })
  } catch (e) {
    job.fail((e as Error).message)
  }
}

const isIcs = (f: MailFile) => /^(text|application)\/(calendar|ics)\b/i.test(f.mediaType) || /\.ics$/i.test(f.filename)

function inviteWhen(i: MailInvite) {
  const opts: Intl.DateTimeFormatOptions = i.allDay
    ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
    : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
  const end = i.allDay ? i.end - 1 : i.end
  const sameDay = new Date(i.start).toDateString() === new Date(end).toDateString()
  const tail = sameDay
    ? i.allDay ? "" : new Date(end).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : new Date(end).toLocaleString(undefined, opts)
  return [new Date(i.start).toLocaleString(undefined, opts), tail].filter(Boolean).join(" – ")
}

/** An invitation (.ics) above the message: what, when, and Accept / Maybe / Decline when the viewer is invited. */
function InviteCard({ invite }: { invite: MailInvite }) {
  const [status, setStatus] = React.useState<RsvpStatus | null>(invite.myStatus)
  const [busy, setBusy] = React.useState(false)
  const cancelled = invite.method === "CANCEL"
  const answer = async (next: Exclude<RsvpStatus, "needs-action">) => {
    if (!invite.eventId) return
    setBusy(true)
    try {
      await api("POST", `/api/app/calendar/events/${invite.eventId}/rsvp`, { status: next })
      setStatus(next)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const choices: [Exclude<RsvpStatus, "needs-action">, string][] = [
    ["accepted", t("Accept")],
    ["tentative", t("Maybe")],
    ["declined", t("Decline")],
  ]
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
      <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-md">
        <CalendarDays className="text-muted-foreground size-5" />
      </span>
      <div className="grid min-w-0 flex-1">
        <span className={cn("truncate font-medium", cancelled && "line-through")}>{invite.title || t("(no title)")}</span>
        <span className="text-muted-foreground truncate">
          {inviteWhen(invite)}
          {invite.location ? ` · ${invite.location}` : ""}
        </span>
        {invite.eventId ? (
          <a href={`/app/calendar?date=${invite.start}&event=${invite.eventId}`} className="text-muted-foreground w-fit text-xs underline-offset-2 hover:underline">
            {t("Open in calendar")}
          </a>
        ) : null}
      </div>
      {cancelled ? (
        <span className="text-muted-foreground text-xs">{t("Cancelled")}</span>
      ) : invite.eventId && status ? (
        <div className="flex gap-1" role="group" aria-label={t("Your answer")}>
          {choices.map(([value, label]) => (
            <Button key={value} size="sm" variant={status === value ? "default" : "outline"} disabled={busy} aria-pressed={status === value} onClick={() => answer(value)}>
              {label}
            </Button>
          ))}
        </div>
      ) : null}
      {invite.url ? (
        <Button size="sm" variant="outline" asChild>
          <a href={invite.url} target="_blank" rel="noreferrer">{t("Join")}</a>
        </Button>
      ) : null}
    </div>
  )
}

function Files({ files }: { files: MailFile[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.url} className="group relative">
          <a
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="hover:bg-muted/70 flex w-56 items-center gap-2.5 rounded-xl border p-2 text-xs transition-colors"
            title={f.filename}
          >
            {isImageType(f.mediaType) ? (
              <img src={f.url} alt="" className="size-10 shrink-0 rounded-md object-cover" loading="lazy" />
            ) : (
              <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-md">
                <Paperclip className="text-muted-foreground size-4" />
              </span>
            )}
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{f.filename}</span>
              <span className="text-muted-foreground">{f.size ? formatBytes(f.size) : f.mediaType.split("/")[1]}</span>
            </span>
            <Download className="text-muted-foreground size-3.5 shrink-0" />
          </a>
          <button
            type="button"
            onClick={() => saveToDrive(f)}
            aria-label={t("Save to Drive")}
            title={t("Save to Drive")}
            className="bg-background text-muted-foreground hover:text-foreground absolute -top-2 -right-2 hidden size-6 place-items-center rounded-full border shadow-sm group-focus-within:grid group-hover:grid"
          >
            <HardDrive className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** One message of a thread: a one-line row when collapsed, the whole mail when open. */
export function MessageItem({
  message: m,
  expanded,
  onToggle,
  onReply,
}: {
  message: MailMessage
  expanded: boolean
  onToggle: () => void
  onReply: (mode: ReplyMode, messageId: string) => void
}) {
  const [showQuoted, setShowQuoted] = React.useState(false)
  const remote = !!m.html && hasRemoteImages(m.html)
  const [images, setImages] = React.useState(false)
  React.useEffect(() => {
    setImages(remote && trustedSenders().includes(m.fromEmail.toLowerCase()))
  }, [remote, m.fromEmail])
  const quoted = m.html ? hasQuotedHtml(m.html) : !!splitQuotedReply(m.text).quoted
  const out = m.direction === "out"
  // The message's right-click menu (and "…" in its header).
  const actions = (): MenuAction[] => [
    { label: "Reply", icon: Reply, shortcut: "r", onSelect: () => onReply("reply", m.id) },
    { label: "Reply all", icon: ReplyAll, shortcut: "a", onSelect: () => onReply("replyAll", m.id) },
    { label: "Forward", icon: Forward, shortcut: "f", onSelect: () => onReply("forward", m.id) },
    { separator: true },
    {
      label: "Copy sender's address",
      icon: Copy,
      onSelect: async () => {
        await navigator.clipboard.writeText(m.fromEmail)
        toast.success("Address copied")
      },
    },
    { label: "Show original", icon: FileCode, onSelect: () => void window.open(`/api/app/mail/messages/${m.id}/raw`, "_blank") },
  ]

  if (!expanded) {
    return (
      <ActionMenu actions={actions}>
      <li>
        <button type="button" onClick={onToggle} className="hover:bg-foreground/[0.03] flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors">
          <UserAvatar seed={m.fromEmail} size={28} />
          <span className="w-28 shrink-0 truncate text-sm font-medium sm:w-40">{out ? `${name(m)} (you)` : name(m)}</span>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{messageSnippet(m.text)}</span>
          {m.files.length ? <Paperclip className="text-muted-foreground size-3.5 shrink-0" /> : null}
          <time className="text-muted-foreground shrink-0 text-xs" dateTime={m.createdAt} title={fullDate(m.createdAt)}>
            {shortDate(m.createdAt)}
          </time>
        </button>
      </li>
      </ActionMenu>
    )
  }

  return (
    <li className={cn("bg-background rounded-lg border border-border/70", out && "bg-foreground/[0.015]")}>
      {out && (m.deliveryError || ["bounced", "failed", "rejected", "complained"].includes(m.deliveryStatus ?? "")) ? <p className="text-destructive px-4 pt-3 text-sm">{m.deliveryError ?? `Delivery status: ${m.deliveryStatus}`}</p> : null}
      <ActionMenu actions={actions}>
      <div className="flex items-start gap-3 p-4 pb-0">
        <button type="button" onClick={onToggle} className="shrink-0" aria-label="Collapse">
          <UserAvatar seed={m.fromEmail} size={36} />
        </button>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <button type="button" onClick={onToggle} className="flex min-w-0 items-baseline gap-1.5 text-left text-sm">
            <span className="truncate font-semibold">{name(m)}</span>
            {m.fromName ? <span className="text-muted-foreground hidden truncate text-xs sm:inline">&lt;{m.fromEmail}&gt;</span> : null}
          </button>
          <span className="text-muted-foreground truncate text-xs" title={[m.to && `To: ${m.to}`, m.cc && `Cc: ${m.cc}`].filter(Boolean).join("\n")}>
            to {m.to || "?"}
            {m.cc ? `, cc ${m.cc}` : ""}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-0.5">
          {out ? (
            <span className="text-primary mr-1 hidden items-center gap-1 text-xs font-medium sm:flex">
              <CheckCheck className="size-3.5" /> {m.deliveryStatus ?? "Sent"}
            </span>
          ) : null}
          {m.files.length ? (
            <span className="text-muted-foreground mr-1 flex items-center gap-0.5 text-xs" title={`${m.files.length} attached`}>
              <Paperclip className="size-3.5" />
              {m.files.length}
            </span>
          ) : null}
          <time className="text-muted-foreground mr-1 text-xs" dateTime={m.createdAt} title={fullDate(m.createdAt)}>
            {shortDate(m.createdAt)}
          </time>
          <Button variant="ghost" size="icon-xs" onClick={() => onReply("reply", m.id)} aria-label="Reply" title="Reply">
            <Reply />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => onReply("forward", m.id)} aria-label="Forward" title="Forward">
            <Forward />
          </Button>
          <ActionMenuButton actions={actions} label="Message actions" />
        </span>
      </div>
      </ActionMenu>
      <div className="p-4">
        {remote && !images ? (
          <div className="bg-muted/60 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-xs">
            <ImageOff className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground">Images are hidden so the sender can't track when you read this.</span>
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => setImages(true)}>
              Show images
            </button>
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => {
                trustSender(m.fromEmail)
                setImages(true)
              }}
            >
              Always from {m.fromEmail}
            </button>
          </div>
        ) : null}
        {m.invite ? <InviteCard invite={m.invite} /> : null}
        {m.html ? <HtmlFrame html={m.html} remoteImages={images} showQuoted={showQuoted} /> : <TextBody text={m.text} showQuoted={showQuoted} />}
        {quoted ? (
          <button
            type="button"
            onClick={() => setShowQuoted((v) => !v)}
            className="bg-muted hover:bg-muted/70 mt-2 rounded-md px-2 py-0.5"
            aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"}
            title={showQuoted ? "Hide quoted text" : "Show quoted text"}
          >
            <MoreHorizontal className="size-4" />
          </button>
        ) : null}
        {(m.invite ? m.files.filter((f) => !isIcs(f)) : m.files).length ? <Files files={m.invite ? m.files.filter((f) => !isIcs(f)) : m.files} /> : null}
      </div>
    </li>
  )
}
