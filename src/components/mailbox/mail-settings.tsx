import * as React from "react"
import { AtSign, CheckCircle2, Globe, Inbox, KeyRound, Plus, RefreshCw, UserPlus, Users, XCircle } from "lucide-react"
import { toast } from "sonner"

import type { DnsRecord } from "@/lib/mail/rules"
import { api } from "@/lib/api-client"
import { useLiveData } from "@/lib/use-live-data"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmButton } from "@/components/app/confirm-button"
import { CopyField } from "@/components/app/copy-field"
import { SettingsSection } from "@/components/app/settings-section"

export interface MailSetup {
  domains: {
    id: string
    domain: string
    status: "pending" | "active" | "failing"
    checks: Record<string, boolean>
    checkedAt: string | null
    catchAllMailboxId: string | null
    records: DnsRecord[]
  }[]
  mailboxes: { id: string; domainId: string; address: string; kind: "personal" | "shared"; userId: string | null; displayName: string; access: string[]; mailOnly?: boolean }[]
  aliases: { id: string; address: string; mailboxId: string }[]
  members: { userId: string; name: string; email: string; role: string }[]
}

const NONE = "__none__"

async function run(body: Record<string, unknown>, ok?: string) {
  try {
    const res = await api("POST", "/api/app/mail/settings", body)
    if (ok) toast.success(ok)
    return res
  } catch (e) {
    toast.error((e as Error).message)
    throw e
  }
}

/** Settings → Mail: the org's domains, mailboxes and aliases (owners and admins). */
export function MailSettings(props: { initial: MailSetup }) {
  const [setup, refresh] = useLiveData<MailSetup>("/api/app/mail/settings", props.initial)
  const act = async (body: Record<string, unknown>, ok?: string) => {
    await run(body, ok).catch(() => null)
    await refresh()
  }
  return (
    <div className="grid gap-12">
      <DomainsSection setup={setup} act={act} />
      <MailboxesSection setup={setup} act={act} refresh={refresh} />
      <AliasesSection setup={setup} act={act} />
    </div>
  )
}

type Act = (body: Record<string, unknown>, ok?: string) => Promise<void>

function StatusBadge({ status }: { status: MailSetup["domains"][number]["status"] }) {
  const map = {
    active: ["bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", "Receiving mail"],
    pending: ["bg-amber-500/15 text-amber-700 dark:text-amber-400", "Waiting for DNS"],
    failing: ["bg-destructive/10 text-destructive", "DNS changed"],
  } as const
  const [cls, label] = map[status]
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>{label}</span>
}

