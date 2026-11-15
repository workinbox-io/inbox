import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/app/settings-section"
import { useSettingsDraft } from "@/components/settings/settings-draft"

interface SendingStatus {
  orgId: string
  limits: { scopeId: string; dailyRecipients: number }[]
  caps: { mailbox: number; organization: number; newUntil: number | null }
  reputation: { sent: number; bounced: number; complained: number; paused: "bounces" | "complaints" | null }
}

export function SendingLimits({ mailboxes }: { mailboxes: { id: string; address: string }[] }) {
  const [limits, setLimits] = React.useState<Record<string, number>>({})
  const [saved, setSaved] = React.useState<Record<string, number>>({})
  const [busy, setBusy] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const [orgScope, setOrgScope] = React.useState("")
  const [status, setStatus] = React.useState<Pick<SendingStatus, "caps" | "reputation"> | null>(null)
  useSettingsDraft(Object.keys(limits).some(scope => limits[scope] !== saved[scope]), busy)
  React.useEffect(() => {
    api<SendingStatus>("GET", "/api/app/mail/settings/sending").then(data => {
      setLimits(Object.fromEntries(data.limits.map(l => [l.scopeId, l.dailyRecipients])))
      setSaved(Object.fromEntries(data.limits.map(l => [l.scopeId, l.dailyRecipients])))
      setOrgScope(data.orgId)
      setStatus(data)
      setReady(true)
    }).catch(e => toast.error((e as Error).message))
  }, [])
  const save = async (scope: string, mailboxId: string | null) => {
    setBusy(true)
    try { const value = limits[scope] ?? (mailboxId ? 500 : 5000); await api("POST", "/api/app/mail/settings/sending", { mailboxId, dailyRecipients: value }); setSaved(previous => ({ ...previous, [scope]: value })); toast.success("Sending limit saved") }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  return <SettingsSection title="Sending limits" description="Recipient limits reset daily at midnight UTC. To and Cc count once per distinct address; zero disables sending.">
    {status?.reputation.paused ? <p className="bg-destructive/10 text-destructive mb-4 rounded-lg px-3 py-2 text-sm">
      Sending is paused: {status.reputation.paused === "bounces" ? `${status.reputation.bounced} bounced messages` : `${status.reputation.complained} spam complaints`} out of {status.reputation.sent} recipients in the last 7 days. It resumes on its own as they age out.
    </p> : status?.caps.newUntil ? <p className="bg-muted text-muted-foreground mb-4 rounded-lg px-3 py-2 text-sm">
      New organization: up to {status.caps.mailbox} recipients a day per mailbox and {status.caps.organization} for the organization until {new Date(status.caps.newUntil).toLocaleDateString()}, or right away on a paid plan.
    </p> : null}
    <div className="flex flex-col gap-4">{[{ id: orgScope, address: "Whole organization", mailboxId: null }, ...mailboxes.map(b => ({ ...b, mailboxId: b.id }))].map(row => <div key={row.id || "organization"} className="flex items-end gap-2">
      <div className="flex flex-1 flex-col gap-1"><Label htmlFor={`limit-${row.id}`}>{row.address}</Label><Input id={`limit-${row.id}`} type="number" min={0} max={1000000} disabled={!ready || busy || !orgScope} value={limits[row.id] ?? (row.mailboxId ? 500 : 5000)} onChange={e => setLimits(l => ({ ...l, [row.id]: Number(e.target.value) }))} /></div>
      <Button variant="outline" disabled={!ready || busy || !orgScope} onClick={() => save(row.id, row.mailboxId)}>Save</Button>
    </div>)}</div>
  </SettingsSection>
}
