/**
 * Small signs on a card or a list row, shared by the board and the list: sub-records done ("2/5" with a ring), blocked
 * (an open record blocks it), the SLA (time left, or missed), and linked pull requests' state.
 */
import * as React from "react"
import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, OctagonAlert, Timer } from "lucide-react"
import { isClosed } from "@/lib/collections/fields"
import { shortSpan, slaHours, slaState } from "@/lib/collections/settings"
import { t, tp } from "@/lib/i18n/panel"
import type { Collection, CollectionRecord } from "@/lib/server/collections"
import { cn } from "@/lib/utils"

/** Sub-records by parent and records by id, from the loaded list. */
export function useRecordIndex(records: CollectionRecord[]) {
  return React.useMemo(() => {
    const byId = new Map(records.map((r) => [r.id, r]))
    const children = new Map<string, CollectionRecord[]>()
    for (const r of records) if (r.parentId) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r])
    return { byId, children }
  }, [records])
}
export type RecordIndex = ReturnType<typeof useRecordIndex>

/** A ring filling with the share done. */
export function ProgressRing({ done, total, className }: { done: number; total: number; className?: string }) {
  const frac = total ? done / total : 0
  const c = 2 * Math.PI * 5
  return (
    <svg viewBox="0 0 14 14" className={cn("size-3.5 shrink-0 -rotate-90", className)} aria-hidden>
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2" />
      <circle cx="7" cy="7" r="5" fill="none" stroke={frac === 1 ? "#5e6ad2" : "currentColor"} strokeWidth="2" strokeDasharray={`${c * frac} ${c}`} />
    </svg>
  )
}

const PR_ICON = { open: GitPullRequest, draft: GitPullRequestDraft, merged: GitMerge, closed: GitPullRequestClosed }
const PR_COLOR = { open: "text-green-600 dark:text-green-400", draft: "text-muted-foreground", merged: "text-violet-600 dark:text-violet-400", closed: "text-red-600 dark:text-red-400" }

export function RecordBadges({ record, collection, index, now }: { record: CollectionRecord; collection: Collection; index: RecordIndex; now: number }) {
  const kids = index.children.get(record.id) ?? []
  const done = kids.filter((k) => isClosed(collection.fields, k.values)).length
  // A blocker not loaded here (another collection, or filtered out) still counts.
  const blocked = !isClosed(collection.fields, record.values) && (record.blockedBy ?? []).some((id) => {
    const b = index.byId.get(id)
    return !b || !isClosed(collection.fields, b.values)
  })
  const hours = !isClosed(collection.fields, record.values) ? slaHours(collection.settings.sla, record.values) : null
  const sla = hours ? slaState(Date.parse(record.createdAt), hours, now) : null
  const prs = [...new Set(record.linkStates ?? [])] as (keyof typeof PR_ICON)[]
  if (!kids.length && !blocked && !sla && !prs.length) return null
  return (
    <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
      {blocked ? <span title={t("Blocked")} className="flex items-center text-red-600 dark:text-red-400"><OctagonAlert className="size-3.5" aria-label={t("Blocked")} /></span> : null}
      {kids.length ? (
        <span className="flex items-center gap-1 tabular-nums" title={tp(kids.length, { one: "{done} of {n} sub-record done", other: "{done} of {n} sub-records done" }, { done })}>
          <ProgressRing done={done} total={kids.length} />{done}/{kids.length}
        </span>
      ) : null}
      {sla ? (
        <span title={sla.state === "breached" ? t("SLA missed") : t("SLA: time left")} className={cn("flex items-center gap-0.5 rounded px-1 tabular-nums", sla.state === "breached" && "bg-red-500/10 text-red-600 dark:text-red-400", sla.state === "soon" && "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
          <Timer className="size-3" />{sla.state === "breached" ? `-${shortSpan(sla.left)}` : shortSpan(sla.left)}
        </span>
      ) : null}
      {prs.map((s) => { const Icon = PR_ICON[s] ?? GitPullRequest; return <Icon key={s} className={cn("size-3.5", PR_COLOR[s])} aria-label={t("Pull request: {state}", { state: s })} /> })}
    </span>
  )
}
