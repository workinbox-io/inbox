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

type Role = "admin" | "member"

export interface TeamMember {
  id: string
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

interface TeamPanelProps {
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
async function run(call: Promise<{ error: { message?: string } | null }>, success: string, after: () => Promise<void>) {
  const { error } = await call
  if (error) {
    toast.error(error.message ?? "Something went wrong")
    return false
  }
  toast.success(success)
  await after()
  return true
}

// Switching orgs changes everything on the page (sidebar, data, billing), so that one reloads.
const reloadPage = async () => window.location.reload()

const ROLE_HINT: Record<Role, string> = {
  admin: "Manages the team, billing and API keys.",
  member: "Uses mail, notes and contacts.",
}

export function TeamPanel(props: TeamPanelProps) {
  const [{ members, invitations, canManage, canChangeRoles, seats, orgs }, refresh] = useLiveData("/api/app/team", props)
  const [inviting, setInviting] = React.useState(false)
  const taken = members.length + invitations.length
  const full = seats.limit !== null && taken >= seats.limit

  return (
    <>
      <SettingsSection
        title="Team"
        description={
          <>
            {members.length} member{members.length === 1 ? "" : "s"} with access to this organization.{" "}
            {seats.limit === null
              ? `The ${seats.plan} plan has no member limit.`
              : `${taken} of ${seats.limit} seats on the ${seats.plan} plan, pending invitations included.`}{" "}
            <DocsLink href="/docs/team#roles">Roles</DocsLink>
          </>
        }
      >
        <div className="grid gap-4">
          <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <UserAvatar seed={m.email} size={32} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">
                    {m.name}
                    {m.isMe ? <span className="text-muted-foreground font-normal"> (you)</span> : null}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">{m.email}</span>
                </span>
                {canChangeRoles && !m.isMe && m.role !== "owner" ? (
                  <Select
                    value={m.role}
                    onValueChange={(role) =>
                      void run(
                        authClient.organization.updateMemberRole({ memberId: m.id, role: role as Role }),
                        `${m.name} is now ${role === "admin" ? "an admin" : "a member"}`,
                        refresh,
                      )
                    }
                  >
                    <SelectTrigger size="sm" className="w-28" aria-label={`Role of ${m.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_HINT) as Role[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          <span className="capitalize">{r}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-muted-foreground bg-background rounded-full px-2.5 py-0.5 text-xs capitalize">{m.role}</span>
                )}
                {canManage && !m.isMe && m.role !== "owner" ? (
                  <ConfirmButton
                    title={`Remove ${m.name}?`}
                    description="They lose access right away. Their personal mailbox becomes shared and keeps its mail and aliases. To hand it to someone else, change its owner in Mail settings first."
                    confirmLabel="Remove"
                    onConfirm={async () => {
                      await run(authClient.organization.removeMember({ memberIdOrEmail: m.id }), `${m.name} removed`, refresh)
                    }}
                  >
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                      Remove
                    </Button>
                  </ConfirmButton>
                ) : null}
              </li>
            ))}
          </ul>

          {invitations.length ? (
            <div className="grid gap-2">
              <span className="text-muted-foreground text-xs">Pending invitations</span>
              <ul className="divide-border/60 divide-y rounded-2xl border border-dashed">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Mail className="text-muted-foreground size-4 shrink-0" />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate">{i.email}</span>
                      <span className="text-muted-foreground text-xs">
                        Expires {new Date(i.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    </span>
                    <span className="text-muted-foreground bg-background rounded-full px-2.5 py-0.5 text-xs capitalize">{i.role}</span>
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() =>
                          void run(
                            // Same invitation and link, a fresh 7 days, and the email again. Holds its seat.
                            authClient.organization.inviteMember({ email: i.email, role: i.role as Role, resend: true }),
                            `Invitation sent again to ${i.email}`,
                            refresh,
                          )
                        }
                      >
                        Resend
                      </Button>
                    ) : null}
                    {canManage ? (
                      <ConfirmButton
                        title={`Revoke the invitation for ${i.email}?`}
                        description="The link in their email stops working."
                        confirmLabel="Revoke"
                        onConfirm={async () => {
                          await run(authClient.organization.cancelInvitation({ invitationId: i.id }), "Invitation revoked", refresh)
                        }}
                      >
                        <Button variant="ghost" size="sm" className="text-muted-foreground">
                          Revoke
                        </Button>
                      </ConfirmButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => setInviting(true)} disabled={full}>
                <Plus /> Invite member
              </Button>
              {full ? (
                <span className="text-muted-foreground text-xs">
                  Every seat is taken. Upgrade the plan or revoke an invitation to invite someone else.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </SettingsSection>

      {orgs.length > 1 ? (
        <SettingsSection title="Your organizations" description="You belong to more than one. Switch to see its mail and billing.">
          <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                {o.active ? (
                  <span className="text-muted-foreground text-xs">Current</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void run(authClient.organization.setActive({ organizationId: o.id }), `Switched to ${o.name}`, reloadPage)}
                  >
                    Switch
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </SettingsSection>
      ) : null}

      {inviting ? <InviteDialog onClose={() => setInviting(false)} onInvited={refresh} /> : null}
    </>
  )
}

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => Promise<void> }) {
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
    const ok = await run(call, `Invitation sent to ${email.trim()}`, onInvited)
    if (ok) onClose()
    else setPending(false)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>We'll email them a link. It works for 7 days.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              autoFocus
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {domains.length ? <fieldset className="flex flex-col gap-2">
            <legend>Personal mailbox</legend>
            <Label htmlFor="invite-mailbox">Mailbox address</Label>
            <Input id="invite-mailbox" value={local} onChange={e => setLocal(e.target.value)} placeholder="name" pattern="[A-Za-z0-9._-]+" maxLength={64} required />
            <Label htmlFor="invite-domain">Domain</Label>
            <Select value={domainId} onValueChange={setDomainId}><SelectTrigger id="invite-domain"><SelectValue /></SelectTrigger><SelectContent>{domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}</SelectContent></Select>
            <p className="text-muted-foreground text-xs">Reserved until the invitation expires; created when accepted.</p>
          </fieldset> : null}
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_HINT) as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    <span className="capitalize">{r}</span>
                    <span className="text-muted-foreground"> · {ROLE_HINT[r]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={pending} type="submit" disabled={pending || !domainsLoaded || (domains.length > 0 && !local.trim())}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
