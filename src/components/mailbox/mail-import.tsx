import * as React from "react"
import { Upload } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { emlToMbox } from "@/lib/mail/mbox"
import { useLiveData } from "@/lib/use-live-data"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SettingsSection } from "@/components/app/settings-section"
import { useSettingsDraft } from "@/components/settings/settings-draft"

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

const STATUS: Record<MailImport["status"], string> = {
  uploading: "Uploading",
  queued: "Waiting",
  running: "Importing",
  done: "Done",
  failed: "Failed",
}

/** What to upload: an .mbox as it is; .eml files joined into one mbox in the browser. */
async function asMbox(files: File[]): Promise<{ blob: Blob; name: string }> {
  if (files.length === 1 && !files[0]!.name.toLowerCase().endsWith(".eml")) return { blob: files[0]!, name: files[0]!.name }
  const parts: BlobPart[] = []
  for (const f of files) parts.push(emlToMbox(new Uint8Array(await f.arrayBuffer())))
  return { blob: new Blob(parts), name: files.length === 1 ? files[0]!.name : `${files.length} messages (.eml)` }
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
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Upload failed (${res.status})`)
        parts.push((await res.json()) as { partNumber: number; etag: string })
        setProgress(Math.min(1, (start + partBytes) / blob.size))
      }
      await api("POST", `/api/app/mail/imports/${id}`, { parts })
      toast.success("Uploaded. The import runs in the background.")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ""
      await refresh()
    }
  }

  return (
    <SettingsSection
      title="Import mail"
      description="Bring old mail into a mailbox. From Gmail: Google Takeout → Mail gives an .mbox file. From Zoho, Outlook or others: export the messages as .eml files and pick them all. Imported mail is marked read; Gmail's inbox stays in the inbox, the rest is archived."
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Into</Label>
            <Select value={mailboxId} onValueChange={setMailboxId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Choose a mailbox" />
              </SelectTrigger>
              <SelectContent>
                {mailboxes.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <input ref={input} type="file" accept=".mbox,.eml,application/mbox,message/rfc822" multiple hidden onChange={(e) => void upload([...(e.target.files ?? [])])} />
          <Button variant="outline" disabled={!mailboxId || progress !== null} onClick={() => input.current?.click()}>
            <Upload /> {progress === null ? "Choose files" : `Uploading ${Math.round(progress * 100)}%`}
          </Button>
        </div>
        {imports.length ? (
          <ul className="grid gap-2 text-sm">
            {imports.map((i) => (
              <li key={i.id} className="bg-surface grid gap-0.5 rounded-xl px-4 py-3">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {i.filename} <span className="text-muted-foreground font-normal">→ {i.mailbox}</span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {STATUS[i.status]}
                    {i.status === "running" && i.size ? ` ${Math.round((i.offset / i.size) * 100)}%` : ""}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {i.imported} imported{i.skipped ? `, ${i.skipped} skipped (already there, too large, spam or trash)` : ""}
                  {i.error ? ` · ${i.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SettingsSection>
  )
}
