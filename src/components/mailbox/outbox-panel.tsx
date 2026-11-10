import * as React from "react"
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Loader2, MessagesSquare, Send, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DateTimePicker, formatDateTime } from "@/components/ui/date-time-picker"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { ConfirmButton } from "@/components/app/confirm-button"
import { EmptyState } from "@/components/app/empty-state"

export type OutboxStatus = "pending" | "sending" | "sent" | "cancelled" | "failed" | "uncertain"
export interface OutboxRow {
  id: string
  subject: string
  to: string | string[]
  cc: string[]
  sendAt: number
  status: OutboxStatus
  error: string | null
  deliveryStatus: string | null
  threadId?: string
}

type Filter = "scheduled" | "sent" | "problems"
const FILTER_OF: Record<OutboxStatus, Filter> = { pending: "scheduled", sending: "scheduled", sent: "sent", cancelled: "problems", failed: "problems", uncertain: "problems" }

const STATUS: Record<OutboxStatus, { label: string; variant: "outline" | "info" | "success" | "warning" | "danger" }> = {
  pending: { label: "Scheduled", variant: "info" },
  sending: { label: "Sending", variant: "info" },
  sent: { label: "Sent", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
  failed: { label: "Failed", variant: "danger" },
  uncertain: { label: "Check delivery", variant: "warning" },
}

const EMPTY: Record<Filter, { icon: React.ReactNode; title: string; description: string }> = {
  scheduled: { icon: <CalendarClock />, title: "Nothing scheduled", description: "Pick “Send at” in a new e-mail to send it later." },
  sent: { icon: <Send />, title: "Nothing sent yet", description: "Mail you send shows up here with its delivery status." },
  problems: { icon: <CheckCircle2 />, title: "No problems", description: "Failed, cancelled and uncertain sends would show up here." },
}

const recipients = (job: OutboxRow) => [...(Array.isArray(job.to) ? job.to : [job.to]), ...job.cc].filter(Boolean)

/** Pending (scheduled) sends, from the list the panel loads; for a count next to "Outbox". */
export const scheduledCount = (jobs: OutboxRow[]) => jobs.filter((j) => j.status === "pending" || j.status === "sending").length

/**
 * Outgoing mail inside the mail app, in place of the thread list: scheduled sends (reschedule or
 * cancel), recent sends with their delivery status, and the ones that failed. Reloads every 10 s.
 */
export function OutboxPanel({ onOpenThread, onBack, onJobs }: { onOpenThread: (threadId: string) => void; onBack?: () => void; onJobs?: (jobs: OutboxRow[]) => void }) {
  const [jobs, setJobs] = React.useState<OutboxRow[] | null>(null)
  const [filter, setFilter] = React.useState<Filter>("scheduled")
  const [busy, setBusy] = React.useState<string | null>(null)
  const reload = React.useCallback(async () => {
    const res = await api<{ jobs: OutboxRow[] }>("GET", "/api/app/mail/outbox")
    setJobs(res.jobs)
    onJobs?.(res.jobs)
  }, [onJobs])
  React.useEffect(() => {
    reload().catch((e) => toast.error((e as Error).message))
    const timer = setInterval(() => reload().catch(() => {}), 10_000)
    return () => clearInterval(timer)
  }, [reload])

  async function action(job: OutboxRow, method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(job.id)
    try {
      await api(method, `/api/app/mail/outbox/${job.id}`, body)
      await reload()
      toast.success(method === "DELETE" ? "Send cancelled" : "Rescheduled")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const counts = { scheduled: 0, sent: 0, problems: 0 }
  for (const j of jobs ?? []) counts[FILTER_OF[j.status]]++
  const shown = (jobs ?? []).filter((j) => FILTER_OF[j.status] === filter)
  // Scheduled: soonest first. The rest: newest first, as the API returns them.
  if (filter === "scheduled") shown.sort((a, b) => a.sendAt - b.sendAt)

  return (
    <section className="@container flex h-full min-h-0 flex-col">
      <div className="grid gap-2.5 p-3">
        <div className="flex h-8 items-center gap-2 px-1">
          {onBack ? (
            <Button variant="ghost" size="icon-sm" className="-ml-1" onClick={onBack} aria-label="Back to mail">
              <ArrowLeft />
            </Button>
          ) : null}
          <h2 className="text-lg font-semibold tracking-tight">Outbox</h2>
          <span className="text-muted-foreground truncate text-[13px]">{counts.scheduled ? `${counts.scheduled} scheduled` : "Scheduled and recent sends"}</span>
          {jobs === null ? <Loader2 className="text-muted-foreground ml-auto size-3.5 animate-spin" /> : null}
        </div>
        <SegmentedControl<Filter>
          className="self-start"
          aria-label="Show"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: "scheduled", label: "Scheduled", count: counts.scheduled || undefined },
            { value: "sent", label: "Sent" },
            { value: "problems", label: "Problems", count: counts.problems || undefined },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {jobs !== null && !shown.length ? (
          <EmptyState variant="plain" density="compact" className="py-14" {...EMPTY[filter]} />
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y rounded-xl border empty:hidden">
            {shown.map((job) => (
              <OutboxItem key={job.id} job={job} busy={busy === job.id} onAction={action} onOpenThread={onOpenThread} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function OutboxItem({
  job,
  busy,
  onAction,
  onOpenThread,
}: {
  job: OutboxRow
  busy: boolean
  onAction: (job: OutboxRow, method: "PATCH" | "DELETE", body?: unknown) => void
  onOpenThread: (threadId: string) => void
}) {
  const status = STATUS[job.status]
  const to = recipients(job)
  const pending = job.status === "pending"
  return (
    <li className="flex flex-col gap-2 p-3 @lg:flex-row @lg:items-start @lg:gap-4">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{job.subject || "(No subject)"}</span>
          {/* The tab already says "Scheduled" or "Sent"; the badge is for what it doesn't say. */}
          {job.status !== "pending" && job.status !== "sent" ? (
            <Badge variant={status.variant} className="shrink-0">
              {job.status === "sending" ? <Loader2 className="animate-spin" /> : null}
              {status.label}
            </Badge>
          ) : null}
          {job.deliveryStatus && job.status === "sent" ? <span className="text-muted-foreground shrink-0 text-xs capitalize">{job.deliveryStatus}</span> : null}
        </div>
        <p className="text-muted-foreground truncate text-[13px]" title={to.join(", ")}>
          To {to[0] ?? "—"}
          {to.length > 1 ? ` +${to.length - 1}` : ""}
        </p>
        {!pending ? (
          <p className="text-muted-foreground text-xs" suppressHydrationWarning>
            {job.status === "sent" ? "Sent " : "Was due "}
            {formatDateTime(job.sendAt)}
          </p>
        ) : null}
        {job.error || job.status === "uncertain" || job.status === "failed" ? (
          <p className={cn("mt-1 flex gap-1.5 text-xs", job.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span>
              {job.error ? `${job.error} ` : ""}
              {job.status === "uncertain"
                ? "It may or may not have arrived and won't be sent again; check with the recipient."
                : job.status === "failed"
                  ? "Stopped before sending. Fix the issue and send it again from a new e-mail."
                  : ""}{" "}
              <span className="font-mono">Ref {job.id.slice(0, 8)}</span>
            </span>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {pending ? (
          <>
            <DateTimePicker
              value={job.sendAt}
              confirmLabel="Reschedule"
              disabled={busy}
              align="end"
              onChange={(sendAt) => {
                if (sendAt && sendAt !== Math.floor(job.sendAt / 60000) * 60000) onAction(job, "PATCH", { sendAt })
              }}
            />
            <ConfirmButton title="Cancel this send?" description="The e-mail is discarded and won't be sent." confirmLabel="Cancel send" onConfirm={() => onAction(job, "DELETE")}>
              <Button variant="ghost" size="icon-sm" disabled={busy} aria-label="Cancel send" title="Cancel send">
                <X />
              </Button>
            </ConfirmButton>
          </>
        ) : job.threadId ? (
          <Button variant="ghost" size="sm" onClick={() => onOpenThread(job.threadId!)}>
            <MessagesSquare /> Open thread
          </Button>
        ) : null}
      </div>
    </li>
  )
}