function DomainsSection({ setup, act }: { setup: MailSetup; act: Act }) {
  const [domain, setDomain] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  return (
    <SettingsSection
      title="Domains"
      description="The domains your addresses live on. Point their MX records at Cloudflare Email Routing and add a catch-all rule that sends mail to this Worker."
    >
      <div className="grid gap-4">
        {setup.domains.map((d) => (
          <div key={d.id} className="bg-surface grid gap-4 rounded-2xl px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium">
                <Globe className="text-muted-foreground size-4" /> {d.domain} <StatusBadge status={d.status} />
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === d.id}
                  onClick={async () => {
                    setBusy(d.id)
                    await act({ action: "domain.check", domainId: d.id })
                    setBusy(null)
                  }}
                >
                  <RefreshCw className={cn(busy === d.id && "animate-spin")} /> Check DNS
                </Button>
                <ConfirmButton title={`Remove ${d.domain}?`} description="Only a domain without mailboxes can be removed." confirmLabel="Remove" onConfirm={() => act({ action: "domain.remove", domainId: d.id }, "Domain removed")}>
                  <Button variant="ghost" size="sm" className="text-destructive">
                    Remove
                  </Button>
                </ConfirmButton>
              </div>
            </div>
            {d.status !== "active" ? (
              <p className="text-muted-foreground text-xs">
                Add these records at your DNS provider. On Cloudflare, turning on Email Routing for the domain adds them for you (any MX priority works).
              </p>
            ) : null}
            {d.status === "active" ? (
              // Working domains keep their records out of the way; they're only needed when something breaks.
              <details className="group/dns">
                <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs select-none">DNS records</summary>
                <div className="pt-3">
                  <ul className="grid gap-2 text-sm">
              {d.records.map((r, i) => {
                const ok = d.checks[r.purpose]
                return (
                  <li key={i} className="grid gap-1 md:grid-cols-[6rem_1fr] md:items-center">
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      {ok ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <XCircle className="text-muted-foreground size-3.5" />}
                      {r.type}
                      {r.priority ? ` ${r.priority}` : ""}
                    </span>
                    <CopyField label={r.name === d.domain ? `${r.type} record` : r.name} value={r.value} />
                  </li>
                )
              })}
                  </ul>
                </div>
              </details>
            ) : (
            <ul className="grid gap-2 text-sm">
              {d.records.map((r, i) => {
                const ok = d.checks[r.purpose]
                return (
                  <li key={i} className="grid gap-1 md:grid-cols-[6rem_1fr] md:items-center">
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      {ok ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <XCircle className="text-muted-foreground size-3.5" />}
                      {r.type}
                      {r.priority ? ` ${r.priority}` : ""}
                    </span>
                    <CopyField label={r.name === d.domain ? `${r.type} record` : r.name} value={r.value} />
                  </li>
                )
              })}
            </ul>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs">Mail to unknown addresses</Label>
              <Select
                value={d.catchAllMailboxId ?? NONE}
                onValueChange={(v) => act({ action: "domain.catchAll", domainId: d.id, mailboxId: v === NONE ? null : v }, "Saved")}
              >
                <SelectTrigger className="w-full md:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Reject it</SelectItem>
                  {setup.mailboxes
                    .filter((m) => m.domainId === d.id)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        Deliver to {m.address}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!domain.trim()) return
            await act({ action: "domain.add", domain }, "Domain added")
            setDomain("")
          }}
        >
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" aria-label="Domain" />
          <Button type="submit" variant="outline">
            <Plus /> Add domain
          </Button>
        </form>
      </div>
    </SettingsSection>
  )
}

function MailboxesSection({ setup, act, refresh }: { setup: MailSetup; act: Act; refresh: () => Promise<unknown> }) {
  const [creating, setCreating] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [credentials, setCredentials] = React.useState<Credentials | null>(null)
  const [accessFor, setAccessFor] = React.useState<string | null>(null)
  const name = (userId: string | null) => setup.members.find((m) => m.userId === userId)?.name ?? "Former member"
  return (
    <SettingsSection title="Mailboxes" description="A personal mailbox for each member, and shared ones like support@ that several people answer.">
      <div className="grid gap-3">
        {setup.mailboxes.length ? (
          <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
            {setup.mailboxes.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {m.kind === "shared" ? <Users className="text-muted-foreground size-3.5" /> : <Inbox className="text-muted-foreground size-3.5" />}
                    {m.address}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {m.kind === "personal" ? name(m.userId) : `Shared · ${m.access.length} ${m.access.length === 1 ? "member" : "members"} + owners and admins`}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {m.mailOnly ? (
                    <ConfirmButton
                      title={`New password for ${m.address}?`}
                      description="They're signed out everywhere and sign in again with the temporary password you get next."
                      confirmLabel="Reset password"
                      onConfirm={async () => {
                        const res = (await run({ action: "person.resetPassword", mailboxId: m.id }).catch(() => null)) as Credentials | null
                        if (res) setCredentials({ ...res, reset: true })
                      }}
                    >
                      <Button variant="ghost" size="sm">
                        <KeyRound /> Reset password
                      </Button>
                    </ConfirmButton>
                  ) : null}
                  {m.kind === "shared" ? (
                    <Button variant="ghost" size="sm" onClick={() => setAccessFor(m.id)}>
                      Members
                    </Button>
                  ) : (
                    <ConfirmButton
                      title={`Make ${m.address} shared?`}
                      description="Its mail stays. Owners and admins, and the members you pick, can open it. Use this when someone leaves."
                      confirmLabel="Make shared"
                      onConfirm={async () => {
                        await act({ action: "mailbox.update", mailboxId: m.id, kind: "shared" }, "Now a shared mailbox")
                        // Next: who answers it (nobody but owners and admins until picked).
                        setAccessFor(m.id)
                      }}
                    >
                      <Button variant="ghost" size="sm">
                        Make shared
                      </Button>
                    </ConfirmButton>
                  )}
                  <ConfirmButton
                    title={`Delete ${m.address}?`}
                    description="All its mail and files are deleted. This can't be undone."
                    confirmLabel="Delete mailbox"
                    onConfirm={() => act({ action: "mailbox.delete", mailboxId: m.id, force: true }, "Mailbox deleted")}
                  >
                    <Button variant="ghost" size="sm" className="text-destructive">
                      Delete
                    </Button>
                  </ConfirmButton>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!setup.domains.length} onClick={() => setAdding(true)}>
            <UserPlus /> Add person
          </Button>
          <Button variant="outline" disabled={!setup.domains.length} onClick={() => setCreating(true)}>
            <Plus /> New mailbox
          </Button>
        </div>
        {!setup.domains.length ? <p className="text-muted-foreground text-xs">Add a domain first.</p> : null}
      </div>
      <NewMailboxDialog open={creating} onOpenChange={setCreating} setup={setup} act={act} />
      <AddPersonDialog
        open={adding}
        onOpenChange={setAdding}
        setup={setup}
        onAdded={async (c) => {
          setAdding(false)
          setCredentials(c)
          await refresh()
        }}
      />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
      <AccessDialog mailbox={setup.mailboxes.find((m) => m.id === accessFor) ?? null} members={setup.members} onClose={() => setAccessFor(null)} act={act} />
    </SettingsSection>
  )
}

function suggest(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ł/g, "l")
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "") || ""
  )
}

function NewMailboxDialog({ open, onOpenChange, setup, act }: { open: boolean; onOpenChange: (o: boolean) => void; setup: MailSetup; act: Act }) {
  const withoutBox = setup.members.filter((m) => !setup.mailboxes.some((b) => b.kind === "personal" && b.userId === m.userId))
  const [kind, setKind] = React.useState<"personal" | "shared">("personal")
  const [userId, setUserId] = React.useState("")
  const [local, setLocal] = React.useState("")
  const [domainId, setDomainId] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  React.useEffect(() => {
    if (!open) return
    const first = withoutBox[0]
    setKind(first ? "personal" : "shared")
    setUserId(first?.userId ?? "")
    setLocal(first ? suggest(first.name) : "")
    setDisplayName(first?.name ?? "")
    setDomainId(setup.domains[0]?.id ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const domain = setup.domains.find((d) => d.id === domainId)?.domain ?? ""
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New mailbox</DialogTitle>
          <DialogDescription>Mail to this address arrives as soon as the domain receives mail.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            await act({ action: "mailbox.create", kind, userId: kind === "personal" ? userId : undefined, local, domainId, displayName }, "Mailbox created")
            onOpenChange(false)
          }}
        >
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "personal" | "shared")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal: one member's mailbox</SelectItem>
                <SelectItem value="shared">Shared: support@, sales@…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "personal" ? (
            <div className="grid gap-1.5">
              <Label>Member</Label>
              <Select
                value={userId}
                onValueChange={(v) => {
                  setUserId(v)
                  const m = setup.members.find((x) => x.userId === v)
                  if (m) {
                    setLocal(suggest(m.name))
                    setDisplayName(m.name)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Everyone has a mailbox" />
                </SelectTrigger>
                <SelectContent>
                  {withoutBox.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name} · {m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="mb-local">Address</Label>
            <div className="flex items-center gap-2">
              <Input id="mb-local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder={kind === "shared" ? "support" : "anna"} />
              <AtSign className="text-muted-foreground size-4 shrink-0" />
              {setup.domains.length > 1 ? (
                <Select value={domainId} onValueChange={setDomainId}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {setup.domains.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm">{domain}</span>
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mb-name">Sender name</Label>
            <Input id="mb-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={kind === "shared" ? "Acme Support" : "Anna Kowalska"} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!local || !domainId || (kind === "personal" && !userId)}>
              Create mailbox
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface Credentials {
  address: string
  password: string
  reset?: boolean
}

function AddPersonDialog({ open, onOpenChange, setup, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; setup: MailSetup; onAdded: (c: Credentials) => void }) {
  const shared = setup.mailboxes.filter((m) => m.kind === "shared")
  const [name, setName] = React.useState("")
  const [local, setLocal] = React.useState("")
  const [touched, setTouched] = React.useState(false)
  const [domainId, setDomainId] = React.useState("")
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [pending, setPending] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setName("")
    setLocal("")
    setTouched(false)
    setPicked(new Set())
    setDomainId(setup.domains.find((d) => d.status === "active")?.id ?? setup.domains[0]?.id ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const domain = setup.domains.find((d) => d.id === domainId)?.domain ?? ""
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
          <DialogDescription>They get an address on your domain and see only their mail. You'll get a temporary password to hand over.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            const res = (await run({ action: "person.add", name, domainId, local, sharedMailboxIds: [...picked] }).catch(() => null)) as Credentials | null
            setPending(false)
            if (res) onAdded(res)
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="person-name">Name</Label>
            <Input
              id="person-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                // The address follows the name ("Diana Nowak" → diana) until it's edited by hand.
                if (!touched) setLocal(suggest(e.target.value.split(/\s+/)[0] ?? ""))
              }}
              placeholder="Diana Nowak"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="person-local">Address</Label>
            <div className="flex items-center gap-2">
              <Input
                id="person-local"
                value={local}
                onChange={(e) => {
                  setLocal(e.target.value)
                  setTouched(true)
                }}
                placeholder="diana"
              />
              <AtSign className="text-muted-foreground size-4 shrink-0" />
              {setup.domains.length > 1 ? (
                <Select value={domainId} onValueChange={setDomainId}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {setup.domains.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm">{domain}</span>
              )}
            </div>
          </div>
          {shared.length ? (
            <div className="grid gap-1.5">
              <Label>Also answers</Label>
              <ul className="grid gap-1">
                {shared.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={picked.has(m.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(picked)
                          if (v === true) next.add(m.id)
                          else next.delete(m.id)
                          setPicked(next)
                        }}
                      />
                      {m.address}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" loading={pending} disabled={pending || !name.trim() || !local || !domainId}>
              Add person
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Shown once: the sign-in details to hand over. The password is never shown again. */
function CredentialsDialog({ credentials, onClose }: { credentials: Credentials | null; onClose: () => void }) {
  const url = typeof location === "undefined" ? "" : `${location.origin}/login`
  const text = credentials ? `Sign in at ${url}\nE-mail: ${credentials.address}\nTemporary password: ${credentials.password}\nChange the password after you sign in.` : ""
  return (
    <Dialog open={!!credentials} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{credentials?.reset ? "New temporary password" : `${credentials?.address} is ready`}</DialogTitle>
          <DialogDescription>Hand these over in person or through a channel you trust. The password won't be shown again.</DialogDescription>
        </DialogHeader>
        {credentials ? (
          <div className="grid gap-3">
            <CopyField label="Sign-in page" value={url} />
            <CopyField label="E-mail" value={credentials.address} />
            <CopyField label="Temporary password" value={credentials.password} />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))}>
            Copy all
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AccessDialog({ mailbox, members, onClose, act }: { mailbox: MailSetup["mailboxes"][number] | null; members: MailSetup["members"]; onClose: () => void; act: Act }) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  React.useEffect(() => setPicked(new Set(mailbox?.access ?? [])), [mailbox])
  const regular = members.filter((m) => m.role === "member")
  return (
    <Dialog open={!!mailbox} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Who can open {mailbox?.address}</DialogTitle>
          <DialogDescription>Owners and admins always can. Pick the members who read and answer this mailbox.</DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-80 gap-2 overflow-y-auto">
          {regular.length ? (
            regular.map((m) => (
              <li key={m.userId}>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={picked.has(m.userId)}
                    onCheckedChange={(v) =>
                      setPicked((s) => {
                        const n = new Set(s)
                        if (v) n.add(m.userId)
                        else n.delete(m.userId)
                        return n
                      })
                    }
                  />
                  <span>
                    {m.name} <span className="text-muted-foreground">· {m.email}</span>
                  </span>
                </label>
              </li>
            ))
          ) : (
            <li className="text-muted-foreground text-sm">Everyone in the organization is an owner or admin.</li>
          )}
        </ul>
        <DialogFooter>
          <Button
            onClick={async () => {
              await act({ action: "mailbox.access", mailboxId: mailbox!.id, userIds: [...picked] }, "Saved")
              onClose()
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AliasesSection({ setup, act }: { setup: MailSetup; act: Act }) {
  const [local, setLocal] = React.useState("")
  const [domainId, setDomainId] = React.useState(setup.domains[0]?.id ?? "")
  const [mailboxId, setMailboxId] = React.useState(setup.mailboxes[0]?.id ?? "")
  React.useEffect(() => {
    if (!domainId && setup.domains[0]) setDomainId(setup.domains[0].id)
    if (!mailboxId && setup.mailboxes[0]) setMailboxId(setup.mailboxes[0].id)
  }, [setup, domainId, mailboxId])
  if (!setup.mailboxes.length) return null
  const target = (id: string) => setup.mailboxes.find((m) => m.id === id)?.address ?? ""
  return (
    <SettingsSection title="Aliases" description="More addresses that deliver into a mailbox, like hello@ into anna@. Replies still go out from the mailbox's address.">
      <div className="grid gap-3">
        {setup.aliases.length ? (
          <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
            {setup.aliases.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span>
                  {a.address} <span className="text-muted-foreground">→ {target(a.mailboxId)}</span>
                </span>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => act({ action: "alias.remove", aliasId: a.id }, "Alias removed")}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            await act({ action: "alias.add", local, domainId, mailboxId }, "Alias added")
            setLocal("")
          }}
        >
          <Input className="w-32" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="hello" aria-label="Alias" />
          <span className="text-muted-foreground text-sm">@</span>
          <Select value={domainId} onValueChange={setDomainId}>
            <SelectTrigger className="w-40" aria-label="Domain">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {setup.domains.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-sm">→</span>
          <Select value={mailboxId} onValueChange={setMailboxId}>
            <SelectTrigger className="w-56" aria-label="Mailbox">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {setup.mailboxes.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline" disabled={!local}>
            <Plus /> Add
          </Button>
        </form>
      </div>
    </SettingsSection>
  )
}
