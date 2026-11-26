/**
 * Under an open record: where it was @mentioned (chat, notes, mail the viewer can open), then its activity: comments
 * (written with the chat composer, "@" for people and anything else, rendered from the same tokens, lib/chat/format.ts)
 * with their replies (one level) and emoji reactions, mixed by time with quiet history rows ("Anna changed Status
 * To do → Done", collection_activity). The history reloads when the record changes (`version`).
 */
import * as React from "react"
import { ArrowRight, FileText, Hash, Mail, MessageSquareReply, Pencil, Trash2 } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { Composer } from "@/components/chat/composer"
import { EmojiPicker, RichText } from "@/components/chat/message-row"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ActionMenuButton, cleanActions } from "@/components/workspace/action-menu"
import { api } from "@/lib/api-client"
import { decodeMentions, encodeMentions } from "@/lib/chat/format"
import type { ChatPerson } from "@/lib/chat/types"
import { appLocale, msg, t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { parseRefs } from "@/lib/mentions"
import { CREATED } from "@/lib/collections/activity"
import type { CollectionField, FieldValue } from "@/lib/collections/fields"
import type { ActivityEntry } from "@/lib/server/collection-activity"
import type { Backlink, RecordComment } from "@/lib/server/collections"
import { ValueView, type Person } from "./values"

const RELATION_TEXT: Record<string, string> = { blocks: msg("blocks"), blockedBy: msg("blocked by"), related: msg("related to"), duplicate: msg("duplicate of") }

const when = (iso: string) => new Date(iso).toLocaleString(appLocale(), { dateStyle: "medium", timeStyle: "short" })
const APP_ICON = { chat: Hash, notes: FileText, mail: Mail }

/** One history row: who, what, from → to, when. */
function ActivityRow({ a, fields, people, byId }: { a: ActivityEntry; fields: CollectionField[]; people: Person[]; byId: Map<string, ChatPerson> }) {
  const who = a.actorId ? byId.get(a.actorId)?.name ?? t("Someone") : t("An app")
  const field = fields.find((f) => f.id === a.field)
  const value = (v: unknown) =>
    v === null || v === undefined || v === "" ? <span className="text-muted-foreground/70">{t("empty")}</span>
    : field ? <ValueView field={field} value={v as FieldValue} people={people} />
    : <span className="font-medium">{String(v)}</span>
  let text: React.ReactNode
  if (a.field === CREATED) text = t("{who} created the record", { who })
  else if (a.field === "description") text = t("{who} changed the description", { who })
  else if (a.field === "accepted") text = t("{who} accepted it from triage", { who })
  else if (a.field === "parent") text = a.to ? t("{who} made it a sub-record", { who }) : t("{who} took it out of its parent", { who })
  else if (a.field === "cycle") text = a.to ? t("{who} moved it to cycle {n}", { who, n: String(a.to) }) : t("{who} took it out of its cycle", { who })
  else if (a.field === "relation") {
    const [kind, key] = String(a.to ?? a.from ?? "").split(":")
    text = a.to ? t("{who} added a relation: {kind} {key}", { who, kind: t(RELATION_TEXT[kind!] ?? kind!), key: key ?? "" }) : t("{who} removed a relation", { who })
  }
  else if (a.field === "link") text = a.to ? t("{who} linked {title}", { who, title: String(a.to) }) : t("{who} removed the link {title}", { who, title: String(a.from) })
  else
    text = (
      <>
        {a.field === "title" ? t("{who} renamed it", { who }) : t("{who} changed {field}", { who, field: field?.name ?? t("a removed field") })}
        <span className="inline-flex max-w-full min-w-0 items-center gap-1 align-middle">{value(a.from)}<ArrowRight className="text-muted-foreground size-3 shrink-0" />{value(a.to)}</span>
      </>
    )
  return (
    <li className="text-muted-foreground flex items-center gap-2.5 pl-1.5 text-xs">
      <span className="bg-muted-foreground/40 size-1.5 shrink-0 rounded-full" aria-hidden />
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">{text}<span className="text-muted-foreground/70">· {when(a.createdAt)}</span></span>
    </li>
  )
}

export function RecordComments({ path, people, fields, version }: { path: string; people: Person[]; fields: CollectionField[]; version: string }) {
  const [comments, setComments] = React.useState<RecordComment[] | null>(null)
  const [activity, setActivity] = React.useState<ActivityEntry[]>([])
  React.useEffect(() => {
    api<{ activity: ActivityEntry[] }>("GET", `${path}/activity`).then((r) => setActivity(r.activity), () => {})
  }, [path, version])
  const [me, setMe] = React.useState("")
  const [links, setLinks] = React.useState<Backlink[]>([])
  const [editing, setEditing] = React.useState<{ id: string; text: string } | null>(null)
  const byId = React.useMemo(() => new Map<string, ChatPerson>(people.map((p) => [p.id, { ...p, image: null }])), [people])
  const nameOf = (id: string) => byId.get(id)?.name

  React.useEffect(() => {
    api<{ comments: RecordComment[]; me: string }>("GET", `${path}/comments`).then(
      (r) => (setComments(r.comments), setMe(r.me)),
      (e: Error) => toast.error(e.message),
    )
    api<Backlink[]>("GET", `${path}/backlinks`).then(setLinks, () => {})
  }, [path])

  async function saveEdit(c: RecordComment) {
    if (!editing?.text.trim()) return
    try {
      const saved = await api<RecordComment>("PATCH", `${path}/comments/${c.id}`, { text: encodeMentions(editing.text, people, parseRefs(c.text)) })
      setComments((list) => list?.map((x) => (x.id === c.id ? saved : x)) ?? null)
      setEditing(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const [replying, setReplying] = React.useState<string | null>(null)
  async function react(c: RecordComment, emoji: string) {
    try {
      const { reactions } = await api<{ reactions: RecordComment["reactions"] }>("POST", `${path}/comments/${c.id}/reactions`, { emoji })
      setComments((list) => list?.map((x) => (x.id === c.id ? { ...x, reactions } : x)) ?? null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** One comment: author, time, text (or its editor), reactions, and Reply / react / actions on hover. */
  const comment = (c: RecordComment) => {
    const author = c.authorId ? byId.get(c.authorId) : undefined
    const mine = c.authorId === me
    const actions = cleanActions([
      mine && { label: t("Edit"), icon: Pencil, onSelect: () => setEditing({ id: c.id, text: decodeMentions(c.text, nameOf) }) },
      mine && {
        label: t("Delete"),
        icon: Trash2,
        destructive: true,
        confirm: { title: t("Delete this comment?"), description: t("It is deleted for everyone."), confirmLabel: t("Delete") },
        onSelect: () =>
          api("DELETE", `${path}/comments/${c.id}`).then(
            () => setComments((list) => list?.filter((x) => x.id !== c.id && x.parentId !== c.id) ?? null),
            (e: Error) => void toast.error(e.message),
          ),
      },
    ])
    return (
      <div className="group flex gap-2.5">
        <UserAvatar seed={author?.email ?? c.authorId ?? "?"} size={24} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">{author?.name ?? t("Someone")}</span>
            <span className="text-muted-foreground">{when(c.createdAt)}{c.editedAt ? ` · ${t("edited")}` : ""}</span>
            <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              {me ? <EmojiPicker onPick={(e) => void react(c, e)} className="size-6" /> : null}
              {me && !c.parentId ? (
                <button type="button" aria-label={t("Reply")} title={t("Reply")} onClick={() => setReplying(c.id)} className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-6 place-items-center rounded-md"><MessageSquareReply className="size-3.5" /></button>
              ) : null}
              {actions.length ? <ActionMenuButton actions={actions} label={t("Comment actions")} /> : null}
            </span>
          </div>
          {editing?.id === c.id ? (
            <div className="mt-1 space-y-1.5">
              <Textarea
                value={editing.text}
                autoFocus
                aria-label={t("Edit comment")}
                onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setEditing(null))
                  if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), void saveEdit(c))
                }}
              />
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => void saveEdit(c)}>{t("Save")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("Cancel")}</Button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-[13.5px] leading-6 break-words whitespace-pre-wrap"><RichText text={c.text} people={byId} me={me} /></p>
          )}
          {c.reactions.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.reactions.map((r) => {
                const on = r.userIds.includes(me)
                return (
                  <button key={r.emoji} type="button" aria-pressed={on} onClick={() => void react(c, r.emoji)} title={r.userIds.map((id) => byId.get(id)?.name ?? t("Someone")).join(", ")}
                    className={cn("flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs tabular-nums", on ? "border-primary/40 bg-primary/10" : "hover:bg-accent")}>
                    <span>{r.emoji}</span>{r.userIds.length}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <>
      {links.length ? (
        <section className="mt-8 border-t pt-4" aria-label={t("Mentioned in")}>
          <h3 className="text-muted-foreground mb-2 text-xs font-medium">{t("Mentioned in")}</h3>
          <ul className="space-y-0.5">
            {links.map((l, i) => {
              const Icon = APP_ICON[l.app]
              return (
                <li key={i}>
                  <a href={l.href} className="hover:bg-accent flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px]">
                    <Icon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{new Date(l.at).toLocaleDateString(appLocale(), { day: "numeric", month: "short" })}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      <section className="mt-8 border-t pt-4" aria-label={t("Activity")}>
        <h3 className="text-muted-foreground mb-3 text-xs font-medium">{t("Activity")}</h3>
        <ul className="space-y-4">
          {[...(comments ?? []).filter((c) => !c.parentId).map((c) => ({ at: c.createdAt, c, a: null })), ...activity.map((a) => ({ at: a.createdAt, c: null, a }))]
            .sort((x, y) => x.at.localeCompare(y.at))
            .map(({ c, a }) => {
              if (a) return <ActivityRow key={a.id} a={a} fields={fields} people={people} byId={byId} />
              if (!c) return null
              const replies = (comments ?? []).filter((r) => r.parentId === c.id)
              return (
                <li key={c.id} className="space-y-3">
                  {comment(c)}
                  {replies.length || replying === c.id ? (
                    <ul className="ml-[34px] space-y-3 border-l pl-3">
                      {replies.map((r) => <li key={r.id}>{comment(r)}</li>)}
                      {replying === c.id ? (
                        <li>
                          <Composer
                            draftId={`record:${path.split("/").pop()}:${c.id}`}
                            placeholder={t("Reply…")}
                            compact
                            noFiles
                            onTyping={() => {}}
                            onSend={async (text) => {
                              try {
                                const saved = await api<RecordComment>("POST", `${path}/comments`, { text, parentId: c.id })
                                setComments((list) => [...(list ?? []), saved])
                                setReplying(null)
                              } catch (e) {
                                toast.error((e as Error).message)
                                throw e
                              }
                            }}
                          />
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              )
            })}
        </ul>
        <div className="mt-4">
          <Composer
            draftId={`record:${path.split("/").pop()}`}
            placeholder={t("Write a comment…")}
            compact
            noFiles
            onTyping={() => {}}
            onSend={async (text) => {
              try {
                const c = await api<RecordComment>("POST", `${path}/comments`, { text })
                setComments((list) => [...(list ?? []), c])
              } catch (e) {
                toast.error((e as Error).message)
                throw e
              }
            }}
          />
        </div>
      </section>
    </>
  )
}
