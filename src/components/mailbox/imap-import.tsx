import * as React from "react"
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, LoaderCircle, Mail, RotateCcw, ShieldCheck, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldGroup, FieldDescription, FieldSet, FieldLegend } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { useSettingsDraft } from "@/components/settings/settings-draft"
import { notifySaved } from "@/components/settings/open-settings"
import { t } from "@/lib/i18n/panel"

interface ImportJob {
  id: string; mailboxId: string; host: string; username: string
  status: "queued" | "running" | "done" | "failed" | "cancelled"
  copied: number; skipped: number; error: string | null
}
const endpoint = "/api/app/mail/imap-imports"
const status = (s: ImportJob["status"]) => ({ queued: t("Waiting"), running: t("Importing"), done: t("Done"), failed: t("Stopped"), cancelled: t("Cancelled") })[s]

export function ImapImport({ mailboxes }: { mailboxes: { id: string; address: string }[] }) {
  const [data, setData] = React.useState<{ configured: boolean; imports: ImportJob[] } | null>(null)
  const [error, setError] = React.useState("")
  const [mailboxId, setMailboxId] = React.useState(mailboxes[0]?.id ?? "")
  const [busy, setBusy] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const requestId = React.useRef<string | null>(null)
  useSettingsDraft(dirty, busy)
  const refresh = React.useCallback(async () => {
    try { setData(await api("GET", endpoint)); setError("") }
    catch (error) { setError((error as Error).message) }
  }, [])
  React.useEffect(() => { void refresh() }, [refresh])
  const working = data?.imports.some(job => job.status === "queued" || job.status === "running")
  React.useEffect(() => {
    if (!working) return
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [working, refresh])

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    requestId.current ??= crypto.randomUUID()
    setBusy(true)
    try {
      await api("POST", endpoint, { id: requestId.current, mailboxId, imap: {
        host: String(fields.get("host")).trim(), port: 993,
        username: String(fields.get("username")).trim(), password: String(fields.get("password")),
      } })
      requestId.current = null
      form.reset(); setDirty(false)
      toast.success(t("Import queued. You can close this page."))
      notifySaved({ kind: "mail-imports" })
      await refresh()
    } catch (error) { toast.error((error as Error).message) }
    finally { setBusy(false) }
  }
  async function action(job: ImportJob, method: "POST" | "DELETE") {
    setBusy(true)
    try { await api(method, `${endpoint}/${job.id}`); notifySaved({ kind: "mail-imports" }); await refresh() }
    catch (error) { toast.error((error as Error).message) }
    finally { setBusy(false) }
  }

  return <div className="grid gap-6">
    <Card>
      <CardHeader>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-primary"><Mail className="size-5" aria-hidden="true" /><Badge variant="outline">IMAP</Badge><Badge variant="secondary" className="ml-auto">{t("One-time import")}</Badge></div>
        <CardTitle><h3>{t("Import from another mailbox")}</h3></CardTitle>
        <CardDescription>{t("Bring your mail to Workinbox. Connect once, and we’ll copy it in the background.")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
      {error && <p role="alert" className="text-destructive text-sm">{error} <Button variant="outline" size="sm" onClick={() => void refresh()}>{t("Try again")}</Button></p>}
      {!data && !error && <div aria-label={t("Loading import settings")} className="grid gap-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /></div>}
      {data && !data.configured && <p className="text-muted-foreground text-sm">{t("IMAP import is not configured on this server.")}</p>}
      {data?.configured && <form id="imap-import-form" onSubmit={start} onChange={() => { setDirty(true); requestId.current = null }}>
        <FieldGroup>
          <FieldSet disabled={busy}>
            <FieldLegend>{t("1. Connect your old mailbox")}</FieldLegend>
            <FieldGroup>
              <Field><FieldLabel htmlFor="imap-import-host">{t("Source IMAP server")}</FieldLabel><Input id="imap-import-host" name="host" placeholder="imap.example.com" maxLength={253} autoCapitalize="none" spellCheck={false} required /><FieldDescription>{t("Port 993 · SSL/TLS. Find this in your provider’s incoming mail settings.")}</FieldDescription></Field>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="imap-import-user">{t("Username")}</FieldLabel><Input id="imap-import-user" name="username" placeholder="you@example.com" maxLength={320} autoCapitalize="none" autoComplete="off" spellCheck={false} required /></Field>
                <Field><FieldLabel htmlFor="imap-import-password">{t("Password or app password")}</FieldLabel><Input id="imap-import-password" name="password" type="password" placeholder={t("Your mailbox password")} maxLength={4096} autoComplete="new-password" required /></Field>
              </FieldGroup>
              <FieldDescription>{t("Use an app password if your provider requires one. No SMTP settings needed.")}</FieldDescription>
            </FieldGroup>
          </FieldSet>
          <Separator />
          <FieldSet disabled={busy}>
            <FieldLegend>{t("2. Choose where it goes")}</FieldLegend>
            <Field><FieldLabel htmlFor="imap-import-mailbox">{t("Workinbox mailbox")}</FieldLabel>
            <Select value={mailboxId} onValueChange={value => { setMailboxId(value); setDirty(true); requestId.current = null }} disabled={busy}>
              <SelectTrigger id="imap-import-mailbox" className="w-full"><SelectValue placeholder={t("Choose a mailbox")} /></SelectTrigger>
              <SelectContent><SelectGroup>{mailboxes.map(box => <SelectItem key={box.id} value={box.id}>{box.address}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
              <FieldDescription>{t("Existing messages stay as they are. Duplicates won’t be added.")}</FieldDescription>
            </Field>
          </FieldSet>
          <details className="group text-sm">
            <summary className="text-muted-foreground flex cursor-pointer list-none items-center gap-2"><ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />{t("What gets imported?")}</summary>
            <p className="text-muted-foreground mt-3 leading-relaxed">{t("Dates, read status, stars and one folder per message are copied. Custom folders become labels. Drafts and messages over 25 MB are skipped; your Workinbox storage quota applies. Credentials are encrypted and removed on completion or cancellation. Failed imports retain them so you can resume; cancel to remove them.")}</p>
          </details>
        </FieldGroup>
      </form>}
      </CardContent>
      {data?.configured && <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground flex items-center gap-2 text-xs"><ShieldCheck className="size-4 shrink-0" aria-hidden="true" />{t("Your old mailbox stays untouched.")}</p>
        <Button type="submit" form="imap-import-form" disabled={busy || !mailboxId}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <ArrowDownToLine data-icon="inline-start" />}{busy ? t("Please wait…") : t("Start one-time import")}</Button>
      </CardFooter>}
    </Card>
    {data?.imports.length ? <Card>
      <CardHeader><CardTitle><h3>{t("Import activity")}</h3></CardTitle><CardDescription>{t("You can leave this page. Your import will keep running.")}</CardDescription></CardHeader>
      <CardContent><ul className="divide-border grid divide-y" aria-live="polite">{data.imports.map(job => <li key={job.id} className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 break-all font-medium">{job.username}</span>
          <Badge variant={job.status === "done" ? "success" : job.status === "failed" ? "danger" : job.status === "running" ? "info" : "secondary"}>{job.status === "running" && <LoaderCircle className="animate-spin" />}{job.status === "done" && <Check />}{status(job.status)}</Badge>
        </div>
        <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs"><span className="break-all">{job.host}</span><ArrowRight className="size-3 shrink-0" aria-hidden="true" /><span className="break-all">{mailboxes.find(box => box.id === job.mailboxId)?.address ?? t("Mailbox")}</span></span>
        <span>{t("{n} processed", { n: job.copied })} <span className="text-muted-foreground">· {t("includes messages already present")}{job.skipped ? ` · ${t("{n} skipped (over 25 MB or previously imported and deleted)", { n: job.skipped })}` : ""}</span></span>
        {job.error && <p role="alert" className="text-destructive">{job.error}</p>}
        <div className="flex flex-wrap gap-2">
          {job.status === "failed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void action(job, "POST")}><RotateCcw data-icon="inline-start" />{t("Resume import")}</Button>}
          {["queued", "running", "failed"].includes(job.status) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void action(job, "DELETE")}><X data-icon="inline-start" />{t("Cancel import")}</Button>}
        </div>
      </li>)}</ul></CardContent>
    </Card> : null}
  </div>
}
