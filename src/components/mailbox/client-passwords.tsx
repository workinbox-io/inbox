import * as React from "react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldGroup, FieldError } from "@/components/ui/field"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { ConfirmButton } from "@/components/app/confirm-button"
import { CopyField } from "@/components/app/copy-field"
import { Badge } from "@/components/ui/badge"

interface Password { id: string; description: string }
interface Settings { host: string; port: number; username: string; passwords: Password[]; smtp?: {host:string;port:number;maxBytes:number} | null }

export function ClientPasswords({ connectionId, source = "external" }: { connectionId: string; source?: "external" | "hosted" }) {
  const endpoint = source === "hosted" ? `/api/app/mail/native/${encodeURIComponent(connectionId)}/client-passwords` : `/api/app/mail/external-accounts/${encodeURIComponent(connectionId)}/mail/client-passwords`
  const [open, setOpen] = React.useState(false)
  const [settings, setSettings] = React.useState<Settings | null>(null)
  const [secret, setSecret] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const mounted = React.useRef(true)
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function refresh() { const next = await api<Settings>("GET", endpoint); if (mounted.current) setSettings(next) }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("")
    try { await action() } catch (e) { if (mounted.current) setError((e as Error).message) }
    finally { if (mounted.current) setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={next => {
    if (busy) return
    setOpen(next); setSecret(""); setError("")
    if (next) void run(refresh)
  }}>
    <DialogTrigger asChild><Button variant="outline">IMAP clients</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Connect a mail client</DialogTitle><DialogDescription>{source === "hosted" ? "Use a separate password for each device. Read, star and move actions apply to the conversation in Workinbox. Manage folders in Workinbox; client drafts stay on the mail server." : "Create a separate password for each device. For outgoing mail, use your external provider’s SMTP server and credentials."}</DialogDescription></DialogHeader>
      {error && <FieldError>{error}</FieldError>}
      {settings && <div className="flex flex-col gap-4" aria-busy={busy}>
        <div className="flex flex-col gap-3"><Badge variant="secondary">IMAP · Port {settings.port} · SSL/TLS</Badge><CopyField label="Incoming server" value={settings.host} /><CopyField label="Username" value={settings.username} /></div>
        {source === "hosted" && (settings.smtp ? <div className="flex flex-col gap-3"><Badge variant="secondary">SMTP · Port {settings.smtp.port} · SSL/TLS</Badge><CopyField label="Outgoing server" value={settings.smtp.host} /><p className="text-muted-foreground text-sm">Use the same username and device password. Maximum message size: {settings.smtp.maxBytes / 1024 / 1024} MB. Workinbox sending limits apply.</p></div> : <p>Outgoing SMTP is unavailable for this domain. You can send from the Workinbox app.</p>)}
        {secret && <Field><FieldLabel htmlFor={`client-secret-${connectionId}`}>New password · shown only now</FieldLabel><Input id={`client-secret-${connectionId}`} value={secret} readOnly autoComplete="off" spellCheck={false} onFocus={event => event.currentTarget.select()} /><p>If you lose this password, revoke it and create a new one.</p></Field>}
        <form onSubmit={event => {
          event.preventDefault()
          const form = event.currentTarget, description = String(new FormData(form).get("description") ?? "").trim()
          void run(async () => {
            setSecret("")
            const created = await api<{ secret: string }>("POST", endpoint, { description })
            if (mounted.current) setSecret(created.secret)
            form.reset(); await refresh()
          })
        }}><FieldGroup><Field><FieldLabel htmlFor={`client-name-${connectionId}`}>Device name</FieldLabel><Input id={`client-name-${connectionId}`} name="description" placeholder="Thunderbird on my laptop" required maxLength={100} disabled={busy} /></Field><Button type="submit" disabled={busy || settings.passwords.length >= 20}>Create password</Button></FieldGroup></form>
        {settings.passwords.map(password => <div key={password.id} className="flex items-center justify-between gap-3"><span>{password.description}</span><ConfirmButton title="Revoke client password?" description="This device will lose access to the mailbox. Other connected devices will briefly reconnect." confirmLabel="Revoke" onConfirm={() => run(async () => {
          await api("DELETE", `${endpoint}/${encodeURIComponent(password.id)}`); setSecret(""); await refresh()
        })}><Button variant="outline" disabled={busy}>Revoke</Button></ConfirmButton></div>)}
      </div>}
    </DialogContent>
  </Dialog>
}
