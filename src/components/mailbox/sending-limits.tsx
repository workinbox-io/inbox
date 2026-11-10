import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/app/settings-section"

export function SendingLimits({ mailboxes }: { mailboxes: { id: string; address: string }[] }) {
  const [limits, setLimits] = React.useState<Record<string, number>>({})
  const [busy, setBusy] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const [orgScope, setOrgScope] = React.useState("")
  React.useEffect(() => {
    api<{ orgId: string; limits: { scopeId: string; dailyRecipients: number }[] }>("GET", "/api/app/mail/settings/sending").then(data => {
      setLimits(Object.fromEntries(data.limits.map(l => [l.scopeId, l.dailyRecipients])))
      setOrgScope(data.orgId)
      setReady(true)
    }).catch(e => toast.error((e as Error).message))
  }, [])
  const save = async (scope: string, mailboxId: string | null) => {
    setBusy(true)
    try { await api("POST", "/api/app/mail/settings/sending", { mailboxId, dailyRecipients: limits[scope] ?? (mailboxId ? 500 : 5000) }); toast.success("Sending limit saved") }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  return <SettingsSection title="Sending limits" description="Recipient limits reset daily at midnight UTC. To and Cc count once per distinct address; zero disables sending.">
    <div className="flex flex-col gap-4">{[{ id: orgScope, address: "Whole organization", mailboxId: null }, ...mailboxes.map(b => ({ ...b, mailboxId: b.id }))].map(row => <div key={row.id || "organization"} className="flex items-end gap-2">
      <div className="flex flex-1 flex-col gap-1"><Label htmlFor={`limit-${row.id}`}>{row.address}</Label><Input id={`limit-${row.id}`} type="number" min={0} max={1000000} disabled={!ready || busy || !orgScope} value={limits[row.id] ?? (row.mailboxId ? 500 : 5000)} onChange={e => setLimits(l => ({ ...l, [row.id]: Number(e.target.value) }))} /></div>
      <Button variant="outline" disabled={!ready || busy || !orgScope} onClick={() => save(row.id, row.mailboxId)}>Save</Button>
    </div>)}</div>
  </SettingsSection>
}
