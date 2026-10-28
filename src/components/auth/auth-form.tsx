import * as React from "react"

import { authClient, oauthRedirect } from "@/lib/auth-client"
import { siteConfig } from "@/config/site"
import { TRIAL_DAYS } from "@/config/plans"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AuthFormProps {
  mode: "login" | "signup"
  next?: string
  /** Prefilled address, e.g. from an invitation link. */
  email?: string
}

/** Invitation links must survive e-mail verification, so they become the verification callback. */
const callbackFor = (next: string) => (next.startsWith("/invite/") ? next : "/verified")

/** Resend button with a short cooldown, used after sign-up and for unverified logins. */
export function ResendVerification({ email, callbackURL = "/verified" }: { email: string; callbackURL?: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  async function resend() {
    setState("sending")
    await authClient.sendVerificationEmail({ email, callbackURL })
    setState("sent")
    setTimeout(() => setState("idle"), 30_000)
  }
  return (
    <Button loading={state === "sending"} type="button" variant="outline" className="w-full" disabled={state !== "idle"} onClick={() => void resend()}>
      {state === "sending" ? "Sending…" : state === "sent" ? "Sent. Check your inbox" : "Resend the email"}
    </Button>
  )
}

export function CheckInbox({ email, callbackURL }: { email: string; callbackURL?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Check your inbox</CardTitle>
        <CardDescription>
          We sent a confirmation link to <span className="text-foreground font-medium">{email}</span>. Click it to open
          your dashboard. The link works for 24 hours.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-col gap-3">
        <ResendVerification email={email} callbackURL={callbackURL} />
        <p className="text-muted-foreground text-center text-xs">Nothing after a few minutes? Check your spam folder.</p>
      </CardFooter>
    </Card>
  )
}

/** Second sign-in step for accounts with 2FA: authenticator code, or a backup code as a fallback. */
export function TwoFactorChallenge({ next }: { next: string }) {
  const [backup, setBackup] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const code = String(form.get("code")).replace(/\s/g, "")
    const trustDevice = form.get("trust") === "on"
    setPending(true)
    setError(null)
    const { data, error } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice })
    if (error) {
      setPending(false)
      // The pending sign-in lives for 10 minutes; after that, start over.
      if (error.code === "INVALID_TWO_FACTOR_COOKIE") return window.location.reload()
      return setError(error.message ?? "That code didn't work")
    }
    // Signing in to connect an AI app: Better Auth continues its authorization.
    window.location.assign(oauthRedirect(data) ?? next)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Two-factor authentication</CardTitle>
        <CardDescription>
          {backup
            ? "Enter one of the backup codes you saved when you turned on 2FA. Each code works once."
            : "Enter the 6-digit code from your authenticator app."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="code">{backup ? "Backup code" : "Code"}</Label>
            <Input
              key={backup ? "backup" : "totp"}
              id="code"
              name="code"
              autoComplete="one-time-code"
              autoFocus
              required
              className="font-mono tracking-widest"
              {...(backup
                ? { placeholder: "xxxxx-xxxxx" }
                : { inputMode: "numeric" as const, pattern: "[0-9 ]{6,7}", maxLength: 7, placeholder: "123456" })}
            />
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <Checkbox name="trust" />
            Trust this device for 30 days
          </label>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button loading={pending} type="submit" className="w-full" disabled={pending}>
            {pending ? "Checking…" : "Verify"}
          </Button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-sm"
            onClick={() => {
              setBackup(!backup)
              setError(null)
            }}
          >
            {backup ? "Use your authenticator app" : "Lost your device? Use a backup code"}
          </button>
        </CardFooter>
      </form>
    </Card>
  )
}

export function AuthForm({ mode, next = "/app", email: prefill }: AuthFormProps) {
  const [error, setError] = React.useState<string | null>(null)
  const [unverified, setUnverified] = React.useState<string | null>(null)
  const [signedUp, setSignedUp] = React.useState<string | null>(null)
  const [twoFactor, setTwoFactor] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const signup = mode === "signup"
  const invited = next.startsWith("/invite/")
  const callbackURL = callbackFor(next)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get("email"))
    const password = String(form.get("password"))
    setPending(true)
    setError(null)
    setUnverified(null)
    const { data, error } = signup
      ? await authClient.signUp.email({ email, password, name: String(form.get("name")), callbackURL })
      : await authClient.signIn.email({ email, password, callbackURL })
    setPending(false)
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") return setUnverified(email)
      return setError(error.message ?? "Something went wrong")
    }
    // With verification on, sign-up returns no session: ask the user to check their inbox.
    if (signup && !data?.token) return setSignedUp(email)
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return setTwoFactor(true)
    window.location.assign(oauthRedirect(data) ?? next)
  }

  if (signedUp) return <CheckInbox email={signedUp} callbackURL={callbackURL} />
  if (twoFactor) return <TwoFactorChallenge next={next} />

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">
          {invited ? (signup ? "Create your account" : "Sign in to accept") : signup ? `Start your ${TRIAL_DAYS}-day trial` : "Welcome back"}
        </CardTitle>
        <CardDescription>
          {invited
            ? "Then you'll join the team that invited you."
            : signup
              ? "No credit card required."
              : `Sign in to ${siteConfig.name}.`}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="grid gap-4">
          {signup ? (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" defaultValue={prefill} required />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {!signup ? (
                <a href="/forgot-password" className="text-muted-foreground hover:text-foreground text-xs">
                  Forgot password?
                </a>
              ) : null}
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={10}
              autoComplete={signup ? "new-password" : "current-password"}
              aria-describedby={signup ? "password-hint" : undefined}
              required
            />
            {signup ? (
              <p id="password-hint" className="text-muted-foreground text-xs">
                At least 10 characters.
              </p>
            ) : null}
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {unverified ? (
            <div className="bg-muted/60 grid gap-3 rounded-md p-3 text-sm">
              <p>Confirm your email first. We just sent a new link to {unverified}.</p>
              <ResendVerification email={unverified} callbackURL={callbackURL} />
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button loading={pending} type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : signup ? "Create account" : "Sign in"}
          </Button>
          {signup ? (
            <p className="text-muted-foreground text-center text-xs">
              By creating an account you agree to the{" "}
              <a className="text-foreground underline" href="/terms" target="_blank">
                Terms
              </a>{" "}
              and{" "}
              <a className="text-foreground underline" href="/privacy" target="_blank">
                Privacy policy
              </a>
              .
            </p>
          ) : null}
          <p className="text-muted-foreground text-sm">
            {signup ? "Already have an account? " : "New here? "}
            <a
              className="text-foreground underline"
              href={`${signup ? "/login" : "/signup"}${invited ? `?next=${encodeURIComponent(next)}` : ""}`}
            >
              {signup ? "Sign in" : "Create an account"}
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
