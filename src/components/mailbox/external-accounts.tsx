import * as React from "react"
import { ArrowUpRight, Check, ChevronDown, Inbox, LoaderCircle, Plus, ShieldCheck } from "lucide-react"
import { ClientPasswords } from "./client-passwords"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend, FieldDescription, FieldError } from "@/components/ui/field"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/app/empty-state"
import { SettingsSection } from "@/components/app/settings-section"
import { ConfirmButton } from "@/components/app/confirm-button"
import { useSettingsDraft } from "@/components/settings/settings-draft"

interface Connection { clientAccess?: boolean; id: string; address: string; sync?: { state: "pending" | "syncing" | "ready" | "error" | "disconnected"; syncedAt: number | null; error: string | null } }
interface ConnectionSettings { address: string; readOnly?: boolean; imap: { host: string; username: string }; smtp: { host: string; username: string; port: number } }
const endpoint = "/api/app/mail/external-accounts"
const syncLabels = { pending: "Queued", syncing: "Synchronizing", ready: "Up to date", error: "Needs attention", disconnected: "Disconnected" }

export function ExternalAccounts() {
  const [connections, setConnections] = React.useState<Connection[]>([])
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [dirty, setDirty] = React.useState(false)
  useSettingsDraft(editing && dirty, busy)
  const draftId = React.useRef<string | null>(null)
  const recoveryIds = React.useRef(new Map<string, string>())
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
      form.reset(); setDirty(false); setEditing(false)
      draftId.current = null; setSettings(null)
      setNotice(saved.syncEnabled ? "Connection verified and saved. Synchronization queued." : "Connection verified and saved. Message synchronization is not enabled yet.")
      await refresh()
    })
  }

  return <SettingsSection title="External connections" description="Connect securely using IMAP and SMTP. Saved credentials are private to your account.">
    <div className="flex flex-col gap-4" aria-busy={busy || loading}>
      {error && <FieldError>{error}</FieldError>}
      {notice && <p role="status" className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{notice}</p>}
      {loading && <div role="status" className="flex flex-col gap-3"><span className="sr-only">Loading connections…</span><Skeleton className="h-32 w-full rounded-2xl" /></div>}
      {!loading && !error && connections.length === 0 && !editing && <EmptyState density="compact" icon={<Inbox />} title="Bring your other inboxes together" description="Connect an existing email account to read and send mail from Workinbox. You'll need your provider's IMAP and SMTP settings." />}
      {connections.map(connection => <Collapsible key={connection.id} asChild>
        <Card role="group" aria-label={connection.address} className="gap-4 py-5">
          <CardHeader className="gap-3 px-5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="min-w-0 break-all">{connection.address}</CardTitle>
              <Badge variant={connection.sync?.state === "error" ? "danger" : connection.sync?.state === "ready" ? "success" : "secondary"}>
                {connection.sync ? syncLabels[connection.sync.state] : "Connected"}
              </Badge>
            </div>
            <CardDescription role="status" className="break-words">
              {connection.sync ? connection.sync.state === "disconnected" ? "Your saved messages are available as a read-only copy." : connection.sync.state === "ready" ? `Last synchronized: ${connection.sync.syncedAt ? new Date(connection.sync.syncedAt).toLocaleString() : "—"}` : connection.sync.state === "error" ? connection.sync.error || "Synchronization failed. Manage this connection to reconnect or recover your mailbox." : connection.sync.state === "pending" ? "Waiting to synchronize your mailbox." : "Your messages are being synchronized." : "IMAP and SMTP credentials saved."}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-wrap justify-between gap-2 px-5">
            {connection.sync && <Button size="sm" variant="outline" asChild><a href={`/app/mail/external/${encodeURIComponent(connection.id)}`}>Open mail<ArrowUpRight data-icon="inline-end" /></a></Button>}
            <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="group ml-auto" aria-label={`Manage ${connection.address}`}>Manage<ChevronDown data-icon="inline-end" className="transition-transform group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger>
          </CardFooter>
          <CollapsibleContent>
            <CardContent className="flex flex-wrap gap-2 px-5">
              {connection.clientAccess && <ClientPasswords connectionId={connection.id} />}
              {connection.sync && connection.sync.state !== "disconnected" && <Button variant="outline" disabled={busy || connection.sync.state === "syncing"} onClick={() => void run(async () => {
                await api("POST", `${endpoint}/${connection.id}/sync`); setNotice("Synchronization queued."); await refresh()
              })}>Sync now</Button>}
              {connection.sync?.state === "error" && <ConfirmButton title="Start a fresh synchronized copy?" description="Your existing copy stays read-only so you can compare and export messages. A new copy will import the current contents of your provider. Unsynchronized local edits remain in the old copy. Device passwords for the old copy will be revoked; configure clients again for the new copy." confirmLabel="Start fresh copy" onConfirm={() => run(async () => {
                const newId = recoveryIds.current.get(connection.id) ?? crypto.randomUUID()
                recoveryIds.current.set(connection.id, newId)
                await api("POST", `${endpoint}/${connection.id}/recover`, { newId })
                await refresh(); setNotice("Recovery started. The original copy remains available read-only.")
              })}><Button variant="outline" disabled={busy}>Recover synchronization</Button></ConfirmButton>}
              <Button variant="outline" disabled={busy || connection.sync?.state === "disconnected"} onClick={() => void run(async () => {
                await api("POST", `${endpoint}/${connection.id}`)
                setNotice(`Connection to ${connection.address} verified.`)
              })}>Test connection</Button>
              <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
                const config = await api<ConnectionSettings>("GET", `${endpoint}/${connection.id}`)
                draftId.current = config.readOnly ? crypto.randomUUID() : connection.id; setSettings(config); setDirty(false); setEditing(true)
              })}>Reconnect</Button>
              {connection.sync?.state !== "disconnected" && <ConfirmButton title="Disconnect account?" description="Saved external credentials will be removed. Synchronized messages remain available as a read-only copy; mail on your server stays unchanged." confirmLabel="Disconnect" onConfirm={() => run(async () => {
                await api("DELETE", `${endpoint}/${connection.id}`); await refresh(); setNotice("Connection removed.")
              })}><Button variant="outline" disabled={busy}>Disconnect</Button></ConfirmButton>}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>)}
      {!editing ? <Button className="self-start" disabled={busy || loading} onClick={() => { draftId.current = crypto.randomUUID(); setSettings(null); setEditing(true) }}><Plus data-icon="inline-start" />Add connection</Button> :
        <Card>
          <CardHeader><CardTitle>{settings ? "Reconnect account" : "Connect an email account"}</CardTitle><CardDescription>Use the server settings from your email provider. Both servers are checked before saving.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={save} onChange={() => setDirty(true)} key={draftId.current}>
              <FieldGroup>
                <Field><FieldLabel htmlFor="external-address">Email address</FieldLabel><Input id="external-address" name="address" type="email" placeholder="you@example.com" maxLength={320} defaultValue={settings?.address} readOnly={!!settings} required disabled={busy} /></Field>
                {(["imap", "smtp"] as const).map(protocol => <FieldSet key={protocol} disabled={busy} className="rounded-xl border p-4">
                  <FieldLegend>{protocol === "imap" ? "Incoming mail · IMAP" : "Outgoing mail · SMTP"}</FieldLegend>
                  <FieldDescription>{protocol === "imap" ? "Secure connection on port 993 (SSL/TLS)." : "Use port 465 (SSL/TLS) or 587 (STARTTLS)."}</FieldDescription>
                  <FieldGroup>
                    <Field><FieldLabel htmlFor={`${protocol}-host`}>Server hostname</FieldLabel><Input id={`${protocol}-host`} name={`${protocol}Host`} placeholder={`${protocol}.example.com`} defaultValue={settings?.[protocol].host} readOnly={protocol === "imap" && !!settings} autoCapitalize="none" spellCheck={false} maxLength={253} required /></Field>
                    <Field><FieldLabel htmlFor={`${protocol}-user`}>Username</FieldLabel><Input id={`${protocol}-user`} name={`${protocol}User`} placeholder="you@example.com" defaultValue={settings?.[protocol].username} readOnly={protocol === "imap" && !!settings} autoCapitalize="none" autoComplete="off" maxLength={320} required /></Field>
                    <Field><FieldLabel htmlFor={`${protocol}-password`}>Password or app password</FieldLabel><Input id={`${protocol}-password`} name={`${protocol}Password`} type="password" autoComplete="new-password" maxLength={4096} required /><FieldDescription>If your provider requires an app password, use it here instead of your account password.</FieldDescription></Field>
                    {protocol === "smtp" && <Field><FieldLabel htmlFor="smtp-port">Port (465 or 587)</FieldLabel><Input id="smtp-port" name="smtpPort" inputMode="numeric" pattern="465|587" defaultValue={settings?.smtp.port ?? 465} required /></Field>}
                  </FieldGroup>
                </FieldSet>)}
                <p className="text-muted-foreground flex items-start gap-2 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Saved credentials are private to your account.</p>
                <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>{busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{busy ? "Checking servers…" : "Verify and save"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>}
    </div>
  </SettingsSection>
}
