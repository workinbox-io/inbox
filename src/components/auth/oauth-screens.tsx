import * as React from "react"
import { Building2, Check, ShieldCheck } from "lucide-react"

import { authClient, oauthRedirect } from "@/lib/auth-client"
import { siteConfig } from "@/config/site"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n/panel"

/** Both screens finish by handing the browser back to Better Auth's authorization flow. */
function follow(data: unknown, error: { message?: string } | null, setError: (m: string) => void) {
  const url = oauthRedirect(data)
  if (url) return window.location.assign(url)
  setError(error?.message ?? t("This request has expired. Start connecting again from the app."))
}

interface Org {
  orgId: string
  orgName: string
  role: string
}

/** Step 1 for users in several organizations: which one the app may work in. */
export function OAuthOrganizationPicker({ appName, orgs, initial }: { appName: string; orgs: Org[]; initial: string | null }) {
  const [selected, setSelected] = React.useState(initial ?? orgs[0]?.orgId ?? null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function onContinue() {
    if (!selected) return
    setPending(true)
    setError(null)
    // Plain fetch: through authClient this request would carry the OAuth query and resume
    // the authorization before the choice is saved.
    const active = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: selected }),
    })
    if (!active.ok) {
      setPending(false)
      return setError(t("Couldn't select that organization"))
    }
    const { data, error } = await authClient.oauth2.continue({ postLogin: true })
    setPending(false)
    follow(data, error, setError)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("Choose an organization")}</CardTitle>
        <CardDescription>
          {t("{app} will work in the organization you pick. You can connect it to another one later.", { app: appName })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label={t("Organization")} className="grid gap-2">
          {orgs.map((o) => (
            <button
              key={o.orgId}
              type="button"
              role="radio"
              aria-checked={selected === o.orgId}
              onClick={() => setSelected(o.orgId)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                selected === o.orgId ? "border-primary bg-primary/5" : "hover:bg-muted/60",
              )}
            >
              <Building2 className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">{o.orgName}</span>
              <span className="text-muted-foreground text-xs ">{o.role === "owner" ? t("Owner") : o.role === "admin" ? t("Admin") : o.role === "member" ? t("Member") : o.role}</span>
              {selected === o.orgId ? <Check className="text-primary size-4" /> : null}
            </button>
          ))}
        </div>
        {error ? <p className="text-destructive mt-3 text-sm">{error}</p> : null}
      </CardContent>
      <CardFooter className="mt-6">
        <Button loading={pending} className="w-full" disabled={!selected || pending} onClick={() => void onContinue()}>
          {t("Continue")}
        </Button>
      </CardFooter>
    </Card>
  )
}

interface ConsentProps {
  app: { name: string; uri: string | null; icon: string | null }
  orgName: string
  userEmail: string
  scopes: { scope: string; label: string }[]
  /** Host the browser returns to, shown so users notice look-alike apps. */
  redirectHost: string | null
}

/** Step 2: what the app asks for, and Allow / Cancel. */
export function OAuthConsent({ app, orgName, userEmail, scopes, redirectHost }: ConsentProps) {
  const [pending, setPending] = React.useState<"allow" | "deny" | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function decide(accept: boolean) {
    setPending(accept ? "allow" : "deny")
    setError(null)
    const { data, error } = await authClient.oauth2.consent({ accept })
    setPending(null)
    follow(data, error, setError)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-2 flex items-center gap-3">
          {app.icon ? (
            <img src={app.icon} alt="" className="size-10 rounded-xl" referrerPolicy="no-referrer" />
          ) : (
            <span className="bg-muted flex size-10 items-center justify-center rounded-xl">
              <ShieldCheck className="text-muted-foreground size-5" />
            </span>
          )}
        </div>
        <CardTitle className="text-xl">{t("Connect {app}?", { app: app.name })}</CardTitle>
        <CardDescription>
          {t("{app} wants to use {name} as {email} in {org}.", { app: app.name, name: siteConfig.name, email: userEmail, org: orgName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-2 text-sm">
          {scopes.map((s) => (
            <li key={s.scope} className="flex items-start gap-2">
              <Check className="text-primary mt-0.5 size-4 shrink-0" />
              {t(s.label)}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          {t("It acts with your role in {org}. Disconnect it any time in Settings → AI apps.", { org: orgName })}
          {redirectHost ? ` ${t("You'll be sent back to {host}.", { host: redirectHost })}` : ""}
          {app.uri ? (
            <>
              {" "}
              <a href={app.uri} target="_blank" rel="noreferrer" className="hover:text-foreground underline underline-offset-2">
                {t("About this app")}
              </a>
            </>
          ) : null}
        </p>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </CardContent>
      <CardFooter className="mt-6 flex-col gap-2">
        <Button loading={pending === "allow"} className="w-full" disabled={pending !== null} onClick={() => void decide(true)}>
          {t("Allow")}
        </Button>
        <Button variant="ghost" className="w-full" disabled={pending !== null} onClick={() => void decide(false)}>
          {t("Cancel")}
        </Button>
      </CardFooter>
    </Card>
  )
}
