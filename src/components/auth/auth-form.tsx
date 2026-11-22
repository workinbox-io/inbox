import * as React from "react"
import { tapllEvent } from "@/lib/tapll"
import { t } from "@/lib/i18n/panel"
import { authErrorText } from "@/components/auth/auth-errors"

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
      {state === "sending" ? t("Sending…") : state === "sent" ? t("Sent. Check your inbox") : t("Resend the email")}
    </Button>
  )
}

export function CheckInbox({ email, callbackURL }: { email: string; callbackURL?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("Check your inbox")}</CardTitle>
        <CardDescription>
          {t("We sent a confirmation link to {email}. Click it to open your dashboard. The link works for 24 hours.", { email })}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-col gap-3">
        <ResendVerification email={email} callbackURL={callbackURL} />
        <p className="text-muted-foreground text-center text-xs">{t("Nothing after a few minutes? Check your spam folder.")}</p>
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
    try {
      const { data, error } = backup
        ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
        : await authClient.twoFactor.verifyTotp({ code, trustDevice })
      if (error) {
        // Expired challenges and exhausted attempts need a fresh password sign-in.
        if (error.code === "INVALID_TWO_FACTOR_COOKIE" || error.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE") return window.location.reload()
        return setError(authErrorText(error, t("That code didn't work")))
      }
      // Signing in to connect an AI app: Better Auth continues its authorization.
      window.location.assign(oauthRedirect(data) ?? next)
    } catch {
      setError(t("Could not connect. Check your connection and try again."))
    } finally { setPending(false) }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("Two-factor authentication")}</CardTitle>
        <CardDescription>
          {backup
            ? t("Enter one of the backup codes you saved when you turned on 2FA. Each code works once.")
            : t("Enter the 6-digit code from your authenticator app.")}
        </CardDescription>
      </CardHeader>
      <form method="post" onSubmit={onSubmit}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="code">{backup ? t("Backup code") : t("Code")}</Label>
            <Input
              key={backup ? "backup" : "totp"}
              id="code"
              name="code"
              autoComplete="one-time-code"
              autoFocus
              required
              className="font-mono tracking-widest"
              {...(backup
                ? { placeholder: t("xxxxx-xxxxx") }
                : { inputMode: "numeric" as const, pattern: "[0-9 ]{6,7}", maxLength: 7, placeholder: "123456" })}
            />
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <Checkbox name="trust" />
            {t("Trust this personal device for 30 days after each sign-in")}
          </label>
          {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button loading={pending} type="submit" className="w-full" disabled={pending}>
            {pending ? t("Checking…") : t("Verify")}
          </Button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-sm"
            disabled={pending}
            onClick={() => {
              setBackup(!backup)
              setError(null)
            }}
          >
            {backup ? t("Use your authenticator app") : t("Lost your device? Use a backup code")}
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
    if (signup) tapllEvent("signup_started")
    let result
    try {
      result = signup
        ? await authClient.signUp.email({ email, password, name: String(form.get("name")), callbackURL })
        : await authClient.signIn.email({ email, password, callbackURL })
    } catch {
      setPending(false)
      if (signup) tapllEvent("signup_failed", { reason: "network_error" })
      return setError(t("Something went wrong. Please try again."))
    }
    const { data, error } = result
    setPending(false)
    if (error) {
      if (signup) tapllEvent("signup_failed", { reason: "request_rejected" })
      if (error.code === "EMAIL_NOT_VERIFIED") return setUnverified(email)
      return setError(authErrorText(error))
    }
    // With verification on, sign-up returns no session: ask the user to check their inbox.
    if (signup) tapllEvent("signup_completed")
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
          {invited ? (signup ? t("Create your account") : t("Sign in to accept")) : signup ? t("Start your {n}-day trial", { n: TRIAL_DAYS }) : t("Welcome back")}
        </CardTitle>
        <CardDescription>
          {invited
            ? t("Then you'll join the team that invited you.")
            : signup
              ? t("No credit card required.")
              : t("Sign in to {name}.", { name: siteConfig.name })}
        </CardDescription>
      </CardHeader>
      <form method="post" onSubmit={onSubmit}>
        <CardContent className="grid gap-4">
          {signup ? (
            <div className="grid gap-2">
              <Label htmlFor="name">{t("person|Name")}</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="email">{t("Email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" defaultValue={prefill} required />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("Password")}</Label>
              {!signup ? (
                <a href="/forgot-password" className="text-muted-foreground hover:text-foreground text-xs">
                  {t("Forgot password?")}
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
                {t("At least 10 characters.")}
              </p>
            ) : null}
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {unverified ? (
            <div className="bg-muted/60 grid gap-3 rounded-md p-3 text-sm">
              <p>{t("Confirm your email first. We just sent a new link to {email}.", { email: unverified })}</p>
              <ResendVerification email={unverified} callbackURL={callbackURL} />
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button loading={pending} type="submit" className="w-full" disabled={pending}>
            {pending ? t("Please wait…") : signup ? t("Create account") : t("Sign in")}
          </Button>
          {signup ? (
            <p className="text-muted-foreground text-center text-xs">
              {t("By creating an account you agree to the")}{" "}
              <a className="text-foreground underline" href="/terms" target="_blank">
                {t("Terms")}
              </a>{" "}
              {t("and")}{" "}
              <a className="text-foreground underline" href="/privacy" target="_blank">
                {t("Privacy policy")}
              </a>
              .
            </p>
          ) : null}
          <p className="text-muted-foreground text-sm">
            {signup ? t("Already have an account?") : t("New here?")}{" "}
            <a
              className="text-foreground underline"
              href={`${signup ? "/login" : "/signup"}${invited ? `?next=${encodeURIComponent(next)}` : ""}`}
            >
              {signup ? t("Sign in") : t("Create an account")}
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
