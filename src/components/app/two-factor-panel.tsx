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
import { Label } from "@/components/ui/label"
import { CopyButton, CopyField } from "@/components/app/copy-field"
import { SettingsSection } from "@/components/app/settings-section"

type Step =
  | { kind: "enable" | "disable" | "regenerate" }
  | { kind: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "codes"; backupCodes: string[] }

type AuthError = { code?: string; message?: string } | null

function errorText(error: NonNullable<AuthError>) {
  if (error.code === "SESSION_NOT_FRESH") return "For your security, sign out and back in, then try again."
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
          You sign in with Google, so two-factor authentication is handled by your Google account.
        </p>
      ) : enabled ? (
        <div className="grid max-w-md gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-emerald-500" />
            On
          </p>
          <div className="flex flex-wrap gap-2">
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
          <p className="text-muted-foreground text-sm">Off. Anyone with your password can sign in.</p>
          <div>
            <Button size="sm" variant="outline" onClick={() => setStep({ kind: "enable" })}>
              Turn on 2FA
            </Button>
          </div>
        </div>
      )}

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
          onClose={close}
          onSubmit={async (password) => {
            const { data, error } = await authClient.twoFactor.generateBackupCodes({ password })
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
          onClose={close}
          onSubmit={async (password) => {
            const { error } = await authClient.twoFactor.disable({ password })
            if (error) return error
            setEnabled(false)
            close()
            toast.success("Two-factor authentication is off")
            return null
          }}
        />
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
  onClose: () => void
  onSubmit: (password: string) => Promise<AuthError>
}) {
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const err = await props.onSubmit(password)
    if (err) {
      setError(errorText(err))
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : props.onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogDescription>{props.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="2fa-password">Password</Label>
            <Input
              id="2fa-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={props.onClose}>
              Cancel
            </Button>
            <Button loading={pending} type="submit" variant={props.destructive ? "destructive" : "default"} disabled={pending || !password}>
              {props.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** QR code plus the raw secret for apps that can't scan; 2FA is only switched on once a code checks out. */
function ScanDialog({ totpURI, onClose, onVerified }: { totpURI: string; onClose: () => void; onVerified: () => void }) {
  const [code, setCode] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const svg = React.useMemo(() => renderSVG(totpURI, { border: 2 }), [totpURI])
  const secret = React.useMemo(() => new URL(totpURI).searchParams.get("secret") ?? "", [totpURI])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") })
    if (error) {
      setError(error.message ?? "That code didn't work")
      return setPending(false)
    }
    onVerified()
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Scan with your authenticator app</DialogTitle>
            <DialogDescription>Then enter the 6-digit code it shows to finish.</DialogDescription>
          </DialogHeader>
          {/* Always dark-on-white: some scanners can't read an inverted code. */}
          <div className="mx-auto size-44 rounded-md bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} />
          <CopyField label="Can't scan? Enter this key" value={secret} />
          <div className="grid gap-2">
            <Label htmlFor="2fa-code">Code</Label>
            <Input
              id="2fa-code"
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
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={pending} type="submit" disabled={pending || code.replace(/\s/g, "").length !== 6}>
              Turn on
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BackupCodesDialog({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const text = codes.join("\n")

  function download() {
    const url = URL.createObjectURL(new Blob([`${siteConfig.name} backup codes\n\n${text}\n`], { type: "text/plain" }))
    const a = Object.assign(document.createElement("a"), { href: url, download: `${siteConfig.name.toLowerCase().replace(/\W+/g, "-")}-backup-codes.txt` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={download}>
            <Download />
            Download
          </Button>
          <Button type="button" onClick={onClose}>
            I've saved them
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
