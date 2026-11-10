import * as React from "react"
import { AlertTriangle, ArrowLeft, Loader2, MessagesSquare, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DateTimePicker, formatDateTime } from "@/components/ui/date-time-picker"
import { ConfirmButton } from "@/components/app/confirm-button"
import type { MailThread } from "./types"

export type OutboxStatus = "pending" | "sending" | "sent" | "cancelled" | "failed" | "uncertain"
export interface OutboxRow {
  id: string
  /** The sending address. */
  mailbox?: string
  subject: string
  to: string | string[]
  cc: string[]
  sendAt: number
  status: OutboxStatus
  error: string | null
  deliveryStatus: string | null
  threadId?: string
}

const STATUS: Record<OutboxStatus, { label: string; variant: "outline" | "info" | "success" | "warning" | "danger" }> = {
  pending: { label: "Scheduled", variant: "info" },
  sending: { label: "Sending", variant: "info" },
  sent: { label: "Sent", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
  failed: { label: "Failed", variant: "danger" },
  uncertain: { label: "Check delivery", variant: "warning" },
}

const recipients = (job: OutboxRow) => [...(Array.isArray(job.to) ? job.to : [job.to]), ...job.cc].filter(Boolean)

/** Pending (scheduled) sends, from the list the panel loads; for a count next to "Outbox". */
export const scheduledCount = (jobs: OutboxRow[]) => jobs.filter((j) => j.status === "pending" || j.status === "sending").length

/** Send jobs as list rows (the same list as threads): scheduled ones soonest first, then the rest newest first. */
export function outboxRows(jobs: OutboxRow[], q: string, fallbackMailbox: string): MailThread[] {
  const scheduled = (j: OutboxRow) => j.status === "pending" || j.status === "sending"
  const needle = q.trim().toLowerCase()
  return jobs
    .filter((j) => !needle || [j.subject, ...recipients(j)].join(" ").toLowerCase().includes(needle))
    .sort((a, b) => (scheduled(a) !== scheduled(b) ? (scheduled(a) ? -1 : 1) : scheduled(a) ? a.sendAt - b.sendAt : b.sendAt - a.sendAt))
    .map((j) => {
      const to = recipients(j)
      return {
        id: j.id,
        mailbox: j.mailbox ?? fallbackMailbox,
        subject: j.subject,
        labels: [{ id: j.status, name: j.status === "sent" && j.deliveryStatus ? j.deliveryStatus : STATUS[j.status].label }],
        contactEmail: to[0] ?? "—",
        contactName: to.length > 1 ? `${to[0]} +${to.length - 1}` : null,
        unread: false,
        starred: false,
        spam: false,
        archivedAt: null,
        trashedAt: null,
        snoozedUntil: null,
        lastMessageAt: new Date(j.sendAt).toISOString(),
        snippet: j.error ?? (scheduled(j) ? `Sends ${formatDateTime(j.sendAt)}` : ""),
      }
    })
}

/** One send in the detail pane: who it goes to and when, its delivery status, reschedule or cancel, or its thread. */
export function OutboxDetail({ job, onChanged, onOpenThread, onBack }: { job: OutboxRow; onChanged: () => void; onOpenThread: (threadId: string) => void; onBack?: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const status = STATUS[job.status]
  const to = recipients(job)
  const pending = job.status === "pending"

  async function action(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true)
    try {
      await api(method, `/api/app/mail/outbox/${job.id}`, body)
      toast.success(method === "DELETE" ? "Send cancelled" : "Rescheduled")
      onChanged()
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
          <Button variant="ghost" size="icon-sm" className="-ml-1" onClick={onBack} aria-label="Back">
            <ArrowLeft />
          </Button>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{job.subject || "(No subject)"}</h2>
        <Badge variant={status.variant} className="shrink-0">
          {job.status === "sending" ? <Loader2 className="animate-spin" /> : null}
          {status.label}
        </Badge>
      </div>
      <div className="grid content-start gap-4 overflow-y-auto p-4 text-sm">
        <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5">
          {job.mailbox ? (
            <>
              <dt className="text-muted-foreground">From</dt>
              <dd className="min-w-0 truncate">{job.mailbox}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">To</dt>
          <dd className="min-w-0 break-words">{(Array.isArray(job.to) ? job.to : [job.to]).join(", ") || "—"}</dd>
          {job.cc.length ? (
            <>
              <dt className="text-muted-foreground">Cc</dt>
              <dd className="min-w-0 break-words">{job.cc.join(", ")}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{job.status === "sent" ? "Sent" : pending ? "Sends" : "Was due"}</dt>
          <dd suppressHydrationWarning>{formatDateTime(job.sendAt)}</dd>
          {job.deliveryStatus ? (
            <>
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="capitalize">{job.deliveryStatus}</dd>
            </>
          ) : null}
        </dl>
        {job.error || job.status === "uncertain" || job.status === "failed" ? (
          <p className={cn("flex gap-1.5 text-xs", job.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
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
        <div className="flex flex-wrap items-center gap-2">
          {pending ? (
            <>
              <DateTimePicker
                value={job.sendAt}
                confirmLabel="Reschedule"
                disabled={busy}
                onChange={(sendAt) => {
                  if (sendAt && sendAt !== Math.floor(job.sendAt / 60000) * 60000) void action("PATCH", { sendAt })
                }}
              />
              <ConfirmButton title="Cancel this send?" description="The e-mail is discarded and won't be sent." confirmLabel="Cancel send" onConfirm={() => action("DELETE")}>
                <Button variant="outline" size="sm" disabled={busy}>
                  <X /> Cancel send
                </Button>
              </ConfirmButton>
            </>
          ) : null}
          {job.threadId ? (
            <Button variant="outline" size="sm" onClick={() => onOpenThread(job.threadId!)}>
              <MessagesSquare /> Open thread
            </Button>
          ) : null}
        </div>
        {to.length ? null : <p className="text-muted-foreground text-xs">No recipients.</p>}
      </div>
    </section>
  )
}
