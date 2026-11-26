import * as React from "react"
import { FileArchive, Upload } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { emlToMbox } from "@/lib/mail/mbox"
import { useLiveData } from "@/lib/use-live-data"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useSettingsDraft } from "@/components/settings/settings-draft"
import { ImapImport } from "./imap-import"
import { t } from "@/lib/i18n/panel"

interface MailImport {
  id: string
  mailbox: string
  filename: string
  size: number
  offset: number
  status: "uploading" | "queued" | "running" | "done" | "failed"
  imported: number
  skipped: number
  error: string | null
}

const status = (s: MailImport["status"]) => ({ uploading: t("Uploading"), queued: t("Waiting"), running: t("Importing"), done: t("Done"), failed: t("Failed") })[s]

/** What to upload: an .mbox as it is; .eml files joined into one mbox in the browser. */
async function asMbox(files: File[]): Promise<{ blob: Blob; name: string }> {
  if (files.length === 1 && !files[0]!.name.toLowerCase().endsWith(".eml")) return { blob: files[0]!, name: files[0]!.name }
  const parts: BlobPart[] = []
  for (const f of files) parts.push(emlToMbox(new Uint8Array(await f.arrayBuffer())))
  return { blob: new Blob(parts), name: files.length === 1 ? files[0]!.name : t("{n} messages (.eml)", { n: files.length }) }
}

/** Settings → Mail → Import mail (owners and admins): old mail from Gmail (Takeout .mbox) or .eml files. */
export function MailImport({ mailboxes }: { mailboxes: { id: string; address: string }[] }) {
  const [imports, refresh] = useLiveData<MailImport[]>("/api/app/mail/imports", [])
  const [mailboxId, setMailboxId] = React.useState(mailboxes[0]?.id ?? "")
  const [progress, setProgress] = React.useState<number | null>(null)
  useSettingsDraft(false, progress !== null)
  const input = React.useRef<HTMLInputElement>(null)
  const working = imports.some((i) => i.status === "queued" || i.status === "running")

  React.useEffect(() => {
    void refresh()
  }, [refresh])
  React.useEffect(() => {
    if (!working) return
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [working, refresh])

  const upload = async (files: File[]) => {
    if (!files.length || !mailboxId) return
    setProgress(0)
    try {
      const { blob, name } = await asMbox(files)
      const { id, partBytes } = await api<{ id: string; partBytes: number }>("POST", "/api/app/mail/imports", { mailboxId, filename: name, size: blob.size })
      const parts: { partNumber: number; etag: string }[] = []
      for (let n = 1, start = 0; start < blob.size; n++, start += partBytes) {
        const res = await fetch(`/api/app/mail/imports/${id}?part=${n}`, { method: "PUT", body: blob.slice(start, start + partBytes) })
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? t("Upload failed ({status})", { status: res.status }))
        parts.push((await res.json()) as { partNumber: number; etag: string })
        setProgress(Math.min(1, (start + partBytes) / blob.size))
      }
      await api("POST", `/api/app/mail/imports/${id}`, { parts })
      toast.success(t("Uploaded. The import runs in the background."))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ""
      await refresh()
    }
  }

  return (
    <div className="grid gap-6">
    <ImapImport mailboxes={mailboxes} />
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-2 text-muted-foreground"><FileArchive className="size-5" aria-hidden="true" /><Badge variant="outline">.mbox / .eml</Badge></div>
        <CardTitle><h3>{t("Import from files")}</h3></CardTitle>
        <CardDescription>{t("Already have an export? Upload an .mbox archive or a batch of .eml messages.")}</CardDescription>
      </CardHeader>
      <CardContent>
      <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="file-import-mailbox">{t("Workinbox mailbox")}</FieldLabel>
            <Select value={mailboxId} onValueChange={setMailboxId} disabled={progress !== null}>
              <SelectTrigger id="file-import-mailbox" className="w-full">
                <SelectValue placeholder={t("Choose a mailbox")} />
              </SelectTrigger>
              <SelectContent><SelectGroup>
                {mailboxes.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.address}
                  </SelectItem>
                ))}
              </SelectGroup></SelectContent>
            </Select>
            <FieldDescription>{t("For Gmail, export Mail with Google Takeout. For other providers, choose an .mbox or .eml export.")}</FieldDescription>
          </Field>
          <input ref={input} type="file" accept=".mbox,.eml,application/mbox,message/rfc822" multiple hidden onChange={(e) => void upload([...(e.target.files ?? [])])} />
          {progress !== null && <div className="grid gap-2" role="status"><span className="text-muted-foreground text-sm">{t("Uploading {percent}%", { percent: Math.round(progress * 100) })}</span><Progress value={progress * 100} aria-label={t("File upload progress")} /></div>}
        {imports.length ? (
          <ul className="grid gap-2 text-sm">
            {imports.map((i) => (
              <li key={i.id} className="bg-background grid gap-2 rounded-xl px-4 py-3">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {i.filename} <span className="text-muted-foreground font-normal">→ {i.mailbox}</span>
                  </span>
                  <Badge variant={i.status === "done" ? "success" : i.status === "failed" ? "danger" : "secondary"}>
                    {status(i.status)}
                    {i.status === "running" && i.size ? ` ${Math.round((i.offset / i.size) * 100)}%` : ""}
                  </Badge>
                </span>
                {i.status === "running" && i.size > 0 && <Progress value={(i.offset / i.size) * 100} aria-label={t("Import progress for {name}", { name: i.filename })} />}
                <span className="text-muted-foreground text-xs">
                  {t("{n} imported", { n: i.imported })}{i.skipped ? `, ${t("{n} skipped (already there, too large, spam or trash)", { n: i.skipped })}` : ""}
                  {i.error ? ` · ${i.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">{t("Imported mail is marked read. Gmail’s inbox is preserved; other mail is archived.")}</p>
        <Button variant="outline" disabled={!mailboxId || progress !== null} onClick={() => input.current?.click()}>
          <Upload data-icon="inline-start" /> {progress === null ? t("Choose files") : t("Uploading…")}
        </Button>
      </CardFooter>
    </Card>
    </div>
  )
}
