import * as React from "react"

import { ArrowLeft, Loader2, UserRoundPen } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { draftMeta, readDraft, takeOverDraft, useDraftKeys, type TeamDraft } from "./drafts"
import type { Draft, MailThread } from "./types"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/components/ui/date-time-picker"
import { t } from "@/lib/i18n/panel"

/** Drafts as list rows (the same list as threads), keyed by the draft key. Empty ones (a reply opened and left) are skipped. */
export interface DraftRow extends MailThread {
  /** A reply's thread: opening the row opens the thread with its draft. */
  threadId: string | null
}

const isThread = (key: string) => key !== "new" && !key.startsWith("d-")

/** Row id of a colleague's draft (shown read-only). */
export const teamRowId = (d: TeamDraft) => `team:${d.authorId}:${d.key}`
export const isTeamRow = (id: string) => id.startsWith("team:")

export function draftRows(keys: Set<string>, boxes: string[], q: string, team: TeamDraft[] = []): DraftRow[] {
  const needle = q.trim().toLowerCase()
  const out: DraftRow[] = []
  const entries = [
    ...[...keys].map((key) => ({ id: key, key, draft: readDraft(key) as (Draft & { updatedAt?: number }) | null, meta: draftMeta(key), author: null as string | null })),
    ...team.map((d) => ({ id: teamRowId(d), key: d.key, draft: { ...d.draft, updatedAt: d.updatedAt }, meta: d, author: d.author })),
  ]
  for (const { id, key, draft, meta, author } of entries) {
    if (!draft || (!draft.text.trim() && !draft.subject.trim() && !draft.to.length)) continue
    if (!boxes.includes(draft.from)) continue
    const subject = isThread(key) ? t("Re: {subject}", { subject: meta?.threadSubject ?? draft.subject }) : draft.subject.trim()
    if (needle && ![subject, ...draft.to, ...draft.cc, draft.text].join(" ").toLowerCase().includes(needle)) continue
    out.push({
      id,
      threadId: !author && isThread(key) ? key : null,
      mailbox: draft.from,
      subject,
      labels: [
        ...(author ? [{ id: "team", name: t("Draft by {name}", { name: author }) }] : []),
        ...(meta?.source === "ai" ? [{ id: "ai", name: meta.via ? t("From {name}", { name: meta.via }) : t("From an AI app") }] : []),
      ],
      contactEmail: draft.to[0] || t("No recipient"),
      contactName: draft.to.length > 1 ? `${draft.to[0]} +${draft.to.length - 1}` : null,
      unread: false,
      starred: false,
      spam: false,
      archivedAt: null,
      trashedAt: null,
      snoozedUntil: null,
      lastMessageAt: new Date(draft.updatedAt ?? Date.now()).toISOString(),
      snippet: draft.text.trim().replace(/\s+/g, " ").slice(0, 160),
    })
  }
  return out.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

/** Count for "Drafts" in the folders. */
export function useDraftCount(boxes: string[]) {
  const keys = useDraftKeys()
  return React.useMemo(() => draftRows(keys, boxes, "").length, [keys, boxes])
}

/** A colleague's draft in a shared mailbox: read-only, "Take over" makes it the person's own. */
export function TeamDraftDetail({ draft, onTaken, onBack }: { draft: TeamDraft; onTaken: (key: string) => void; onBack?: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const d = draft.draft
  async function takeOver() {
    setBusy(true)
    try {
      await takeOverDraft(draft)
      toast.success(t("Draft taken over"))
      onTaken(draft.key)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        {onBack ? (
          <Button variant="ghost" size="icon-sm" className="-ml-1" onClick={onBack} aria-label={t("Back")}>
            <ArrowLeft />
          </Button>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{draft.threadSubject ? t("Re: {subject}", { subject: draft.threadSubject }) : d.subject || t("(No subject)")}</h2>
        <Button size="sm" onClick={takeOver} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <UserRoundPen />} {t("Take over")}
        </Button>
      </div>
      <div className="grid content-start gap-4 overflow-y-auto p-4 text-sm">
        <p className="text-muted-foreground text-xs">{t("{name} is writing this draft. Take it over to edit and send it; it then disappears from their drafts.", { name: draft.author })}</p>
        <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-muted-foreground">{t("From")}</dt>
          <dd className="min-w-0 truncate">{d.from}</dd>
          <dt className="text-muted-foreground">{t("To")}</dt>
          <dd className="min-w-0 break-words">{d.to.join(", ") || "—"}</dd>
          {d.cc.length ? (
            <>
              <dt className="text-muted-foreground">{t("Cc")}</dt>
              <dd className="min-w-0 break-words">{d.cc.join(", ")}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{t("Edited")}</dt>
          <dd suppressHydrationWarning>{formatDateTime(draft.updatedAt)}</dd>
        </dl>
        <p className="whitespace-pre-wrap break-words">{d.text}</p>
      </div>
    </section>
  )
}
