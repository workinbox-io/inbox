import * as React from "react"
import { CheckCheck, Download, Forward, ImageOff, MoreHorizontal, Paperclip, Reply } from "lucide-react"

import { hasQuotedHtml, hasRemoteImages, linkSegments, mailSrcDoc } from "@/lib/admin-mail/rules"
import { formatBytes, isImageType } from "@/lib/uploads"
import { splitQuotedReply } from "@/lib/mail/quotes"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/app/user-avatar"
import { trustedSenders, trustSender } from "./drafts"
import type { MailFile, MailMessage, ReplyMode } from "./types"

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
function HtmlFrame({ html, remoteImages, showQuoted }: { html: string; remoteImages: boolean; showQuoted: boolean }) {
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
function TextBody({ text, showQuoted }: { text: string; showQuoted: boolean }) {
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

function Files({ files }: { files: MailFile[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.url}>
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

  if (!expanded) {
    return (
      <li>
        <button type="button" onClick={onToggle} className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors">
          <UserAvatar seed={m.fromEmail} size={28} />
          <span className="w-28 shrink-0 truncate text-sm font-medium sm:w-40">{out ? `${name(m)} (you)` : name(m)}</span>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{messageSnippet(m.text)}</span>
          {m.files.length ? <Paperclip className="text-muted-foreground size-3.5 shrink-0" /> : null}
          <time className="text-muted-foreground shrink-0 text-xs" dateTime={m.createdAt} title={fullDate(m.createdAt)}>
            {shortDate(m.createdAt)}
          </time>
        </button>
      </li>
    )
  }

  return (
    <li className={cn("bg-background rounded-xl border", out && "bg-muted/30")}>
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
              <CheckCheck className="size-3.5" /> Sent
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
        </span>
      </div>
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
        {m.files.length ? <Files files={m.files} /> : null}
      </div>
    </li>
  )
}
