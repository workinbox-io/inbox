import * as React from "react"
import { authClient } from "@/lib/auth-client"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

export function RequiredPasswordChange() {
 const [error, setError] = React.useState("")
 const [pending, setPending] = React.useState(false)
 return <Card className="w-full max-w-sm">
  <CardHeader><CardTitle>Choose your own password</CardTitle><CardDescription>Replace the temporary password before opening your mailbox.</CardDescription></CardHeader>
  <CardContent><form className="flex flex-col gap-4" onSubmit={async e => {
   e.preventDefault()
   const form = new FormData(e.currentTarget)
   setPending(true)
   try {
    const currentPassword = String(form.get("current"))
    const newPassword = String(form.get("next"))
    if (currentPassword === newPassword) throw new Error("Choose a different password")
    if (newPassword !== String(form.get("confirm"))) throw new Error("Passwords do not match")
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
    if (error) throw new Error(error.message ?? "Could not change password")
    window.location.assign("/app/mail")
   } catch (e) { setError((e as Error).message); setPending(false) }
  }}>
   <Label htmlFor="required-current">Temporary password</Label><Input id="required-current" name="current" type="password" autoComplete="current-password" required />
   <Label htmlFor="required-next">New password</Label><Input id="required-next" name="next" type="password" autoComplete="new-password" minLength={10} required />
   <Label htmlFor="required-confirm">Confirm password</Label><Input id="required-confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
   {error && <p role="alert">{error}</p>}
   <Button disabled={pending} type="submit">{pending ? "Saving…" : "Change password"}</Button>
  </form></CardContent>
 </Card>
}

export function RecoveryEmailSettings() {
 const [state, setState] = React.useState<{ email: string | null; pending: string | null }>({ email: null, pending: null })
 const [pending, setPending] = React.useState(false)
 const refresh = () => api<typeof state>("GET", "/api/app/account/recovery").then(setState)
 React.useEffect(() => { void refresh().catch(e => toast.error(e.message)) }, [])
 return <form className="flex flex-col gap-3" onSubmit={async e => {
  e.preventDefault()
  const form = new FormData(e.currentTarget)
  setPending(true)
  try {
   await api("POST", "/api/app/account/recovery", { action: "set", email: form.get("email"), password: form.get("password") })
   await refresh()
   toast.success("Verification sent. Open the link in your private inbox.")
  } catch (e) { toast.error((e as Error).message) } finally { setPending(false) }
 }}>
  <p className="text-muted-foreground text-sm">{state.email ? `Verified recovery address: ${state.email}` : "Add a private address to recover your account if you cannot open your work mailbox."}{state.pending ? ` Verification pending: ${state.pending}.` : ""}</p>
  <Label htmlFor="recovery-email">Private email</Label><Input id="recovery-email" name="email" type="email" autoComplete="email" required />
  <Label htmlFor="recovery-password">Current password</Label><Input id="recovery-password" name="password" type="password" autoComplete="current-password" required />
  <div className="flex gap-2">
   <Button type="submit" disabled={pending}>Verify address</Button>
   {state.email || state.pending ? <Button type="button" variant="outline" disabled={pending} onClick={async e => {
    const form = e.currentTarget.form!
    const password = String(new FormData(form).get("password"))
    setPending(true)
    try { await api("POST", "/api/app/account/recovery", { action: "remove", password }); await refresh(); toast.success("Recovery address removed") }
    catch(e) { toast.error((e as Error).message) } finally { setPending(false) }
   }}>Remove</Button> : null}
  </div>
 </form>
}

export function VerifyRecoveryEmail({ token }: { token: string }) {
 const [state, setState] = React.useState("")
 return <div className="flex flex-col gap-4"><p>Confirm this address for password recovery.</p><Button disabled={!!state} onClick={async () => {
  setState("Verifying…")
  try { await api("POST", "/api/app/account/recovery", { action: "verify", token }); setState("Recovery address verified.") }
  catch(e) { setState((e as Error).message) }
 }}>{state || "Verify recovery email"}</Button><a href="/app/mail">Back to mail</a></div>
}
