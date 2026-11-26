/**
 * The chat composer: grows with the text, Enter sends and Shift+Enter breaks the line, ⌘B/⌘I/⌘E wrap the selection,
 * "@" suggests people, files, notes, events, contacts, threads and channels (written as @Title, turned into
 * tokens from what was picked on send, lib/mentions.ts), files upload right away
 * (components/uploads/attachments.tsx). The draft is kept per conversation in this browser.
 */
import * as React from "react"
import { AtSign, Bold, Code, Italic, Paperclip, SendHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AttachButton, AttachmentDropZone, AttachmentStrip, uploadWithProgress, useAttachments, type UploadFn } from "@/components/uploads/attachments"
import { MentionList, useMentionSearch } from "@/components/workspace/mentions"
import { Kbd } from "@/components/workspace/ui"
import type { ChatFile } from "@/lib/chat/types"
import { encodePicked, refToken, type Mentionable } from "@/lib/mentions"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"

const upload: UploadFn = (file, mediaType, onProgress) => uploadWithProgress("/api/app/attachments", {}, file, mediaType, onProgress, t("Upload failed"))

const draftKey = (key: string) => `chat-draft:${key}`
const readDraft = (key: string) => {
  try {
    return localStorage.getItem(draftKey(key)) ?? ""
  } catch {
    return ""
  }
}
const writeDraft = (key: string, text: string) => {
  try {
    if (text) localStorage.setItem(draftKey(key), text)
    else localStorage.removeItem(draftKey(key))
  } catch {}
}

export interface ComposerHandle {
  focus: () => void
}

