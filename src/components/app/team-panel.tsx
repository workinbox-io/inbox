import * as React from "react"
import { Mail, Plus } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { authClient } from "@/lib/auth-client"
import { api } from "@/lib/api-client"
import { useLiveData } from "@/lib/use-live-data"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmButton } from "@/components/app/confirm-button"
import { SettingsSection } from "@/components/app/settings-section"
import { DocsLink } from "@/components/app/docs-link"
import { UserAvatar } from "./user-avatar"
import { ActionMenuButton } from "@/components/workspace/action-menu"
import { switchWorkspace } from "@/components/workspace/workspace-menu"
import { Badge } from "@/components/ui/badge"
import { confirmSettingsLeave, SettingsDraftContext } from "@/components/settings/settings-draft"
import { appLocale, t, tp } from "@/lib/i18n/panel"

export type Role = "admin" | "member"

export interface TeamMember {
  id: string
  userId: string
  name: string
  email: string
  role: string
  isMe: boolean
}

export interface PendingInvitation {
  id: string
  email: string
  role: string
  expiresAt: string
}

export interface OrgChoice {
  id: string
  name: string
  active: boolean
}

export interface TeamPanelProps {
  members: TeamMember[]
  invitations: PendingInvitation[]
  /** Owners and admins manage the team; Better Auth enforces the same rule server-side. */
  canManage: boolean
  /** Only an owner changes roles. Ownership moves through Transfer (Organization), never a role pick. */
  canChangeRoles: boolean
  /** The plan's member limit; `null` = unlimited. Pending invitations hold a seat too. */
  seats: { plan: string; limit: number | null }
  orgs: OrgChoice[]
}

/** Better Auth client calls return `{ error }` instead of throwing; `after` updates the view. */
export async function run(call: Promise<{ error: { message?: string } | null }>, success: string, after: () => Promise<void>) {
  const { error } = await call
  if (error) {
    toast.error(error.message ?? t("Something went wrong"))
    return false
  }
  toast.success(success)
  await after()
  return true
}

export const roleHint = (r: Role) => (r === "admin" ? t("Manages the team, billing and API keys.") : t("Uses mail, notes and contacts."))
export const roleName = (r: string) => (r === "admin" ? t("Admin") : r === "member" ? t("Member") : r === "owner" ? t("Owner") : r)
export const ROLES: Role[] = ["admin", "member"]

