import * as React from "react"
import { Download, ShieldCheck } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { renderSVG } from "uqr"

import { authClient } from "@/lib/auth-client"
import { siteConfig } from "@/config/site"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { api } from "@/lib/api-client"
import { CopyButton, CopyField } from "@/components/app/copy-field"
import { SettingsSection } from "@/components/app/settings-section"

type Step =
  | { kind: "enable" | "disable" | "regenerate" | "replace" }
  | { kind: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "replace-scan"; totpURI: string; replacementId: string }
  | { kind: "codes"; backupCodes: string[] }

type AuthError = { code?: string; message?: string } | null

function errorText(error: NonNullable<AuthError>) {
  if (error.code === "SESSION_NOT_FRESH" || error.code === "SESSION_EXPIRED") return "For your security, sign out and back in, then try again."
  if (error.code === "INVALID_PASSWORD") return "Wrong password."
  return error.message ?? "Something went wrong"
}

export function TwoFactorPanel(props: { enabled: boolean; hasPassword: boolean }) {
  const [enabled, setEnabled] = React.useState(props.enabled)
  const [step, setStep] = React.useState<Step | null>(null)
  const close = () => setStep(null)

  return (
    <SettingsSection
      title="Two-factor authentication"
      description="Ask for a code from an authenticator app (1Password, Google Authenticator, Authy…) when you sign in with your password."
    >
      {!props.hasPassword ? (
        <p className="text-muted-foreground max-w-md text-sm">
          You sign in with Google. Manage two-step verification in your Google account; Work Inbox does not require a separate code for Google sign-in.
        </p>
      ) : enabled ? (
        <div className="grid max-w-md gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" />
            On
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setStep({ kind: "replace" })}>
              Change authenticator
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStep({ kind: "regenerate" })}>
              New backup codes
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setStep({ kind: "disable" })}>
              Turn off
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid max-w-md gap-3">
          <p className="text-muted-foreground text-sm">Off. Add another layer of protection to password sign-in.</p>
          <div>
            <Button size="sm" variant="outline" onClick={() => setStep({ kind: "enable" })}>
              Turn on 2FA
            </Button>
          </div>
        </div>
      )}

      <p className="text-muted-foreground mt-3 text-sm">
        <a className="underline underline-offset-4" href="/docs/two-factor-authentication" target="_blank" rel="noreferrer">Setup and recovery guide</a>. Google sign-in uses Google’s own security settings.
      </p>

      {step?.kind === "enable" ? (
        <PasswordDialog
          title="Turn on two-factor authentication"
          description="Confirm your password to start. Next you'll scan a QR code with your authenticator app."
          confirmLabel="Continue"
          onClose={close}
          onSubmit={async (password) => {
            const { data, error } = await authClient.twoFactor.enable({ password })
            if (error) return error
            if (data.method !== "totp") return { message: "Unexpected response, try again" }
            setStep({ kind: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes })
            return null
          }}
        />
      ) : null}

      {step?.kind === "scan" ? (
        <ScanDialog
          totpURI={step.totpURI}
          onClose={close}
          onVerify={async (code) => {
            const { error } = await authClient.twoFactor.verifyTotp({ code })
            return error
          }}
          onVerified={() => {
            setEnabled(true)
            setStep({ kind: "codes", backupCodes: step.backupCodes })
            toast.success("Two-factor authentication is on")
          }}
        />
      ) : null}

      {step?.kind === "regenerate" ? (
        <PasswordDialog
          title="Generate new backup codes"
          description="Your current backup codes stop working right away."
          confirmLabel="Generate codes"
          secondFactor
          onClose={close}
          onSubmit={async (password, headers) => {
            const { data, error } = await authClient.twoFactor.generateBackupCodes({ password }, { headers })
            if (error) return error
            setStep({ kind: "codes", backupCodes: data.backupCodes })
            return null
          }}
        />
      ) : null}

      {step?.kind === "disable" ? (
        <PasswordDialog
          title="Turn off two-factor authentication?"
          description="Signing in will only need your password. Your authenticator entry and backup codes stop working."
          confirmLabel="Turn off"
          destructive
          secondFactor
          onClose={close}
          onSubmit={async (password, headers) => {
            const { error } = await authClient.twoFactor.disable({ password }, { headers })
            if (error) return error
            setEnabled(false)
            close()
            toast.success("Two-factor authentication is off")
            return null
          }}
        />
      ) : null}

      {step?.kind === "replace" ? (
        <PasswordDialog title="Change authenticator" description="Confirm your password and an existing authenticator or backup code. Your current app keeps working until the new one is verified." confirmLabel="Continue" secondFactor onClose={close}
          onSubmit={async (password, headers) => {
            const res = await fetch("/api/app/account/two-factor", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action: "start", password }) })
            const data = await res.json() as { error?: string; totpURI: string; replacementId: string }
            if (!res.ok) return { message: data.error ?? "Could not start setup" }
            setStep({ kind: "replace-scan", totpURI: data.totpURI, replacementId: data.replacementId })
            return null
          }} />
      ) : null}
      {step?.kind === "replace-scan" ? (
        <ScanDialog totpURI={step.totpURI} replacing onClose={close}
          onVerify={async (code) => {
            await api("POST", "/api/app/account/two-factor", { action: "finish", replacementId: step.replacementId, code })
            return null
          }}
          onVerified={() => {
            close()
            toast.success("Authenticator changed. Other sessions were signed out. Your saved backup codes still work.")
          }} />
      ) : null}
      {step?.kind === "codes" ? <BackupCodesDialog codes={step.backupCodes} onClose={close} /> : null}
    </SettingsSection>
  )
}