export function Composer({
  draftId,
  placeholder,
  compact,
  noFiles,
  onSend,
  onTyping,
  onEditLast,
  ref,
}: {
  /** Where the draft is kept: the channel id, or `thread:<id>`. */
  draftId: string
  placeholder: string
  compact?: boolean
  /** No attaching (record comments). */
  noFiles?: boolean
  onSend: (text: string, files: ChatFile[]) => Promise<void>
  onTyping: () => void
  /** ↑ in an empty composer edits your last message. */
  onEditLast?: () => void
  ref?: React.Ref<ComposerHandle>
}) {
  const [value, setValue] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [mention, setMention] = React.useState<{ query: string; start: number; index: number } | null>(null)
  const area = React.useRef<HTMLTextAreaElement>(null)
  // shortcut: what was picked lives in memory, so after a reload a typed "@Title" stays text (people still match by name).
  const picked = React.useRef<{ label: string; token: string }[]>([])
  const attachments = useAttachments(upload, {
    attach: t("Attach files"),
    remove: t("Remove"),
    drop: t("Drop files to attach"),
    tooLarge: t("Files can be up to 10 MB"),
    unsupported: t("This file type isn't supported"),
    tooMany: t("Up to 5 files per message"),
    failed: t("Upload failed"),
  })

  React.useImperativeHandle(ref, () => ({ focus: () => area.current?.focus({ preventScroll: true }) }), [])
  React.useEffect(() => {
    setValue(readDraft(draftId))
    picked.current = []
  }, [draftId])

  React.useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  const change = (next: string, caret?: number) => {
    setValue(next)
    writeDraft(draftId, next)
    if (next) onTyping()
    const at = caret ?? next.length
    const before = next.slice(0, at)
    const m = /(^|\s)@([\p{L}\p{N} ._'-]{0,30})$/u.exec(before)
    setMention(m && !m[2]!.includes("  ") ? { query: m[2]!, start: at - m[2]!.length - 1, index: 0 } : null)
  }

  const suggestions = useMentionSearch(mention ? mention.query : null).slice(0, 12)

  const pick = (m: Mentionable) => {
    if (!mention) return
    const el = area.current
    const caret = el?.selectionStart ?? value.length
    const label = m.title.replace(/[|<>\n]+/g, " ").trim()
    picked.current.push({ label, token: m.kind === "person" ? `<@${m.id}>` : refToken({ kind: m.kind, id: m.id, title: label }) })
    const next = `${value.slice(0, mention.start)}@${label} ${value.slice(caret)}`
    const pos = mention.start + label.length + 2
    setValue(next)
    writeDraft(draftId, next)
    setMention(null)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  const wrap = (left: string, right = left) => {
    const el = area.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    change(value.slice(0, s) + left + value.slice(s, e) + right + value.slice(e))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + left.length, e + left.length)
    })
  }

  const canSend = (!!value.trim() || attachments.ready.length > 0) && !attachments.uploading && !sending

  const send = async () => {
    if (!canSend) return
    setSending(true)
    try {
      const files = attachments.items.flatMap((f) => (f.status === "done" && f.result ? [{ url: f.result.url, name: f.result.filename, size: f.size, type: f.result.mediaType }] : []))
      await onSend(encodePicked(value, picked.current), files)
      picked.current = []
      setValue("")
      writeDraft(draftId, "")
      attachments.clear()
    } finally {
      setSending(false)
      requestAnimationFrame(() => area.current?.focus())
    }
  }

  const tool = "text-muted-foreground hover:bg-accent hover:text-foreground flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

  const box = (
      <div className="bg-card focus-within:border-ring/60 focus-within:ring-ring/15 relative rounded-xl border shadow-xs transition-shadow focus-within:ring-[3px]">
        {suggestions.length && mention ? (
          <MentionList
            items={suggestions}
            active={Math.min(mention.index, suggestions.length - 1)}
            onPick={pick}
            onHover={(index) => setMention({ ...mention, index })}
            className="absolute bottom-full left-2 z-20 mb-1"
          />
        ) : null}
        <textarea
          ref={area}
          rows={1}
          aria-label={placeholder}
          placeholder={placeholder}
          value={value}
          onChange={(e) => change(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (suggestions.length && mention) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                const n = suggestions.length
                setMention({ ...mention, index: (mention.index + (e.key === "ArrowDown" ? 1 : n - 1)) % n })
                return
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                pick(suggestions[Math.min(mention.index, suggestions.length - 1)]!)
                return
              }
              if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                setMention(null)
                return
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            } else if (e.key === "ArrowUp" && !value && onEditLast) {
              e.preventDefault()
              onEditLast()
            } else if ((e.metaKey || e.ctrlKey) && ["b", "i", "e"].includes(e.key.toLowerCase())) {
              e.preventDefault()
              const k = e.key.toLowerCase()
              wrap(k === "b" ? "**" : k === "i" ? "_" : "`")
            }
          }}
          className="placeholder:text-muted-foreground/70 block max-h-[200px] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[13.5px] leading-6 outline-none"
        />
        {noFiles ? null : <AttachmentStrip attachments={attachments} removeLabel={t("Remove")} className="px-2.5 pb-1" />}
        <div className="flex items-center gap-0.5 px-2 pb-2">
          {!compact ? (
            <>
              <button type="button" className={tool} onClick={() => wrap("**")} aria-label={t("Bold")} title={t("Bold (⌘B)")}>
                <Bold className="size-4" />
              </button>
              <button type="button" className={tool} onClick={() => wrap("_")} aria-label={t("Italic")} title={t("Italic (⌘I)")}>
                <Italic className="size-4" />
              </button>
              <button type="button" className={tool} onClick={() => wrap("`")} aria-label={t("Code")} title={t("Code (⌘E)")}>
                <Code className="size-4" />
              </button>
              <span className="bg-border mx-1 h-4 w-px" />
            </>
          ) : null}
          {noFiles ? null : <AttachButton attachments={attachments} label={t("Attach files")} icon={Paperclip} className={cn(tool, "size-7 rounded-md bg-transparent [&_svg]:size-4")} />}
          <button
            type="button"
            className={tool}
            aria-label={t("Mention someone or something")}
            title={t("Mention people, files, notes, events…")}
            onClick={() => {
              const next = `${value}${value && !value.endsWith(" ") ? " " : ""}@`
              change(next)
              requestAnimationFrame(() => area.current?.focus())
            }}
          >
            <AtSign className="size-4" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {!compact ? (
              <span className="text-muted-foreground hidden items-center gap-1 text-xs lg:flex">
                <Kbd>⇧↵</Kbd> {t("new line")}
              </span>
            ) : null}
            <Button size="icon-sm" variant={canSend ? "default" : "ghost"} disabled={!canSend} onClick={() => void send()} aria-label={t("Send message")} className="size-7 active:scale-95">
              <SendHorizontal className="size-4" />
            </Button>
          </div>
        </div>
      </div>
  )
  return noFiles ? box : <AttachmentDropZone attachments={attachments} label={t("Drop files to attach")}>{box}</AttachmentDropZone>
}
