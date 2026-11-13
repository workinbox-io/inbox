/**
 * One chat message, Slack-like: avatar and name unless grouped with the one above, text from lib/chat/format.ts
 * tokens (never HTML), files, reaction chips, the thread summary, and a toolbar on hover (quick reactions, emoji
 * grid, reply in thread, save, more).
 */
import * as React from "react"
import { Bookmark, Copy, FileText, MessageSquareText, Pencil, Pin, PinOff, SmilePlus, Trash2 } from "lucide-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { ActionMenuButton, cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import { tokenize } from "@/lib/chat/format"
import { CHAT_EMOJI, QUICK_EMOJI } from "@/lib/chat/rules"
import type { ChatMessage, ChatPerson } from "@/lib/chat/types"
import { t } from "@/lib/i18n/panel"
import { formatBytes, isImageType } from "@/lib/uploads"
import { cn } from "@/lib/utils"

export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

export function dayLabel(ms: number) {
  const d = new Date(ms)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return t("Today")
  if (d.toDateString() === yesterday.toDateString()) return t("Yesterday")
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) })
}

export const firstName = (p?: ChatPerson) => p?.name.split(" ")[0] || p?.email.split("@")[0] || t("Someone")

export function RichText({ text, people, me }: { text: string; people: Map<string, ChatPerson>; me: string }) {
  return (
    <>
      {tokenize(text).map((tok, i) => {
        switch (tok.type) {
          case "code":
            return (
              <code key={i} className="bg-muted rounded border px-1 py-px font-mono text-[0.8125rem]">
                {tok.text}
              </code>
            )
          case "bold":
            return <strong key={i} className="font-semibold">{tok.text}</strong>
          case "italic":
            return <em key={i}>{tok.text}</em>
          case "link":
            return (
              <a key={i} href={tok.text} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline-offset-2 hover:underline">
                {tok.text}
              </a>
            )
          case "mention": {
            const p = people.get(tok.userId)
            return (
              <span key={i} className={cn("rounded px-0.5 font-medium", tok.userId === me ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-primary/10 text-primary")}>
                @{p?.name ?? t("someone")}
              </span>
            )
          }
          default:
            return <React.Fragment key={i}>{tok.text}</React.Fragment>
        }
      })}
    </>
  )
}

export function EmojiPicker({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("Add reaction")}
        title={t("Add reaction")}
        className={cn("text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent flex size-7 items-center justify-center rounded-md outline-none", className)}
      >
        <SmilePlus className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-auto p-1">
        <div className="grid grid-cols-6 gap-0.5">
          {CHAT_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={t("React with {emoji}").replace("{emoji}", e)}
              className="hover:bg-accent flex size-8 items-center justify-center rounded-md text-lg transition-transform active:scale-90"
              onClick={() => {
                onPick(e)
                setOpen(false)
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Files({ files }: { files: ChatMessage["files"] }) {
  if (!files.length) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {files.map((f) =>
        isImageType(f.type) ? (
          <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border">
            <img src={f.url} alt={f.name} loading="lazy" className="max-h-60 max-w-xs object-cover" />
          </a>
        ) : (
          <a
            key={f.url}
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-card hover:bg-accent/40 flex w-full max-w-xs items-center gap-3 rounded-lg border p-2.5 transition-colors"
          >
            <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
              <FileText className="size-4" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium">{f.name}</span>
              <span className="text-muted-foreground mt-0.5 block text-xs tabular-nums">
                {(f.name.split(".").pop() ?? "").toUpperCase()} · {formatBytes(f.size)}
              </span>
            </span>
          </a>
        ),
      )}
    </div>
  )
}

export interface MessageHandlers {
  onReact: (m: ChatMessage, emoji: string) => void
  onSave: (m: ChatMessage) => void
  onPin: (m: ChatMessage) => void
  onEdit: (m: ChatMessage, text: string) => Promise<void>
  onDelete: (m: ChatMessage) => void
  onOpenThread?: (m: ChatMessage) => void
  onCopyLink: (m: ChatMessage) => void
}

export function MessageRow({
  message: m,
  grouped,
  people,
  me,
  canModerate,
  inThread,
  active,
  flash,
  editing,
  setEditing,
  editText,
  handlers,
}: {
  message: ChatMessage
  grouped: boolean
  people: Map<string, ChatPerson>
  me: string
  canModerate: boolean
  inThread?: boolean
  /** Its thread is open on the right. */
  active?: boolean
  flash?: boolean
  editing: boolean
  setEditing: (on: boolean) => void
  /** The text as typed (mentions as @Name), for the edit box. */
  editText: string
  handlers: MessageHandlers
}) {
  const author = m.authorId ? people.get(m.authorId) : undefined
  const mine = m.authorId === me
  const [draft, setDraft] = React.useState(editText)
  React.useEffect(() => setDraft(editText), [editing, editText])

  const actions = (): MenuAction[] =>
    cleanActions([
      { label: m.pinned ? t("Unpin from channel") : t("Pin to channel"), icon: m.pinned ? PinOff : Pin, onSelect: () => handlers.onPin(m) },
      { label: t("Copy link"), icon: Copy, onSelect: () => handlers.onCopyLink(m) },
      mine && { separator: true },
      mine && { label: t("Edit message"), icon: Pencil, onSelect: () => setEditing(true) },
      (mine || canModerate) && {
        label: t("Delete message"),
        icon: Trash2,
        destructive: true,
        confirm: { title: t("Delete this message?"), description: t("It disappears for everyone. Replies in its thread stay."), confirmLabel: t("Delete") },
        onSelect: () => handlers.onDelete(m),
      },
    ])

  if (m.deleted)
    return (
      <div className="flex gap-3 px-4 py-1.5" data-msg={m.id}>
        <span className="w-8 shrink-0" />
        <p className="text-muted-foreground text-[13px] italic">{t("This message was deleted.")}</p>
      </div>
    )

  return (
    <div
      data-msg={m.id}
      className={cn(
        "group/msg relative flex gap-3 px-4 transition-colors duration-300",
        grouped ? "py-0.5" : "pt-2 pb-0.5",
        editing ? "bg-amber-500/[0.06]" : "hover:bg-foreground/[0.025] focus-within:bg-foreground/[0.025]",
        active && "bg-primary/[0.05]",
        m.saved && !editing && "bg-amber-500/[0.05]",
        flash && "bg-amber-500/20 duration-0",
      )}
    >
      <div className="w-8 shrink-0">
        {grouped ? (
          <span className="text-muted-foreground block pt-0.5 text-right text-[10px] leading-5 tabular-nums opacity-0 group-hover/msg:opacity-100" suppressHydrationWarning>
            {clock(m.createdAt).replace(/\s?(AM|PM)$/i, "")}
          </span>
        ) : (
          <UserAvatar seed={author?.email ?? m.authorId ?? "?"} size={32} className="mt-0.5 rounded-md" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {m.saved || m.pinned ? (
          <div className="text-muted-foreground flex items-center gap-2 pb-0.5 text-xs font-medium">
            {m.saved ? (
              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <Bookmark className="size-3 fill-current" /> {t("Saved for later")}
              </span>
            ) : null}
            {m.pinned ? (
              <span className="flex items-center gap-1">
                <Pin className="size-3" /> {t("Pinned")}
              </span>
            ) : null}
          </div>
        ) : null}
        {!grouped ? (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">{author?.name ?? t("Former member")}</span>
            <span className="text-muted-foreground text-xs tabular-nums" suppressHydrationWarning>
              {clock(m.createdAt)}
            </span>
          </div>
        ) : null}
        {editing ? (
          <div className="mt-1 grid gap-1.5">
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault()
                  e.stopPropagation()
                  setEditing(false)
                }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void handlers.onEdit(m, draft).then(() => setEditing(false))
                }
              }}
              className="min-h-16 text-[13px]"
            />
            <p className="text-muted-foreground text-xs">{t("Enter to save, Esc to cancel")}</p>
          </div>
        ) : m.text ? (
          <p className="text-[13.5px] leading-6 text-pretty whitespace-pre-wrap [overflow-wrap:anywhere]">
            <RichText text={m.text} people={people} me={me} />
            {m.editedAt ? <span className="text-muted-foreground ml-1 text-[11px]">({t("edited")})</span> : null}
          </p>
        ) : null}
        <Files files={m.files} />
        {m.reactions.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {m.reactions.map((r) => {
              const pressed = r.userIds.includes(me)
              const names = r.userIds.map((id) => (id === me ? t("You") : firstName(people.get(id)))).join(", ")
              return (
                <button
                  key={r.emoji}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={`${r.emoji} ${r.userIds.length}: ${names}`}
                  title={names}
                  onClick={() => handlers.onReact(m, r.emoji)}
                  className={cn(
                    "animate-in zoom-in-90 flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors duration-150 active:scale-95",
                    pressed ? "border-primary/40 bg-primary/10 text-primary" : "bg-background hover:border-foreground/20",
                  )}
                >
                  <span className="text-[13px] leading-none">{r.emoji}</span>
                  <span className="font-medium tabular-nums">{r.userIds.length}</span>
                </button>
              )
            })}
          </div>
        ) : null}
        {!inThread && m.replyCount > 0 && handlers.onOpenThread ? (
          <button
            type="button"
            onClick={() => handlers.onOpenThread!(m)}
            className="group/thr hover:bg-background hover:border-border -ml-1.5 mt-1 flex items-center gap-2 rounded-md border border-transparent py-1 pr-2 pl-1.5 text-left transition-colors"
          >
            <span className="flex -space-x-1">
              {m.repliers.map((id) => (
                <UserAvatar key={id} seed={people.get(id)?.email ?? id} size={18} className="ring-background rounded-[5px] ring-2" />
              ))}
            </span>
            <span className="text-primary text-xs font-semibold">
              {m.replyCount} {m.replyCount === 1 ? t("reply") : t("replies")}
            </span>
            {m.lastReplyAt ? (
              <span className="text-muted-foreground text-xs group-hover/thr:hidden" suppressHydrationWarning>
                {t("Last reply")} {dayLabel(m.lastReplyAt) === t("Today") ? clock(m.lastReplyAt) : dayLabel(m.lastReplyAt)}
              </span>
            ) : null}
            <span className="text-muted-foreground hidden text-xs group-hover/thr:inline">{t("View thread")}</span>
          </button>
        ) : null}
      </div>

      {!editing ? (
        <div className="bg-popover pointer-events-none absolute -top-3.5 right-4 z-10 flex items-center gap-0.5 rounded-lg border p-0.5 opacity-0 shadow-sm transition-opacity duration-100 group-focus-within/msg:pointer-events-auto group-focus-within/msg:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100">
          {QUICK_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={t("React with {emoji}").replace("{emoji}", e)}
              onClick={() => handlers.onReact(m, e)}
              className="hover:bg-accent flex size-7 items-center justify-center rounded-md text-sm"
            >
              {e}
            </button>
          ))}
          <span className="bg-border mx-0.5 h-4 w-px" />
          <EmojiPicker onPick={(e) => handlers.onReact(m, e)} />
          {!inThread && handlers.onOpenThread ? (
            <button
              type="button"
              aria-label={t("Reply in thread")}
              title={t("Reply in thread")}
              onClick={() => handlers.onOpenThread!(m)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-7 items-center justify-center rounded-md"
            >
              <MessageSquareText className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={m.saved ? t("Remove from saved") : t("Save for later")}
            title={m.saved ? t("Remove from saved") : t("Save for later")}
            aria-pressed={m.saved}
            onClick={() => handlers.onSave(m)}
            className={cn("hover:bg-accent flex size-7 items-center justify-center rounded-md", m.saved ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground hover:text-foreground")}
          >
            <Bookmark className={cn("size-4", m.saved && "fill-current")} />
          </button>
          <ActionMenuButton actions={actions} label={t("Message actions")} className="size-7" />
        </div>
      ) : null}
    </div>
  )
}