function PasswordDialog(props: {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  secondFactor?: boolean
  onClose: () => void
  onSubmit: (password: string, headers: Record<string, string>) => Promise<AuthError>
}) {
  const [password, setPassword] = React.useState("")
  const [code, setCode] = React.useState("")
  const [backup, setBackup] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const err = await props.onSubmit(password, props.secondFactor ? { "x-work-inbox-2fa-code": code.replace(/\s/g, ""), "x-work-inbox-2fa-method": backup ? "backup" : "totp" } : {})
      if (err) setError(errorText(err))
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not connect. Try again.")
    } finally { setPending(false) }
  }

  return (
    <Dialog open onOpenChange={(open) => (open || pending ? null : props.onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogDescription>{props.description}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="2fa-password">Password</FieldLabel>
            <Input
              id="2fa-password"
              aria-invalid={!!error}
              disabled={pending}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </Field>
          {props.secondFactor ? <Field data-invalid={!!error}>
            <FieldLabel htmlFor="2fa-confirm-code">{backup ? "Backup code" : "Authenticator code"}</FieldLabel>
            <Input id="2fa-confirm-code" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" aria-invalid={!!error} required disabled={pending}
              {...(backup ? { maxLength: 64 } : { inputMode: "numeric" as const, pattern: "[0-9 ]{6,7}", maxLength: 7 })} />
            <Button type="button" variant="link" size="sm" disabled={pending} onClick={() => { setBackup(!backup); setCode(""); setError(null) }}>{backup ? "Use authenticator code" : "Use a backup code"}</Button>
          </Field> : null}
          {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={props.onClose}>
              Cancel
            </Button>
            <Button loading={pending} type="submit" variant={props.destructive ? "destructive" : "default"} disabled={pending || !password || (!!props.secondFactor && !code.trim())}>
              {props.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** QR code plus the raw secret for apps that can't scan; 2FA is only switched on once a code checks out. */
function ScanDialog({ totpURI, replacing, onClose, onVerify, onVerified }: { totpURI: string; replacing?: boolean; onClose: () => void; onVerify: (code: string) => Promise<AuthError>; onVerified: () => void }) {
  const [code, setCode] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const svg = React.useMemo(() => renderSVG(totpURI, { border: 2 }), [totpURI])
  const secret = React.useMemo(() => new URL(totpURI).searchParams.get("secret") ?? "", [totpURI])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const error = await onVerify(code.replace(/\s/g, ""))
      if (error) return setError(errorText(error))
      onVerified()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not connect. Try again.")
    } finally { setPending(false) }
  }

  return (
    <Dialog open onOpenChange={(open) => (open || pending ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Scan with your authenticator app</DialogTitle>
            <DialogDescription>{replacing ? "Scan with your new app, then enter its current 6-digit code. The old app stops working after confirmation. Setup expires in 10 minutes; your saved backup codes remain valid." : "Then enter the 6-digit code it shows to finish."}</DialogDescription>
          </DialogHeader>
          {/* Always dark-on-white: some scanners can't read an inverted code. */}
          <div className="mx-auto size-44 rounded-md bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} />
          <CopyField label="Can't scan? Enter this key" value={secret} />
          <FieldGroup><Field data-invalid={!!error}>
            <FieldLabel htmlFor="2fa-code">Code</FieldLabel>
            <Input
              id="2fa-code"
              aria-invalid={!!error}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              placeholder="123456"
              className="font-mono tracking-widest"
              required
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field></FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button loading={pending} type="submit" disabled={pending || code.replace(/\s/g, "").length !== 6}>
              {replacing ? "Change authenticator" : "Turn on"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BackupCodesDialog({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const text = codes.join("\n")
  const [saved, setSaved] = React.useState(false)

  function download() {
    const url = URL.createObjectURL(new Blob([`${siteConfig.name} backup codes\n\n${text}\n`], { type: "text/plain" }))
    const a = Object.assign(document.createElement("a"), { href: url, download: `${siteConfig.name.toLowerCase().replace(/\W+/g, "-")}-backup-codes.txt` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Save your backup codes</DialogTitle>
          <DialogDescription>
            If you lose your phone, each code signs you in once. Keep them in a password manager. They won't be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted relative rounded-md p-4">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <CopyButton value={text} className="absolute top-2 right-2" />
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={saved} onCheckedChange={v => setSaved(v === true)} />I saved these codes somewhere outside my Work Inbox account.</label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={download}>
            <Download />
            Download
          </Button>
          <Button type="button" disabled={!saved} onClick={onClose}>
            I've saved them
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
