/**
 * Admin → People: everyone in the organization with their personal mailbox in one list (like Google Workspace's Users
 * or Proton's "Users and addresses"), a sheet per person for role, mailbox, aliases and access, and the shared
 * mailboxes next to them. Domains, import and org-wide sending stay in Admin → Mail (mail-settings.tsx).
 */
import * as React from "react"
import { AtSign, ChevronDown, ChevronRight, Inbox, Mail, Plus, Search, UserMinus } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { useLiveData } from "@/lib/use-live-data"
import { appLocale, t, tp } from "@/lib/i18n/panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ConfirmButton } from "@/components/app/confirm-button"
import { DocsLink } from "@/components/app/docs-link"
import { SettingsSection } from "@/components/app/settings-section"
import { SettingsTabs } from "@/components/settings/settings-tabs"
import { ActionMenuButton } from "@/components/workspace/action-menu"
import { toast } from "@yusufceng1z/ding-react"
import {
  CredentialsDialog,
  MailboxDetails,
  mailboxOps,
  NewMailboxDialog,
  run as mailAction,
  SharedMailboxes,
  SheetSectionTitle,
  type Act,
  type Credentials,
  type MailSetup,
  type Who,
} from "@/components/mailbox/mail-settings"
import { InviteDialog, roleName, ROLES, run, type Role, type TeamMember, type TeamPanelProps } from "./team-panel"
import { UserAvatar } from "./user-avatar"

type Team = Omit<TeamPanelProps, "orgs"> & { orgs?: unknown }

export function PeoplePanel(props: { team: Team; setup: MailSetup }) {
  const [team, refreshTeam] = useLiveData<Team>("/api/app/team", props.team)
  const [setup, refreshSetup] = useLiveData<MailSetup>("/api/app/mail/settings", props.setup)
  const refresh = async () => {
    await Promise.all([refreshTeam(), refreshSetup()])
  }
  const act: Act = async (body, ok) => {
    await mailAction(body, ok).catch(() => null)
    await refresh()
  }
  return (
    <SettingsTabs
      label={t("People")}
      tabs={[
        { id: "people", label: t("People"), content: <PeopleList team={team} setup={setup} act={act} refresh={refresh} /> },
        { id: "shared", label: t("Shared mailboxes"), content: <SharedMailboxes setup={setup} act={act} /> },
      ]}
    />
  )
}

function PeopleList({ team, setup, act, refresh }: { team: Team; setup: MailSetup; act: Act; refresh: () => Promise<void> }) {
  const { members, invitations, canManage, seats } = team
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [inviting, setInviting] = React.useState(false)
  const [creating, setCreating] = React.useState<{ who: Who; userId?: string } | null>(null)
  const [credentials, setCredentials] = React.useState<Credentials | null>(null)
  const [query, setQuery] = React.useState("")
  const taken = members.length + invitations.length
  const full = seats.limit !== null && taken >= seats.limit
  const hasDomain = setup.domains.length > 0
  const boxesOf = (userId: string) => setup.mailboxes.filter((b) => b.kind === "personal" && b.userId === userId)
  const q = query.trim().toLowerCase()
  const shown = q
    ? members.filter((m) => [m.name, m.email, ...boxesOf(m.userId).map((b) => b.address)].some((v) => v.toLowerCase().includes(q)))
    : members
  const opened = members.find((m) => m.userId === openId) ?? null

  const addButton = !canManage ? null : hasDomain ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={full}>
          <Plus /> {t("Add person")} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuItem className="items-start" onSelect={() => setCreating({ who: "person" })}>
          <AtSign className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="font-medium">{t("Create an account on your domain")}</span>
            <span className="text-muted-foreground text-xs">{t("They sign in with the new address and a temporary password you hand over.")}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className="items-start" onSelect={() => setInviting(true)}>
          <Mail className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="font-medium">{t("Invite by e-mail")}</span>
            <span className="text-muted-foreground text-xs">{t("They join with an e-mail they already have and get a mailbox on your domain.")}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Button onClick={() => setInviting(true)} disabled={full}>
      <Plus /> {t("Invite member")}
    </Button>
  )

  return (
    <SettingsSection
      title={t("People")}
      description={
        <>
          {tp(members.length, { one: "{n} person in this organization.", other: "{n} people in this organization." })}{" "}
          {seats.limit === null
            ? t("The {plan} plan has no member limit.", { plan: seats.plan })
            : t("{taken} of {limit} seats on the {plan} plan, pending invitations included.", { taken, limit: seats.limit, plan: seats.plan })}{" "}
          <DocsLink href="/docs/team#roles">{t("Roles")}</DocsLink>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {addButton}
          {members.length > 8 ? (
            <div className="relative min-w-48 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search people")} aria-label={t("Search people")} className="pl-9" />
            </div>
          ) : null}
          {full ? <span className="text-muted-foreground text-xs">{t("Every seat is taken. Upgrade the plan or revoke an invitation to invite someone else.")}</span> : null}
        </div>

        <ul className="bg-surface divide-border/60 divide-y overflow-hidden rounded-2xl">
          {shown.map((m) => {
            const boxes = boxesOf(m.userId)
            const box = boxes[0]
            const aliases = setup.aliases.filter((a) => boxes.some((b) => b.id === a.mailboxId)).length
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(m.userId)}
                  className="hover:bg-accent/40 focus-visible:ring-ring/50 flex w-full items-center gap-3 py-3 pr-4 pl-5 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-inset"
                >
                  <UserAvatar seed={m.email} size={32} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">
                      {m.name}
                      {m.isMe ? <span className="text-muted-foreground font-normal"> {t("(you)")}</span> : null}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {box ? (box.address === m.email ? box.address : `${box.address} · ${m.email}`) : m.email}
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 sm:flex">
                    {box?.mailOnly ? <Badge variant="secondary">{t("Mail only")}</Badge> : null}
                    {aliases ? <Badge variant="secondary">{tp(aliases, { one: "{n} alias", other: "{n} aliases" })}</Badge> : null}
                    {hasDomain && !box ? <Badge variant="outline">{t("No mailbox")}</Badge> : null}
                  </span>
                  <span className="text-muted-foreground bg-background shrink-0 rounded-md px-1.5 py-0.5 text-xs">{roleName(m.role)}</span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </button>
              </li>
            )
          })}
          {!shown.length ? <li className="text-muted-foreground px-5 py-6 text-center text-sm">{t("Nobody matches \"{query}\".", { query })}</li> : null}
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
      </div>

      <PersonSheet
        member={opened}
        team={team}
        setup={setup}
        act={act}
        refresh={refresh}
        onClose={() => setOpenId(null)}
        onGiveMailbox={(userId) => setCreating({ who: "member", userId })}
        onCredentials={setCredentials}
      />
      {inviting ? <InviteDialog onClose={() => setInviting(false)} onInvited={refresh} /> : null}
      <NewMailboxDialog
        who={creating?.who ?? null}
        userId={creating?.userId}
        onClose={() => setCreating(null)}
        setup={setup}
        act={act}
        onAdded={async (c) => {
          setCredentials(c)
          await refresh()
        }}
      />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </SettingsSection>
  )
}

