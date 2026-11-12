import * as React from "react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend, FieldError } from "@/components/ui/field"
import { SettingsSection } from "@/components/app/settings-section"
import { ConfirmButton } from "@/components/app/confirm-button"

interface Connection { id: string; address: string; sync?: { state: "pending" | "syncing" | "ready" | "error" | "disconnected"; syncedAt: number | null; error: string | null } }
interface ConnectionSettings { address: string; readOnly?: boolean; imap: { host: string; username: string }; smtp: { host: string; username: string; port: number } }
const endpoint = "/api/app/mail/external-accounts"

export function ExternalAccounts() {
  const [connections, setConnections] = React.useState<Connection[]>([])
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const draftId = React.useRef<string | null>(null)
  const [settings, setSettings] = React.useState<ConnectionSettings | null>(null)
  const refresh = React.useCallback(async () => setConnections(await api<Connection[]>("GET", endpoint)), [])
  React.useEffect(() => { void refresh().catch(e => setError((e as Error).message)).finally(() => setLoading(false)) }, [refresh])
  React.useEffect(() => {
    if (busy) return
    const timer = window.setInterval(() => { void refresh().catch(e => setError((e as Error).message)) }, 15000)
    return () => window.clearInterval(timer)
  }, [busy, refresh])

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("")
    try { await action() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const value = (key: string) => String(fields.get(key) ?? "")
    await run(async () => {
      draftId.current ??= crypto.randomUUID()
      const saved = await api<{ syncEnabled?: boolean }>("PUT", `${endpoint}/${draftId.current}`, {
        address: value("address").trim().toLowerCase(),
        imap: { host: value("imapHost").trim(), port: 993, username: value("imapUser"), password: value("imapPassword") },
        smtp: { host: value("smtpHost").trim(), port: Number(value("smtpPort")), username: value("smtpUser"), password: value("smtpPassword") },
      })
      form.reset(); setEditing(false)
      draftId.current = null; setSettings(null)
      setNotice(saved.syncEnabled ? "Connection verified and saved. Synchronization queued." : "Connection verified and saved. Message synchronization is not enabled yet.")
      await refresh()
    })
  }

  return <SettingsSection title="External connections" description="Connect securely using IMAP and SMTP. Saved credentials are private to your account.">
    <div className="flex flex-col gap-4" aria-busy={busy || loading}>
      {error && <FieldError>{error}</FieldError>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p role="status">Loading connections…</p> : connections.length === 0 && <p>No external connections.</p>}
      {connections.map(connection => <div key={connection.id} className="flex flex-wrap items-center gap-3">
        <span>{connection.address}</span>
        {connection.sync && <Button variant="outline" asChild><a href={`/app/mail/external/${encodeURIComponent(connection.id)}`}>Open mail</a></Button>}
        {connection.sync && <span role="status">{connection.sync.state === "disconnected" ? "Disconnected · Read-only copy" : connection.sync.state === "ready" ? `Last synchronized: ${connection.sync.syncedAt ? new Date(connection.sync.syncedAt).toLocaleString() : "—"}` : connection.sync.state === "error" ? connection.sync.error : "Synchronizing…"}</span>}
        {connection.sync && connection.sync.state !== "disconnected" && <Button variant="outline" disabled={busy || connection.sync.state === "syncing"} onClick={() => void run(async () => {
          await api("POST", `${endpoint}/${connection.id}/sync`); setNotice("Synchronization queued."); await refresh()
        })}>Sync now</Button>}
        <Button variant="outline" disabled={busy || connection.sync?.state === "disconnected"} onClick={() => void run(async () => {
          await api("POST", `${endpoint}/${connection.id}`)
          setNotice(`Connection to ${connection.address} verified.`)
        })}>Test connection</Button>
        <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
          const config = await api<ConnectionSettings>("GET", `${endpoint}/${connection.id}`)
          draftId.current = config.readOnly ? crypto.randomUUID() : connection.id; setSettings(config); setEditing(true)
        })}>Reconnect</Button>
        {connection.sync?.state !== "disconnected" && <ConfirmButton title="Disconnect account?" description="Saved external credentials will be removed. Synchronized messages remain available as a read-only copy; mail on your server stays unchanged." confirmLabel="Disconnect" onConfirm={() => run(async () => {
          await api("DELETE", `${endpoint}/${connection.id}`); await refresh(); setNotice("Connection removed.")
        })}><Button variant="outline" disabled={busy}>Disconnect</Button></ConfirmButton>}
      </div>)}
      {!editing ? <Button variant="outline" disabled={busy || loading} onClick={() => { draftId.current = crypto.randomUUID(); setSettings(null); setEditing(true) }}>Add connection</Button> :
        <form onSubmit={save} key={draftId.current}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="external-address">Email address</FieldLabel><Input id="external-address" name="address" type="email" maxLength={320} defaultValue={settings?.address} readOnly={!!settings} required disabled={busy} /></Field>
            {(["imap", "smtp"] as const).map(protocol => <FieldSet key={protocol} disabled={busy}>
              <FieldLegend>{protocol.toUpperCase()}</FieldLegend>
              <FieldGroup>
                <Field><FieldLabel htmlFor={`${protocol}-host`}>Server hostname</FieldLabel><Input id={`${protocol}-host`} name={`${protocol}Host`} defaultValue={settings?.[protocol].host} readOnly={protocol === "imap" && !!settings} autoCapitalize="none" spellCheck={false} maxLength={253} required /></Field>
                <Field><FieldLabel htmlFor={`${protocol}-user`}>Username</FieldLabel><Input id={`${protocol}-user`} name={`${protocol}User`} defaultValue={settings?.[protocol].username} readOnly={protocol === "imap" && !!settings} autoCapitalize="none" autoComplete="off" maxLength={320} required /></Field>
                <Field><FieldLabel htmlFor={`${protocol}-password`}>Password or app password</FieldLabel><Input id={`${protocol}-password`} name={`${protocol}Password`} type="password" autoComplete="new-password" maxLength={4096} required /></Field>
                {protocol === "smtp" && <Field><FieldLabel htmlFor="smtp-port">Port (465 or 587)</FieldLabel><Input id="smtp-port" name="smtpPort" inputMode="numeric" pattern="465|587" defaultValue={settings?.smtp.port ?? 465} required /></Field>}
              </FieldGroup>
            </FieldSet>)}
            <div className="flex gap-3"><Button type="submit" disabled={busy}>{busy ? "Checking servers…" : "Verify and save"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div>
          </FieldGroup>
        </form>}
    </div>
  </SettingsSection>
}