export function TeamPanel(props: TeamPanelProps) {
  const [{ members, invitations, canManage, canChangeRoles, seats }, refresh] = useLiveData("/api/app/team", props)
  const [inviting, setInviting] = React.useState(false)
  const taken = members.length + invitations.length
  const full = seats.limit !== null && taken >= seats.limit

  return (
    <>
      <SettingsSection
        id="team"
        title={t("Team")}
        description={
          <>
            {tp(members.length, { one: "{n} member with access to this organization.", other: "{n} members with access to this organization." })}{" "}
            {seats.limit === null
              ? t("The {plan} plan has no member limit.", { plan: seats.plan })
              : t("{taken} of {limit} seats on the {plan} plan, pending invitations included.", { taken, limit: seats.limit, plan: seats.plan })}{" "}
            <DocsLink href="/docs/team#roles">{t("Roles")}</DocsLink>
          </>
        }
      >
        <div className="grid gap-4">
          <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <UserAvatar seed={m.email} size={32} />
                <span className="grid min-w-0 flex-1 basis-40">
                  <span className="truncate font-medium">
                    {m.name}
                    {m.isMe ? <span className="text-muted-foreground font-normal"> {t("(you)")}</span> : null}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">{m.email}</span>
                </span>
                {canChangeRoles && !m.isMe && m.role !== "owner" ? (
                  <Select
                    value={m.role}
                    onValueChange={(role) =>
                      void run(
                        authClient.organization.updateMemberRole({ memberId: m.id, role: role as Role }),
                        role === "admin" ? t("{name} is now an admin", { name: m.name }) : t("{name} is now a member", { name: m.name }),
                        refresh,
                      )
                    }
                  >
                    <SelectTrigger size="sm" className="w-28" aria-label={t("Role of {name}", { name: m.name })}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          <span>{roleName(r)}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-muted-foreground bg-background rounded-md px-1.5 py-0.5 text-xs">{roleName(m.role)}</span>
                )}
                {canManage && !m.isMe && m.role !== "owner" ? (
                  <ConfirmButton
                    title={t("Remove {name}?", { name: m.name })}
                    description={t("They lose access right away. Their personal mailbox becomes shared and keeps its mail and aliases.")}
                    confirmLabel={t("Remove")}
                    onConfirm={async () => {
                      await run(authClient.organization.removeMember({ memberIdOrEmail: m.id }), t("{name} removed", { name: m.name }), refresh)
                    }}
                  >
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                      {t("Remove")}
                    </Button>
                  </ConfirmButton>
                ) : null}
              </li>
            ))}
          </ul>

          {invitations.length ? (
            <div className="grid gap-2">
              <span className="text-muted-foreground text-xs">{t("Pending invitations")}</span>
              <ul className="divide-border/60 divide-y rounded-2xl border border-dashed">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Mail className="text-muted-foreground size-4 shrink-0" />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate">{i.email}</span>
                      <span className="text-muted-foreground text-xs">
                        {t("Expires {date}", { date: new Date(i.expiresAt).toLocaleDateString(appLocale(), { day: "numeric", month: "short" }) })}
                      </span>
                    </span>
                    <Badge variant="secondary">{roleName(i.role)}</Badge>
                    {canManage && <ActionMenuButton label={t("Manage invitation for {email}", { email: i.email })} size="icon-sm" actions={[
                      { label: t("Copy invitation link"), onSelect: async () => { await navigator.clipboard.writeText(new URL(`/invite/${i.id}`, location.origin).href).then(() => toast.success(t("Invitation link copied")), (e) => toast.error((e as Error).message)) } },
                      { label: t("Resend invitation"), onSelect: async () => { await run(authClient.organization.inviteMember({ email: i.email, role: i.role as Role, resend: true }), t("Invitation sent again to {email}", { email: i.email }), refresh) } },
                      { label: t("Revoke invitation"), destructive: true, confirm: { title: t("Revoke the invitation for {email}?", { email: i.email }), description: t("The link in their email stops working."), confirmLabel: t("Revoke") }, onSelect: async () => { await run(authClient.organization.cancelInvitation({ invitationId: i.id }), t("Invitation revoked"), refresh) } },
                    ]} />}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => setInviting(true)} disabled={full}>
                <Plus /> {t("Invite member")}
              </Button>
              {full ? (
                <span className="text-muted-foreground text-xs">
                  {t("Every seat is taken. Upgrade the plan or revoke an invitation to invite someone else.")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </SettingsSection>

      {inviting ? <InviteDialog onClose={() => setInviting(false)} onInvited={refresh} /> : null}
    </>
  )
}

export function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => Promise<void> }) {
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<Role>("member")
  const [domains, setDomains] = React.useState<{ id: string; domain: string }[]>([])
  const [domainId, setDomainId] = React.useState("")
  const [local, setLocal] = React.useState("")
  const [domainsLoaded, setDomainsLoaded] = React.useState(false)
  React.useEffect(() => {
    void api<{ domains: { id: string; domain: string; status: string }[] }>("GET", "/api/app/mail/settings").then(data => {
      const active = data.domains.filter(d => d.status === "active")
      setDomains(active)
      setDomainId(active[0]?.id ?? "")
      setDomainsLoaded(true)
    }).catch(e => toast.error((e as Error).message))
  }, [])
  const [pending, setPending] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const mailboxAddress = domains.length ? local.trim().toLowerCase() + "@" + domains.find(d => d.id === domainId)!.domain : undefined
    const call = api("POST", "/api/auth/organization/invite-member", { email: email.trim(), role, mailboxAddress, mailboxDomainId: domainId || undefined }).then(() => ({ error: null })).catch(e => ({ error: { message: (e as Error).message } }))
    const ok = await run(call, t("Invitation sent to {email}", { email: email.trim() }), onInvited)
    if (ok) onClose()
    else setPending(false)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("Invite a team member")}</DialogTitle>
            <DialogDescription>{t("We'll email them a link. It works for 7 days.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="invite-email">{t("Email")}</Label>
            <Input
              id="invite-email"
              type="email"
              required
              autoFocus
              placeholder={t("colleague@company.com")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {domains.length ? <fieldset className="flex flex-col gap-2">
            <legend>{t("Personal mailbox")}</legend>
            <Label htmlFor="invite-mailbox">{t("Mailbox address")}</Label>
            <Input id="invite-mailbox" value={local} onChange={e => setLocal(e.target.value)} placeholder={t("name")} pattern="[A-Za-z0-9._-]+" maxLength={64} required />
            <Label htmlFor="invite-domain">{t("Domain")}</Label>
            <Select value={domainId} onValueChange={setDomainId}><SelectTrigger id="invite-domain"><SelectValue /></SelectTrigger><SelectContent>{domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}</SelectContent></Select>
            <p className="text-muted-foreground text-xs">{t("Reserved until the invitation expires; created when accepted.")}</p>
          </fieldset> : null}
          <div className="grid gap-2">
            <Label>{t("Role")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    <span>{roleName(r)}</span>
                    <span className="text-muted-foreground"> · {roleHint(r)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button loading={pending} type="submit" disabled={pending || !domainsLoaded || (domains.length > 0 && !local.trim())}>
              {pending ? t("Sending…") : t("Send invitation")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function OrganizationSwitcher({ orgs }: { orgs: OrgChoice[] }) {
  const drafts = React.useContext(SettingsDraftContext)
  return <>{orgs.length > 1 ? (
        <SettingsSection title={t("Your organizations")} description={t("You belong to more than one. Switch to see its mail and billing.")}>
          <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                {o.active ? (
                  <span className="text-muted-foreground text-xs">{t("org|Current")}</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!confirmSettingsLeave(drafts)) return
                      drafts?.clear()
                      void switchWorkspace(o.id, o.name)
                    }}
                  >
                    {t("Switch")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </SettingsSection>
      ) : null}</>
}
