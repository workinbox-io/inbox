import * as React from "react"
import { authClient } from "@/lib/auth-client"
import { api } from "@/lib/api-client"
import { navigatePanel } from "@/lib/panel-history"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@yusufceng1z/ding-react"
import { MailCheck, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { PrefList, PrefRow } from "./pref-ui"
import { useSettingsDraft } from "@/components/settings/settings-draft"
import { t } from "@/lib/i18n/panel"

export function RequiredPasswordChange() {
 const [error, setError] = React.useState("")
 const [pending, setPending] = React.useState(false)
 return <Card className="w-full max-w-sm">
  <CardHeader><CardTitle>{t("Choose your own password")}</CardTitle><CardDescription>{t("Replace the temporary password before opening your mailbox.")}</CardDescription></CardHeader>
  <CardContent><form className="flex flex-col gap-4" onSubmit={async e => {
   e.preventDefault()
   const form = new FormData(e.currentTarget)
   setPending(true)
   try {
    const currentPassword = String(form.get("current"))
    const newPassword = String(form.get("next"))
    if (currentPassword === newPassword) throw new Error(t("Choose a different password"))
    if (newPassword !== String(form.get("confirm"))) throw new Error(t("Passwords do not match"))
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
    if (error) throw new Error(error.message ?? t("Could not change password"))
    navigatePanel("/app/mail")
   } catch (e) { setError((e as Error).message); setPending(false) }
  }}>
   <Label htmlFor="required-current">{t("Temporary password")}</Label><Input id="required-current" name="current" type="password" autoComplete="current-password" required />
   <Label htmlFor="required-next">{t("New password")}</Label><Input id="required-next" name="next" type="password" autoComplete="new-password" minLength={10} required />
   <Label htmlFor="required-confirm">{t("Confirm password")}</Label><Input id="required-confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
   {error && <p role="alert">{error}</p>}
   <Button disabled={pending} type="submit">{pending ? t("Saving…") : t("Change password")}</Button>
  </form></CardContent>
 </Card>
}

export function RecoveryEmailSettings() {
 const [dirty, setDirty] = React.useState(false)
 const [state, setState] = React.useState<{ email: string | null; pending: string | null } | null>(null)
 const [pending, setPending] = React.useState(false)
 const [editing, setEditing] = React.useState(false)
 const refresh = () => api<{ email: string | null; pending: string | null }>("GET", "/api/app/account/recovery").then(setState)
 React.useEffect(() => { void refresh().catch(e => toast.error(e.message)) }, [])
 const hasAny = !!(state?.email || state?.pending)
 const showForm = editing
 useSettingsDraft(showForm && dirty, pending)
 return <div className="flex flex-col gap-6">
  {hasAny ? <PrefList>
   {state?.email ? <PrefRow icon={ShieldCheck} title={state.email} description={t("Verified recovery address")}><Badge variant="success">{t("Verified")}</Badge></PrefRow> : null}
   {state?.pending ? <PrefRow icon={MailCheck} title={state.pending} description={t("Open the link we sent to this address.")}><Badge variant="warning">{t("Waiting for verification")}</Badge></PrefRow> : null}
  </PrefList> : null}
  {hasAny && !showForm ? <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing(true)}>{t("Change or remove")}</Button> : null}
  {state !== null && !hasAny && !showForm && <div className="flex flex-col items-start gap-3"><p className="text-muted-foreground text-sm">{t("Add a private address so you can recover access if your work email is unavailable.")}</p><Button variant="outline" size="sm" onClick={() => setEditing(true)}>{t("Add recovery email")}</Button></div>}
  {showForm ? <form className="max-w-md" onChange={() => setDirty(true)} onSubmit={async e => {
   e.preventDefault()
   const form = new FormData(e.currentTarget)
   setPending(true)
   try {
    await api("POST", "/api/app/account/recovery", { action: "set", email: form.get("email"), password: form.get("password") })
    await refresh()
    setDirty(false)
    setEditing(false)
    toast.success(t("Verification sent. Open the link in your private inbox."))
   } catch (e) { toast.error((e as Error).message) } finally { setPending(false) }
  }}>
   <FieldGroup>
    <Field>
     <FieldLabel htmlFor="recovery-email">{t("Private e-mail")}</FieldLabel>
     <Input id="recovery-email" name="email" type="email" autoComplete="email" placeholder="you@gmail.com" required />
     <FieldDescription>{t("Not your work address: the point is reaching you when that one doesn't work.")}</FieldDescription>
    </Field>
    <Field>
     <FieldLabel htmlFor="recovery-password">{t("Current password")}</FieldLabel>
     <Input id="recovery-password" name="password" type="password" autoComplete="current-password" required />
    </Field>
    <div className="flex flex-wrap justify-end gap-2">
     {hasAny ? <Button type="button" variant="ghost" className="text-destructive mr-auto" disabled={pending} onClick={async e => {
      const form = e.currentTarget.form!
      const password = String(new FormData(form).get("password"))
      if (!password) return toast.error(t("Enter your current password to remove it."))
      setPending(true)
      try { await api("POST", "/api/app/account/recovery", { action: "remove", password }); await refresh(); setEditing(false); toast.success(t("Recovery address removed")) }
      catch(e) { toast.error((e as Error).message) } finally { setPending(false) }
     }}>{t("Remove")}</Button> : null}
     {editing ? <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t("Cancel")}</Button> : null}
     <Button type="submit" loading={pending} disabled={pending}>{t("Send verification")}</Button>
    </div>
   </FieldGroup>
  </form> : null}
 </div>
}

export function VerifyRecoveryEmail({ token }: { token: string }) {
 const [state, setState] = React.useState("")
 return <div className="flex flex-col gap-4"><p>{t("Confirm this address for password recovery.")}</p><Button disabled={!!state} onClick={async () => {
  setState(t("Verifying…"))
  try { await api("POST", "/api/app/account/recovery", { action: "verify", token }); setState(t("Recovery address verified.")) }
  catch(e) { setState((e as Error).message) }
 }}>{state || t("Verify recovery email")}</Button><a href="/app/mail">{t("Back to mail")}</a></div>
}
