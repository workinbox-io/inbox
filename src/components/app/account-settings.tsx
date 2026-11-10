import * as React from "react"
import { Laptop, Smartphone } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import type { AccountData, SessionRow } from "@/lib/server/account"
import { api } from "@/lib/api-client"
import { siteConfig } from "@/config/site"
import { authClient } from "@/lib/auth-client"
import { timeAgo } from "@/lib/format"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ConfirmButton } from "@/components/app/confirm-button"
import { SettingsSection } from "@/components/app/settings-section"
import { TwoFactorPanel } from "@/components/app/two-factor-panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SITE_LOCALES, localeName, type SiteLocale } from "@/lib/i18n/locales"
import { t } from "@/lib/i18n/panel"

type AuthError = { code?: string; message?: string } | null

function errorText(error: NonNullable<AuthError>) {
  if (error.code === "SESSION_NOT_FRESH" || error.code === "SESSION_EXPIRED") return "For your security, sign out and back in, then try again."
  if (error.code === "INVALID_PASSWORD") return "Wrong password."
  if (error.code === "PASSWORD_TOO_SHORT") return "Use at least 10 characters."
  return error.message ?? "Something went wrong"
}

interface AccountSettingsProps extends AccountData {
  user: { name: string; email: string; twoFactorEnabled: boolean; locale?: string | null }
  /** The language the dashboard shows now (the user's setting, or the cookie's or browser's). */
  locale?: SiteLocale
  /** Set after following the link in the change-email message. */
  emailChanged?: boolean
}

export function AccountSettings(props: AccountSettingsProps) {
  React.useEffect(() => {
    if (props.emailChanged) toast.success(`Your email is now ${props.user.email}`)
  }, [props.emailChanged, props.user.email])

  return (
    <>
      <ProfileSection user={props.user} locale={props.locale ?? "en"} />
      <PasswordSection hasPassword={props.hasPassword} />
      <SessionsSection initial={props.sessions} />
      {props.googleEnabled ? (
        <SignInMethodsSection hasPassword={props.hasPassword} googleAccountId={props.googleAccountId} />
      ) : null}
      <TwoFactorPanel enabled={props.user.twoFactorEnabled} hasPassword={props.hasPassword} />
      <DeleteAccountSection hasPassword={props.hasPassword} blockers={props.deletionBlockers} />
    </>
  )
}

// ---------------------------------------------------------------------------

/**
 * Dashboard language (config/languages.ts): saved on the user (lib/server/i18n.ts), then the page reloads in it.
 * "auto" follows the cookie or the browser. Hidden while the product has one language.
 */
