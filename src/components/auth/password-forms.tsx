import * as React from "react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get("email"))
    setPending(true)
    // Same response whether or not the account exists.
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" })
    setPending(false)
    setSentTo(email)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{sentTo ? "Check your inbox" : "Reset your password"}</CardTitle>
        <CardDescription>
          {sentTo
            ? `If an account exists for ${sentTo}, we've sent a link to reset the password. It works for one hour.`
            : "Enter your email and we'll send you a link to choose a new password."}
        </CardDescription>
      </CardHeader>
      {sentTo ? (
        <CardFooter>
          <a href="/login" className="text-muted-foreground hover:text-foreground text-sm underline">
            Back to sign in
          </a>
        </CardFooter>
      ) : (
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-3">
            <Button loading={pending} type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
            <a href="/login" className="text-muted-foreground hover:text-foreground text-sm">
              Back to sign in
            </a>
          </CardFooter>
        </form>
      )}
    </Card>
  )
}

export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  if (invalid || !token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">This link has expired</CardTitle>
          <CardDescription>Reset links work for one hour and only once. Request a new one.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <a href="/forgot-password">Request a new link</a>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get("password"))
    if (password !== String(form.get("confirm"))) return setError("The passwords don't match.")
    setPending(true)
    setError(null)
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! })
    setPending(false)
    if (error) return setError(error.message ?? "Could not reset the password. Request a new link.")
    setDone(true)
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Password updated</CardTitle>
          <CardDescription>You've been signed out everywhere. Sign in with your new password.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <a href="/login">Sign in</a>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>At least 10 characters.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" minLength={10} autoComplete="new-password" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">Repeat password</Label>
            <Input id="confirm" name="confirm" type="password" minLength={10} autoComplete="new-password" required />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
        <CardFooter className="mt-6">
          <Button loading={pending} type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save new password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
