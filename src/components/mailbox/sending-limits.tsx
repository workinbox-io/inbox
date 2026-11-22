import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/app/settings-section"
import { useSettingsDraft } from "@/components/settings/settings-draft"
import { appLocale, t } from "@/lib/i18n/panel"

interface SendingStatus {
  orgId: string
  limits: { scopeId: string; dailyRecipients: number }[]
  caps: { mailbox: number; organization: number; newUntil: number | null }
  reputation: { sent: number; bounced: number; complained: number; paused: "bounces" | "complaints" | null }
}

/** The org-wide limit (with the reputation notice) and the given mailboxes' limits; `organization={false}` shows only the mailboxes. */
export function SendingLimits({ mailboxes, organization = true }: { mailboxes: { id: string; address: string }[]; organization?: boolean }) {
  const [limits, setLimits] = React.useState<Record<string, number>>({})
  const [saved, setSaved] = React.useState<Record<string, number>>({})
  const [busy, setBusy] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const [orgScope, setOrgScope] = React.useState("")
  const [status, setStatus] = React.useState<Pick<SendingStatus, "caps" | "reputation"> | null>(null)
  useSettingsDraft(Object.keys(limits).some(scope => limits[scope] !== (saved[scope] ?? (scope === orgScope ? 5000 : 500))), busy)
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
    try { const value = limits[scope] ?? (mailboxId ? 500 : 5000); await api("POST", "/api/app/mail/settings/sending", { mailboxId, dailyRecipients: value }); setSaved(previous => ({ ...previous, [scope]: value })); toast.success(t("Sending limit saved")) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  return <SettingsSection title={t("Sending limits")} description={t("Recipient limits reset daily at midnight UTC. To and Cc count once per distinct address; zero disables sending.")}>
    {!organization ? null : status?.reputation.paused ? <p className="bg-destructive/10 text-destructive mb-4 rounded-lg px-3 py-2 text-sm">
      {status.reputation.paused === "bounces"
        ? t("Sending is paused: {n} bounced messages out of {sent} recipients in the last 7 days. It resumes on its own as they age out.", { n: status.reputation.bounced, sent: status.reputation.sent })
        : t("Sending is paused: {n} spam complaints out of {sent} recipients in the last 7 days. It resumes on its own as they age out.", { n: status.reputation.complained, sent: status.reputation.sent })}
    </p> : status?.caps.newUntil ? <p className="bg-muted text-muted-foreground mb-4 rounded-lg px-3 py-2 text-sm">
      {t("New organization: up to {mailbox} recipients a day per mailbox and {organization} for the organization until {date}, or right away on a paid plan.", { mailbox: status.caps.mailbox, organization: status.caps.organization, date: new Date(status.caps.newUntil).toLocaleDateString(appLocale()) })}
    </p> : null}
    <div className="flex flex-col gap-4">{[...(organization ? [{ id: orgScope, address: t("Whole organization"), mailboxId: null }] : []), ...mailboxes.map(b => ({ ...b, mailboxId: b.id as string | null }))].map(row => <div key={row.id || "organization"} className="flex items-end gap-2">
      <div className="flex flex-1 flex-col gap-1"><Label htmlFor={`limit-${row.id}`}>{row.address}</Label><Input id={`limit-${row.id}`} type="number" min={0} max={1000000} disabled={!ready || busy || !orgScope} value={limits[row.id] ?? (row.mailboxId ? 500 : 5000)} onChange={e => setLimits(l => ({ ...l, [row.id]: Number(e.target.value) }))} /></div>
      <Button variant="outline" disabled={!ready || busy || !orgScope} onClick={() => save(row.id, row.mailboxId)}>{t("Save")}</Button>
    </div>)}</div>
  </SettingsSection>
}