function LanguageField({ saved, shown }: { saved: string | null; shown: SiteLocale }) {
  const [pending, setPending] = React.useState(false)
  if (SITE_LOCALES.length < 2) return null
  async function pick(value: string) {
    setPending(true)
    const { error } = await authClient.updateUser({ locale: value === "auto" ? null : value } as never)
    if (error) {
      setPending(false)
      return void toast.error(errorText(error))
    }
    location.reload()
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor="account-language">{t("Language")}</Label>
      <Select value={saved && SITE_LOCALES.includes(saved as SiteLocale) ? saved : "auto"} onValueChange={pick} disabled={pending}>
        <SelectTrigger id="account-language" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{t("Automatic ({language})", { language: localeName(shown) })}</SelectItem>
          {SITE_LOCALES.map((l) => (
            <SelectItem key={l} value={l} lang={l}>
              {localeName(l)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">{t("The dashboard and the e-mails we send you.")}</p>
    </div>
  )
}

function ProfileSection({ user, locale }: { user: { name: string; email: string; locale?: string | null }; locale: SiteLocale }) {
  const [name, setName] = React.useState(user.name)
  const [saved, setSaved] = React.useState(user.name)
  const [pending, setPending] = React.useState(false)
  const [changingEmail, setChangingEmail] = React.useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const { error } = await authClient.updateUser({ name: name.trim() })
    setPending(false)
    if (error) return void toast.error(errorText(error))
    setSaved(name.trim())
    toast.success("Name saved")
  }

  return (
    <SettingsSection id="account" title="Profile" description="Your name is shown to your team and in the audit log.">
      <div className="grid max-w-md grid-cols-[minmax(0,1fr)] gap-6">
        <form onSubmit={save} className="grid gap-2">
          <Label htmlFor="account-name">Name</Label>
          <div className="flex gap-2">
            <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required autoComplete="name" />
            <Button type="submit" variant="outline" loading={pending} disabled={pending || !name.trim() || name.trim() === saved}>
              Save
            </Button>
          </div>
        </form>
        <LanguageField saved={user.locale ?? null} shown={locale} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Email</Label>
          <div className="flex items-center gap-2">
            <span className="bg-surface min-w-0 flex-1 truncate rounded-md px-3 py-2 text-sm">{user.email}</span>
            <Button variant="outline" onClick={() => setChangingEmail(true)}>
              Change
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">You sign in and get emails at this address.</p>
        </div>
      </div>
      {changingEmail ? <ChangeEmailDialog current={user.email} onClose={() => setChangingEmail(false)} /> : null}
    </SettingsSection>
  )
}

function ChangeEmailDialog({ current, onClose }: { current: string; onClose: () => void }) {
  const [email, setEmail] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const newEmail = email.trim().toLowerCase()
    if (newEmail === current.toLowerCase()) return setError("That's already your email.")
    setPending(true)
    setError(null)
    const { error } = await authClient.changeEmail({ newEmail, callbackURL: "/app/settings/account?email=changed" })
    setPending(false)
    if (error) return setError(errorText(error))
    setSentTo(newEmail)
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        {sentTo ? (
          <>
            <DialogHeader>
              <DialogTitle>Check your inbox</DialogTitle>
              <DialogDescription>
                We sent a confirmation link to <span className="text-foreground font-medium">{sentTo}</span>. Your email changes once you open it.
                The link works for 24 hours.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Change your email</DialogTitle>
              <DialogDescription>We'll send a confirmation link to the new address, and a heads-up to {current}.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-email">New email</Label>
              <Input id="new-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} disabled={pending || !email.trim()}>
                Send confirmation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [signOutOthers, setSignOutOthers] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) return setError("The new passwords don't match.")
    if (next.length < 10) return setError("Use at least 10 characters.")
    setPending(true)
    setError(null)
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: signOutOthers })
    setPending(false)
    if (error) return setError(errorText(error))
    setCurrent("")
    setNext("")
    setConfirm("")
    toast.success(signOutOthers ? "Password changed. Other devices were signed out." : "Password changed")
  }

  return (
    <SettingsSection title="Password" description="Use at least 10 characters. A password manager makes this easy.">
      {hasPassword ? (
        <form onSubmit={submit} className="grid max-w-md gap-4">
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Repeat new password</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={signOutOthers} onCheckedChange={(v) => setSignOutOthers(v === true)} />
            Sign out on all other devices
          </label>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div>
            <Button type="submit" loading={pending} disabled={pending || !current || !next || !confirm}>
              Change password
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid max-w-md gap-3">
          <p className="text-muted-foreground text-sm">
            You sign in with Google and have no {siteConfig.name} password. To add one, we'll email you a link to set it.
          </p>
          <div>
            <a href="/forgot-password" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Set a password
            </a>
          </div>
        </div>
      )}
    </SettingsSection>
  )
}

// ---------------------------------------------------------------------------

const VISIBLE_SESSIONS = 4

function SessionsSection({ initial }: { initial: SessionRow[] }) {
  const [sessions, setSessions] = React.useState(initial)
  const others = sessions.filter((s) => !s.current)
  const [expanded, setExpanded] = React.useState(false)
  // The current session first, then the most recently active others.
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.lastActive.localeCompare(a.lastActive))
  const visible = expanded ? ordered : ordered.slice(0, VISIBLE_SESSIONS)

  async function revoke(s: SessionRow) {
    try {
      await api("DELETE", `/api/app/account/sessions/${s.id}`)
      setSessions((list) => list.filter((x) => x.id !== s.id))
      toast.success("Signed out that session")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function revokeOthers() {
    const { error } = await authClient.revokeOtherSessions()
    if (error) return void toast.error(errorText(error))
    setSessions((list) => list.filter((s) => s.current))
    toast.success("Signed out everywhere else")
  }

  return (
    <SettingsSection
      title="Sessions"
      description="Browsers and devices signed in to your account. Sign out any you don't recognise, then change your password."
    >
      <div className="grid gap-3">
        {others.length ? (
          <div className="flex max-w-2xl flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">
              {sessions.length} session{sessions.length === 1 ? "" : "s"}
            </span>
            <ConfirmButton
              title="Sign out all other sessions?"
              description={`${others.length} other session${others.length === 1 ? "" : "s"} will need to sign in again. You stay signed in here.`}
              confirmLabel="Sign out others"
              onConfirm={revokeOthers}
            >
              <Button variant="outline" size="sm">
                Sign out other sessions
              </Button>
            </ConfirmButton>
          </div>
        ) : null}
        <ul className="bg-surface divide-border/60 max-w-2xl divide-y rounded-2xl">
          {visible.map((s) => {
            const Icon = s.mobile ? Smartphone : Laptop
            return (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Icon className="text-muted-foreground size-4 shrink-0" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">
                    {s.browser}
                    {s.os ? <span className="font-normal"> on {s.os}</span> : null}
                  </span>
                  <span className="text-muted-foreground truncate text-xs" suppressHydrationWarning>
                    {[s.ip, s.current ? "Active now" : `Active ${timeAgo(s.lastActive)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {s.current ? (
                  <span className="bg-background rounded-full px-2.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">This device</span>
                ) : (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void revoke(s)}>
                    Sign out
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {sessions.length > VISIBLE_SESSIONS ? (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show fewer" : `Show all (${sessions.length})`}
            </Button>
          </div>
        ) : null}
        <div className="md:hidden">
          <a data-astro-reload href="/api/auth/sign-out-redirect" className={buttonVariants({ size: "sm", variant: "ghost" })}>
            Sign out
          </a>
        </div>
      </div>
    </SettingsSection>
  )
}

// ---------------------------------------------------------------------------

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.35-2.09V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

function SignInMethodsSection({ hasPassword, googleAccountId }: { hasPassword: boolean; googleAccountId: string | null }) {
  const [linked, setLinked] = React.useState(googleAccountId)
  const [pending, setPending] = React.useState(false)

  async function link() {
    setPending(true)
    const { error } = await authClient.linkSocial({ provider: "google", callbackURL: "/app/settings/account" })
    if (error) {
      setPending(false)
      toast.error(errorText(error))
    }
  }

  async function unlink() {
    const { error } = await authClient.unlinkAccount({ accountId: linked! })
    if (error) return void toast.error(errorText(error))
    setLinked(null)
    toast.success("Google disconnected")
  }

  return (
    <SettingsSection title="Sign-in methods" description="Ways you can sign in to this account.">
      <ul className="bg-surface divide-border/60 max-w-xl divide-y rounded-2xl">
        <li className="flex items-center gap-3 px-5 py-3 text-sm">
          <span className="text-muted-foreground grid size-4 place-items-center font-mono text-xs">*</span>
          <span className="flex-1 font-medium">Email and password</span>
          <span className="text-muted-foreground text-xs">{hasPassword ? "On" : "Not set"}</span>
        </li>
        <li className="flex items-center gap-3 px-5 py-3 text-sm">
          <GoogleMark />
          <span className="flex-1 font-medium">Google</span>
          {linked ? (
            hasPassword ? (
              <ConfirmButton
                title="Disconnect Google?"
                description="You'll sign in with your email and password instead."
                confirmLabel="Disconnect"
                onConfirm={unlink}
              >
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  Disconnect
                </Button>
              </ConfirmButton>
            ) : (
              <span className="text-muted-foreground text-xs">Connected · set a password to disconnect</span>
            )
          ) : (
            <Button variant="outline" size="sm" loading={pending} onClick={() => void link()}>
              Connect
            </Button>
          )}
        </li>
      </ul>
    </SettingsSection>
  )
}

// ---------------------------------------------------------------------------

function DeleteAccountSection({ hasPassword, blockers }: { hasPassword: boolean; blockers: string[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <SettingsSection
      title="Delete account"
      destructive
      description="Removes your account and your access to every organization. Organizations only you use are deleted with it."
    >
      <div className="grid max-w-xl gap-3">
        {blockers.length ? (
          <div className="bg-surface grid gap-2 rounded-2xl px-5 py-4 text-sm">
            <p className="font-medium">You can't delete your account yet</p>
            <ul className="text-muted-foreground grid list-disc gap-1 pl-4">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <a href="/app/settings/organization#danger-zone" className="hover:text-foreground text-muted-foreground w-fit text-xs underline underline-offset-2">
              Organization settings
            </a>
          </div>
        ) : null}
        <div>
          <Button variant="destructive" size="sm" disabled={blockers.length > 0} onClick={() => setOpen(true)}>
            Delete account
          </Button>
        </div>
      </div>
      {open ? <DeleteAccountDialog hasPassword={hasPassword} onClose={() => setOpen(false)} /> : null}
    </SettingsSection>
  )
}

function DeleteAccountDialog({ hasPassword, onClose }: { hasPassword: boolean; onClose: () => void }) {
  const [password, setPassword] = React.useState("")
  const [typed, setTyped] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const ready = hasPassword ? password.length > 0 : typed === "DELETE"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    // Google-only accounts have no password; Better Auth then wants a recent sign-in instead.
    const { error } = await authClient.deleteUser(hasPassword ? { password } : {})
    if (error) {
      setPending(false)
      return setError(errorText(error))
    }
    window.location.href = "/?account=deleted"
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This can't be undone. You lose access to every organization you're in, and organizations only you use are deleted with
              their API keys and storage settings.
            </DialogDescription>
          </DialogHeader>
          {hasPassword ? (
            <div className="grid gap-2">
              <Label htmlFor="delete-password">Password</Label>
              <Input id="delete-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono">DELETE</span> to confirm
              </Label>
              <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
            </div>
          )}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={pending} disabled={pending || !ready}>
              Delete account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
