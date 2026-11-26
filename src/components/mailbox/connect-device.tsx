import * as React from "react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel, FieldGroup, FieldError } from "@/components/ui/field"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { CopyField } from "@/components/app/copy-field"
import { t } from "@/lib/i18n/panel"

export interface NativeMailbox { id: string; address: string; connection: null | { active: number; initialized: number; error: string | null } }
interface Account { address: string; username: string; password: string; host: string; imapPort: number; smtp: { host: string; port: number } | null }

const ENDPOINT = "/api/app/mail/native/device"
const isApple = () => typeof navigator !== "undefined" && /iPhone|iPad|Macintosh/.test(navigator.userAgent)
function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Macintosh/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : t("My computer")
}

/** Safari installs a profile only from a real form submission (a blob download lands in Files on iPhone). */
function submitProfile(payload: unknown) {
  const form = document.createElement("form")
  form.method = "post"; form.action = ENDPOINT; form.style.display = "none"
  const input = document.createElement("input")
  input.type = "hidden"; input.name = "payload"; input.value = JSON.stringify(payload)
  form.appendChild(input); document.body.appendChild(form); form.submit(); form.remove()
}

/** One flow for a new device: pick mailboxes, enable the ones that aren't yet, then install a profile or show the passwords. */
export function ConnectDevice({ boxes, configured, refresh }: { boxes: NativeMailbox[]; configured: boolean; refresh: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [step, setStep] = React.useState<"choose" | "preparing" | "ready" | "done">("choose")
  const [accounts, setAccounts] = React.useState<Account[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const chosen = boxes.filter((box) => selected.has(box.id))
  const ready = chosen.length > 0 && chosen.every((box) => box.connection?.active && box.connection.initialized)

  React.useEffect(() => {
    if (step !== "preparing") return
    if (ready) { setStep("ready"); return }
    const timer = setInterval(() => void refresh().catch(() => {}), 3000)
    return () => clearInterval(timer)
  }, [step, ready, refresh])

  function reset(next: boolean) {
    if (busy) return
    setOpen(next); setError(""); setAccounts(null)
    if (next) { setName(deviceName()); setSelected(new Set(boxes.map((box) => box.id))); setStep("choose") }
  }
  async function connect() {
    setBusy(true); setError("")
    try {
      for (const box of chosen) if (!box.connection?.active) await api("POST", `/api/app/mail/native/${box.id}`)
      await refresh(); setStep("preparing")
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const payload = (format: "json" | "mobileconfig") => ({ description: name.trim(), mailboxIds: chosen.map((box) => box.id), format })
  async function showPasswords() {
    setBusy(true); setError("")
    try { setAccounts((await api<{ accounts: Account[] }>("POST", ENDPOINT, payload("json"))).accounts); setStep("done") }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function installProfile() { submitProfile(payload("mobileconfig")); setStep("done") }

  return <Dialog open={open} onOpenChange={reset}>
    <DialogTrigger asChild><Button disabled={!configured || boxes.length === 0}>{t("Connect device")}</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("Connect a device")}</DialogTitle>
        <DialogDescription>{t("Add your mailboxes to Apple Mail, Outlook, Thunderbird or a phone. Each mailbox gets its own password for this device.")}</DialogDescription>
      </DialogHeader>
      {error && <FieldError>{error}</FieldError>}
      {step === "choose" && <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void connect() }}>
        <FieldGroup>
          <Field><FieldLabel htmlFor="device-name">{t("Device name")}</FieldLabel><Input id="device-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} disabled={busy} /></Field>
          <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-sm font-medium">{t("Mailboxes")}</legend>
            {boxes.map((box) => <label key={box.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={selected.has(box.id)} disabled={busy} onCheckedChange={(on) => setSelected((prev) => { const next = new Set(prev); if (on) next.add(box.id); else next.delete(box.id); return next })} />
              <span className="break-all">{box.address}</span>
            </label>)}
          </fieldset>
        </FieldGroup>
        <Button type="submit" disabled={busy || chosen.length === 0 || !name.trim()}>{t("Continue")}</Button>
      </form>}
      {step === "preparing" && <div role="status" className="flex flex-col gap-2 text-sm">
        <p>{t("Preparing your existing messages for mail apps…")}</p>
        <ul className="text-muted-foreground flex flex-col gap-1">{chosen.map((box) => <li key={box.id} className="break-all">{box.connection?.initialized ? "✓" : "…"} {box.address}</li>)}</ul>
        <p className="text-muted-foreground">{t("A large mailbox can take a while. You can close this window and come back later.")}</p>
      </div>}
      {step === "ready" && <div className="flex flex-col gap-3">
        {isApple()
          ? <><Button onClick={installProfile} disabled={busy}>{t("Install on this device")}</Button><Button variant="outline" onClick={() => void showPasswords()} disabled={busy}>{t("Show passwords instead")}</Button></>
          : <><Button onClick={() => void showPasswords()} disabled={busy}>{t("Show settings and passwords")}</Button><Button variant="outline" onClick={installProfile} disabled={busy}>{t("Download profile for Apple devices")}</Button></>}
        <p className="text-muted-foreground text-sm">{t("Passwords are shown only once. Each click creates new ones.")}</p>
      </div>}
      {step === "done" && !accounts && <p className="text-sm">{t("Open the downloaded profile to add the accounts. On a Mac: System Settings → Profiles. On iPhone: Settings → Profile Downloaded.")}</p>}
      {step === "done" && accounts && <div className="flex flex-col gap-5">
        <p className="text-muted-foreground text-sm">{t("Most apps find the servers on their own from your e-mail address. Otherwise use IMAP {imap}, port {imapPort}, and SMTP {smtp}, port {smtpPort}, both with SSL/TLS.", { imap: accounts[0]!.host, imapPort: accounts[0]!.imapPort, smtp: accounts[0]!.smtp?.host ?? accounts[0]!.host, smtpPort: accounts[0]!.smtp?.port ?? 465 })}</p>
        {accounts.map((a) => <div key={a.address} className="flex flex-col gap-2">
          <CopyField label={t("Username")} value={a.username} />
          <CopyField label={t("Password · shown only now")} value={a.password} />
        </div>)}
      </div>}
    </DialogContent>
  </Dialog>
}
