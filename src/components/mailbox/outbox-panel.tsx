import * as React from "react"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Toaster } from "@/components/ui/sonner"

export interface OutboxRow { id: string; subject: string; to: string; cc: string[]; sendAt: number; status: string; error: string | null; deliveryStatus: string | null; threadId?: string }
export function OutboxPanel({ initial }: { initial: OutboxRow[] }) {
  const [jobs, setJobs] = React.useState(initial)
  const [busy, setBusy] = React.useState<string | null>(null)
  const reload = React.useCallback(async () => setJobs((await api<{ jobs: OutboxRow[] }>("GET", "/api/app/mail/outbox")).jobs), [])
  React.useEffect(() => { const timer = setInterval(() => { reload().catch(() => {}) }, 10_000); return () => clearInterval(timer) }, [reload])
  const action = async (job: OutboxRow, method: string, body?: unknown) => {
    setBusy(job.id)
    try { await api(method, `/api/app/mail/outbox/${job.id}`, body); await reload(); toast.success(method === "DELETE" ? "Send cancelled" : "Schedule updated") }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(null) }
  }
  return <div className="bg-background flex h-svh flex-col overflow-y-auto p-6">
    <div className="mb-6 flex items-center justify-between gap-4"><div><h1 className="text-xl">Outbox & scheduled</h1><p className="text-muted-foreground text-sm">Pending mail, delivery status and recent sends.</p></div><Button asChild variant="outline"><a href="/app/mail">Back to mail</a></Button></div>
    <div className="flex flex-col gap-3">{!jobs.length ? <p className="text-muted-foreground">No outgoing messages.</p> : jobs.map(job => <article key={job.id} className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{job.subject}</span><span className="text-muted-foreground text-sm">{job.status}{job.deliveryStatus ? ` · ${job.deliveryStatus}` : ""}</span></div>
      <p className="text-muted-foreground text-sm">To: {job.to}{job.cc.length ? ` · Cc: ${job.cc.join(", ")}` : ""}</p>
      <p className="text-sm" suppressHydrationWarning>{new Date(job.sendAt).toLocaleString()}</p>
      {job.error ? <p className="text-destructive text-sm">{job.error}</p> : null}
      {job.status === "uncertain" ? <p className="text-muted-foreground text-sm">Check the recipient's mailbox or ask your administrator to check delivery using reference <code>{job.id}</code>. This message will not be automatically sent again.</p> : null}
      {job.status === "failed" ? <p className="text-muted-foreground text-sm">This message was stopped before sending. Fix the reported issue and compose a new message. Reference: <code>{job.id}</code>.</p> : null}
      {job.status === "pending" ? <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1"><span className="text-sm font-medium">Send at (your local time)</span><DateTimePicker value={job.sendAt} confirmLabel="Reschedule" disabled={busy === job.id} onChange={sendAt => { if (sendAt && sendAt !== Math.floor(job.sendAt / 60000) * 60000) void action(job, "PATCH", { sendAt }) }} /></div>
        <Button variant="outline" disabled={busy === job.id} onClick={() => action(job, "DELETE")}>Cancel send</Button>
      </div> : job.status === "sent" && job.threadId ? <a className="text-sm underline" href={`/app/mail?t=${job.threadId}`}>Open thread</a> : null}
    </article>)}</div><Toaster />
  </div>
}