/** One person: role, their mailbox (access, aliases, limits), the shared mailboxes they answer, and removal. */
function PersonSheet(props: {
  member: TeamMember | null
  team: Team
  setup: MailSetup
  act: Act
  refresh: () => Promise<void>
  onClose: () => void
  onGiveMailbox: (userId: string) => void
  onCredentials: (c: Credentials) => void
}) {
  const { member: m, team, setup, act, refresh, onClose } = props
  const boxes = m ? setup.mailboxes.filter((b) => b.kind === "personal" && b.userId === m.userId) : []
  const answers = m ? setup.mailboxes.filter((b) => b.kind === "shared" && b.access.includes(m.userId)) : []
  const editable = !!m && !m.isMe && m.role !== "owner"
  return (
    <Sheet open={!!m} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {m ? (
          <>
            <SheetHeader className="border-border/60 border-b pr-12">
              <div className="flex items-center gap-3">
                <UserAvatar seed={m.email} size={40} />
                <div className="grid min-w-0">
                  <SheetTitle className="truncate">{m.name}</SheetTitle>
                  <SheetDescription className="truncate">{m.email}</SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="grid gap-8 p-4">
              <section className="grid gap-3">
                <SheetSectionTitle title={t("Role")} />
                {team.canChangeRoles && editable ? (
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
                    <SelectTrigger className="w-40" aria-label={t("Role of {name}", { name: m.name })}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleName(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{roleName(m.role)}</p>
                )}
              </section>

              {boxes.map((box) => (
                <React.Fragment key={box.id}>
                  <div className="border-border/60 -mb-4 flex items-center gap-2 border-t pt-6">
                    <Inbox className="text-muted-foreground size-4 shrink-0" />
                    <h3 className="min-w-0 truncate text-sm font-semibold">{box.address}</h3>
                    {box.mailOnly ? <Badge variant="secondary">{t("Mail only")}</Badge> : null}
                  </div>
                  <MailboxDetails
                    mailbox={box}
                    setup={setup}
                    act={act}
                    ops={mailboxOps(box, act, { onShared: onClose, onReset: (c) => props.onCredentials({ ...c, reset: true }), onDeleted: () => {} })}
                  />
                </React.Fragment>
              ))}
              {!boxes.length && setup.domains.length ? (
                <section className="grid gap-3">
                  <SheetSectionTitle title={t("Mailbox")} description={t("{name} has no address on your domains yet.", { name: m.name })} />
                  <div>
                    <Button variant="outline" size="sm" onClick={() => props.onGiveMailbox(m.userId)}>
                      <Plus /> {t("Give a mailbox")}
                    </Button>
                  </div>
                </section>
              ) : null}

              {m.role === "member" ? (
                <section className="grid gap-3">
                  <SheetSectionTitle title={t("Shared mailboxes")} description={t("Pick who answers each one under People → Shared mailboxes.")} />
                  {answers.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {answers.map((b) => <li key={b.id}><Badge variant="secondary">{b.address}</Badge></li>)}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">{t("None yet.")}</p>
                  )}
                </section>
              ) : null}

              {team.canManage && editable ? (
                <section className="border-border/60 grid gap-3 border-t pt-6">
                  <SheetSectionTitle title={t("Remove from organization")} description={t("They lose access right away. Their personal mailbox becomes shared and keeps its mail and aliases.")} />
                  <div>
                    <ConfirmButton
                      title={t("Remove {name}?", { name: m.name })}
                      description={t("They lose access right away. Their personal mailbox becomes shared and keeps its mail and aliases.")}
                      confirmLabel={t("Remove")}
                      onConfirm={async () => {
                        if (await run(authClient.organization.removeMember({ memberIdOrEmail: m.id }), t("{name} removed", { name: m.name }), refresh)) onClose()
                      }}
                    >
                      <Button variant="outline" size="sm" className="text-destructive">
                        <UserMinus /> {t("Remove")}
                      </Button>
                    </ConfirmButton>
                  </div>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
