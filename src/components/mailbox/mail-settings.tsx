import * as React from "react"
import { AtSign, CheckCircle2, ChevronRight, Clock, Globe, Inbox, KeyRound, Plus, RefreshCw, Settings2, Trash2, Users, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { SendingLimits } from "./sending-limits"
import { StorageSettings } from "./storage-settings"
import { MailImport } from "./mail-import"
import { SignatureTemplate } from "./signature-template"
import type { SignatureBrand } from "@/lib/mail/signature"
import type { DnsRecord } from "@/lib/mail/rules"
import { api } from "@/lib/api-client"
import { tapllEvent } from "@/lib/tapll"
import { useLiveData } from "@/lib/use-live-data"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ConfirmButton } from "@/components/app/confirm-button"
import { CopyField } from "@/components/app/copy-field"
import { EmptyState } from "@/components/app/empty-state"
import { SettingsSection } from "@/components/app/settings-section"
import { SettingsTabs } from "@/components/settings/settings-tabs"
import { useSettingsDraft } from "@/components/settings/settings-draft"
import { ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import { appLocale, t, tp } from "@/lib/i18n/panel"

export interface MailSetup {
  domains: {
    id: string
    domain: string
    status: "pending" | "active" | "failing"
    provider: "cloudflare" | "ses"
    /** subdomain: a free address under our domain, set up by us. */
    kind: "subdomain" | "custom"
    checks: Record<string, boolean>
    checkedAt: string | null
    catchAllMailboxId: string | null
    records: DnsRecord[]
  }[]
  mailboxes: { id: string; domainId: string; address: string; kind: "personal" | "shared"; userId: string | null; displayName: string; access: string[]; mailOnly?: boolean }[]
  aliases: { id: string; address: string; mailboxId: string }[]
  members: { userId: string; name: string; email: string; role: string }[]
  signatureBrand: SignatureBrand
  /** The domain free addresses live under, while the org has none (hosted). */
  subdomainBase: string | null
}

type Domain = MailSetup["domains"][number]
type Mailbox = MailSetup["mailboxes"][number]

const NONE = "__none__"
/** How often a domain still waiting for DNS is checked while the page is open. */
const AUTO_CHECK_MS = 60_000

export async function run(body: Record<string, unknown>, ok?: string) {
  const checking = body.action === "domain.check"
  if (checking) tapllEvent("domain_check_started")
  try {
    const res = await api("POST", "/api/app/mail/settings", body)
    if (checking) {
      if ((res as { status: string }).status === "active") tapllEvent("domain_check_completed")
      else tapllEvent("domain_check_failed", { reason: "dns_incomplete" })
    }
    if (ok) toast.success(ok)
    return res
  } catch (e) {
    if (checking) tapllEvent("domain_check_failed", { reason: "request_failed" })
    toast.error((e as Error).message)
    throw e
  }
}

/** Admin → Mail: domains, import and org-wide sending. People and shared mailboxes live in Admin → People (people-panel.tsx). */
export function MailSettings(props: { initial: MailSetup }) {
  const [setup, refresh] = useLiveData<MailSetup>("/api/app/mail/settings", props.initial)
  const act: Act = async (body, ok) => {
    await run(body, ok).catch(() => null)
    await refresh()
  }
  return (
    <SettingsTabs
      label={t("Mail administration")}
      // Older links: mailboxes and their limits moved to Admin → People, the signature sits next to org-wide sending.
      aliases={{ limits: "domains", mailboxes: "domains", branding: "organization" }}
      tabs={[
        { id: "domains", label: t("Domains"), content: <DomainsSection setup={setup} act={act} refresh={refresh} /> },
        { id: "import", label: t("Import"), content: <MailImport mailboxes={setup.mailboxes} /> },
        {
          id: "organization",
          label: t("Signature and sending"),
          content: (
            <>
              <SignatureTemplate key={JSON.stringify(setup.signatureBrand)} initial={setup.signatureBrand} onSaved={refresh} />
              <SendingLimits mailboxes={[]} />
            </>
          ),
        },
      ]}
    />
  )
}

export type Act = (body: Record<string, unknown>, ok?: string) => Promise<void>

/* ───────────────────────────── Mailboxes ───────────────────────────── */

/** Admin → People → Shared mailboxes: support@ and the like, plus personal ones whose owner left. */
export function SharedMailboxes({ setup, act }: { setup: MailSetup; act: Act }) {
  const [creating, setCreating] = React.useState(false)
  const [credentials, setCredentials] = React.useState<Credentials | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const name = (userId: string | null) => setup.members.find((m) => m.userId === userId)?.name ?? t("Former member")
  const ops = (m: Mailbox) =>
    mailboxOps(m, act, {
      onShared: () => setOpenId(m.id),
      onReset: (c) => setCredentials({ ...c, reset: true }),
      onDeleted: () => setOpenId(null),
    })
  const opened = setup.mailboxes.find((m) => m.id === openId) ?? null
  const boxes = setup.mailboxes.filter((m) => m.kind === "shared" || !setup.members.some((p) => p.userId === m.userId))
  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus /> {t("New shared mailbox")}
    </Button>
  )
  return (
    <SettingsSection title={t("Shared mailboxes")} description={t("Addresses like support@ that several people answer. Click one to pick who reads it.")}>
      {!setup.domains.length ? (
        <EmptyState
          variant="plain"
          density="compact"
          icon={<Globe />}
          title={t("Add a domain first")}
          description={t("Every address lives on a domain. Add yours, or start on a free one.")}
          action={
            <Button asChild>
              <a href="/admin/mail#domains">{t("Go to Domains")}</a>
            </Button>
          }
        />
      ) : !boxes.length ? (
        <EmptyState variant="plain" density="compact" icon={<Users />} title={t("No shared mailboxes yet")} description={t("Make one for support@, sales@ or anything a few people answer together.")} action={newButton} />
      ) : (
        <div className="grid gap-3">
          <ul className="bg-surface divide-border/60 divide-y overflow-hidden rounded-2xl">
            {boxes.map((m) => {
              const aliases = setup.aliases.filter((a) => a.mailboxId === m.id).length
              const catchAll = setup.domains.some((d) => d.catchAllMailboxId === m.id)
              return (
                <li key={m.id} className="hover:bg-accent/40 flex items-center gap-1 pr-3 transition-colors">
                  <button
                    type="button"
                    onClick={() => setOpenId(m.id)}
                    className="focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 py-3 pl-5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
                  >
                    {m.kind === "shared" ? <Users className="text-muted-foreground size-4 shrink-0" /> : <Inbox className="text-muted-foreground size-4 shrink-0" />}
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm font-medium">{m.address}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {m.kind === "personal"
                          ? m.access.length
                            ? tp(m.access.length, { one: "{name} · also {n} person", other: "{name} · also {n} people" }, { name: name(m.userId) })
                            : name(m.userId)
                          : tp(m.access.length, { one: "Shared · {n} member + owners and admins", other: "Shared · {n} members + owners and admins" })}
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1 sm:flex">
                      {aliases ? <Badge variant="secondary">{tp(aliases, { one: "{n} alias", other: "{n} aliases" })}</Badge> : null}
                      {catchAll ? <Badge variant="secondary">{t("Catch-all")}</Badge> : null}
                    </span>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </button>
                  <ActionMenuButton
                    size="icon-sm"
                    label={t("More for {address}", { address: m.address })}
                    actions={() => [
                      { label: t("Settings"), icon: Settings2, onSelect: () => setOpenId(m.id) },
                      { separator: true },
                      ...ops(m).map(({ label, icon, destructive, confirm, run }): MenuAction => ({ label, icon, destructive, confirm, onSelect: run })),
                    ]}
                  />
                </li>
              )
            })}
          </ul>
          <div>{newButton}</div>
        </div>
      )}
      <NewMailboxDialog who={creating ? "shared" : null} onClose={() => setCreating(false)} setup={setup} act={act} onAdded={setCredentials} />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
      <MailboxSheet mailbox={opened} setup={setup} act={act} ops={opened ? ops(opened) : []} onClose={() => setOpenId(null)} />
    </SettingsSection>
  )
}

export interface MailboxOp {
  label: string
  icon: typeof Trash2
  destructive?: boolean
  confirm: { title: string; description: string; confirmLabel: string }
  run: () => Promise<void>
}

/** The actions on one mailbox, shared by its row's "…" menu and its sheet. */
export function mailboxOps(m: Mailbox, act: Act, on: { onShared: () => void; onReset: (c: Credentials) => void; onDeleted: () => void }): MailboxOp[] {
  const ops: MailboxOp[] = []
  if (m.mailOnly)
    ops.push({
      label: t("Reset password"),
      icon: KeyRound,
      confirm: { title: t("New password for {address}?", { address: m.address }), description: t("They're signed out everywhere and sign in again with the temporary password you get next."), confirmLabel: t("Reset password") },
      run: async () => {
        const res = (await run({ action: "person.resetPassword", mailboxId: m.id }).catch(() => null)) as Credentials | null
        if (res) on.onReset(res)
      },
    })
  if (m.kind === "personal")
    ops.push({
      label: t("Make shared"),
      icon: Users,
      confirm: { title: t("Make {address} shared?", { address: m.address }), description: t("Its mail stays. Owners and admins, and the members you pick, can open it. Use this when someone leaves."), confirmLabel: t("Make shared") },
      run: async () => {
        await act({ action: "mailbox.update", mailboxId: m.id, kind: "shared" }, t("Now a shared mailbox"))
        // Next: who answers it (nobody but owners and admins until picked), in its sheet.
        on.onShared()
      },
    })
  ops.push({
    label: t("Delete mailbox"),
    icon: Trash2,
    destructive: true,
    confirm: { title: t("Delete {name}?", { name: m.address }), description: t("All its mail and files are deleted. This can't be undone."), confirmLabel: t("Delete mailbox") },
    run: async () => {
      await act({ action: "mailbox.delete", mailboxId: m.id, force: true }, t("Mailbox deleted"))
      on.onDeleted()
    },
  })
  return ops
}

/** One mailbox in a side sheet. */
function MailboxSheet({ mailbox, setup, act, ops, onClose }: { mailbox: Mailbox | null; setup: MailSetup; act: Act; ops: MailboxOp[]; onClose: () => void }) {
  const owner = setup.members.find((m) => m.userId === mailbox?.userId)?.name ?? t("Former member")
  return (
    <Sheet open={!!mailbox} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {mailbox ? (
          <>
            <SheetHeader className="border-border/60 border-b pr-12">
              <SheetTitle className="flex items-center gap-2 break-all">
                {mailbox.kind === "shared" ? <Users className="text-muted-foreground size-4 shrink-0" /> : <Inbox className="text-muted-foreground size-4 shrink-0" />}
                {mailbox.address}
              </SheetTitle>
              <SheetDescription>{mailbox.kind === "shared" ? t("Shared mailbox") : t("Personal mailbox of {name}", { name: owner })}</SheetDescription>
            </SheetHeader>
            <div className="grid gap-8 p-4">
              <MailboxDetails mailbox={mailbox} setup={setup} act={act} ops={ops} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/** Everything about one mailbox: who opens it, its aliases, its limits, and the risky actions (also in a person's sheet). */
export function MailboxDetails({ mailbox, setup, act, ops }: { mailbox: Mailbox; setup: MailSetup; act: Act; ops: MailboxOp[] }) {
  return (
    <>
      <AccessEditor key={`${mailbox.id}:${mailbox.kind}`} mailbox={mailbox} members={setup.members} act={act} />
      <MailboxAliases key={mailbox.id} mailbox={mailbox} setup={setup} act={act} />
      <div className="grid gap-4">
        <SendingLimits mailboxes={[mailbox]} organization={false} />
        <StorageSettings mailboxes={[mailbox]} />
      </div>
      <section className="grid gap-3">
        <SheetSectionTitle title={t("Manage mailbox")} />
        <div className="flex flex-wrap gap-2">
          {ops.map((op) => (
            <ConfirmButton key={op.label} title={op.confirm.title} description={op.confirm.description} confirmLabel={op.confirm.confirmLabel} onConfirm={op.run}>
              <Button variant="outline" size="sm" className={cn(op.destructive && "text-destructive")}>
                <op.icon /> {op.label}
              </Button>
            </ConfirmButton>
          ))}
        </div>
      </section>
    </>
  )
}

export function SheetSectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid gap-1">
      <h3 className="text-sm font-medium">{title}</h3>
      {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
    </div>
  )
}

function AccessEditor({ mailbox, members, act }: { mailbox: Mailbox; members: MailSetup["members"]; act: Act }) {
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set(mailbox.access))
  const [busy, setBusy] = React.useState(false)
  const saved = mailbox.access.join()
  React.useEffect(() => setPicked(new Set(mailbox.access)), [saved]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = picked.size !== mailbox.access.length || mailbox.access.some((id) => !picked.has(id))
  useSettingsDraft(dirty, busy)
  // A personal mailbox is delegated to anyone but its owner (admins too: then it's in their inbox and bell).
  const personal = mailbox.kind === "personal"
  const regular = members.filter((m) => (personal ? m.userId !== mailbox.userId : m.role === "member"))
  return (
    <section className="grid gap-3">
      <SheetSectionTitle
        title={t("Who can open it")}
        description={
          personal
            ? t("Its owner signs in with it. The people you pick also see it in their inbox and notifications, and can answer from it. Owners and admins can always open it.")
            : t("Owners and admins always can. Pick the members who read and answer this mailbox.")
        }
      />
      {regular.length ? (
        <ul className="bg-surface divide-border/60 grid max-h-72 divide-y overflow-y-auto rounded-xl">
          {regular.map((m) => (
            <li key={m.userId}>
              <label className="flex items-center gap-3 px-4 py-2.5 text-sm">
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
                <span className="min-w-0 truncate">
                  {m.name} <span className="text-muted-foreground">· {m.email}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("Everyone in the organization is an owner or admin.")}</p>
      )}
      {regular.length ? (
        <div>
          <Button
            size="sm"
            disabled={!dirty || busy}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              await act({ action: "mailbox.access", mailboxId: mailbox.id, userIds: [...picked] }, t("Saved"))
              setBusy(false)
            }}
          >
            {t("Save")}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function MailboxAliases({ mailbox, setup, act }: { mailbox: Mailbox; setup: MailSetup; act: Act }) {
  const [local, setLocal] = React.useState("")
  const [domainId, setDomainId] = React.useState(mailbox.domainId)
  useSettingsDraft(!!local.trim())
  const aliases = setup.aliases.filter((a) => a.mailboxId === mailbox.id)
  return (
    <section className="grid gap-3">
      <SheetSectionTitle title={t("Aliases")} description={t("More addresses that deliver here, like hello@. Replies still go out from {address}.", { address: mailbox.address })} />
      {aliases.length ? (
        <ul className="bg-surface divide-border/60 divide-y rounded-xl">
          {aliases.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-1.5 pr-2 pl-4 text-sm">
              <span className="min-w-0 truncate">{a.address}</span>
              <Button variant="ghost" size="icon-sm" aria-label={t("Remove {address}", { address: a.address })} title={t("Remove")} onClick={() => act({ action: "alias.remove", aliasId: a.id }, t("Alias removed"))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!local.trim()) return
          await act({ action: "alias.add", local, domainId, mailboxId: mailbox.id }, t("Alias added"))
          setLocal("")
        }}
      >
        <Input className="min-w-28 flex-1" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="hello" aria-label={t("Alias")} />
        <AtSign className="text-muted-foreground size-4 shrink-0" />
        <DomainPicker domains={setup.domains} value={domainId} onChange={setDomainId} />
        <Button type="submit" variant="outline" disabled={!local.trim()}>
          <Plus /> {t("Add")}
        </Button>
      </form>
    </section>
  )
}

/** The domain half of an address: a select with several domains, plain text with one. */
function DomainPicker({ domains, value, onChange }: { domains: Domain[]; value: string; onChange: (id: string) => void }) {
  if (domains.length < 2) return <span className="text-sm">{domains.find((d) => d.id === value)?.domain ?? domains[0]?.domain ?? ""}</span>
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44" aria-label={t("Domain")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {domains.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.domain}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export type Who = "person" | "member" | "shared"

/**
 * Makes a mailbox: for someone new (an account on the domain with a temporary password), for a member without one
 * (`userId`), or shared. `who` null = closed.
 */
export function NewMailboxDialog({ who: asked, userId: forUser, onClose, setup, act, onAdded }: { who: Who | null; userId?: string; onClose: () => void; setup: MailSetup; act: Act; onAdded: (c: Credentials) => void }) {
  const open = !!asked
  const shared = setup.mailboxes.filter((m) => m.kind === "shared")
  const [who, setWho] = React.useState<Who>("person")
  const [name, setName] = React.useState("")
  const [userId, setUserId] = React.useState("")
  const [local, setLocal] = React.useState("")
  const [touched, setTouched] = React.useState(false)
  const [domainId, setDomainId] = React.useState("")
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [pending, setPending] = React.useState(false)
  const pickMember = (id: string) => {
    setUserId(id)
    const m = setup.members.find((x) => x.userId === id)
    setLocal(m ? suggest(m.name) : "")
    setName(m?.name ?? "")
  }
  const choose = (next: Who) => {
    setWho(next)
    setTouched(false)
    setPicked(new Set())
    if (next === "member") pickMember(forUser ?? "")
    else {
      setName("")
      setLocal("")
    }
  }
  React.useEffect(() => {
    if (!asked) return
    choose(asked)
    setDomainId(setup.domains.find((d) => d.status === "active")?.id ?? setup.domains[0]?.id ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const ready = !!local && !!domainId && (who === "person" ? !!name.trim() : who === "member" ? !!userId : true)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{who === "person" ? t("Create an account on your domain") : who === "member" ? t("Give {name} a mailbox", { name: setup.members.find((m) => m.userId === userId)?.name ?? "" }) : t("New shared mailbox")}</DialogTitle>
          <DialogDescription>
            {who === "person"
              ? t("For someone not in Work Inbox yet. They get an address on your domain and see only their mail. You'll get a temporary password to hand over.")
              : who === "member"
                ? t("They open it with their own sign-in.")
                : t("An address like support@ that several people answer. Pick who in its settings afterwards.")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            if (who === "person") {
              const res = (await run({ action: "person.add", name, domainId, local, sharedMailboxIds: [...picked] }).catch(() => null)) as Credentials | null
              setPending(false)
              if (res) {
                onClose()
                onAdded(res)
              }
              return
            }
            await act({ action: "mailbox.create", kind: who === "member" ? "personal" : "shared", userId: who === "member" ? userId : undefined, local, domainId, displayName: name }, t("Mailbox created"))
            setPending(false)
            onClose()
          }}
        >
          {who === "person" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="person-name">{t("person|Name")}</Label>
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
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="mb-local">{t("Address")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="mb-local"
                value={local}
                onChange={(e) => {
                  setLocal(e.target.value)
                  setTouched(true)
                }}
                placeholder={who === "shared" ? "support" : "diana"}
              />
              <AtSign className="text-muted-foreground size-4 shrink-0" />
              <DomainPicker domains={setup.domains} value={domainId} onChange={setDomainId} />
            </div>
          </div>
          {who === "person" ? (
            shared.length ? (
              <div className="grid gap-1.5">
                <Label>{t("Also answers")}</Label>
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
            ) : null
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="mb-name">{t("Sender name")}</Label>
              <Input id="mb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={who === "shared" ? t("Acme Support") : "Anna Kowalska"} />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" loading={pending} disabled={pending || !ready}>
              {who === "person" ? t("Add person") : t("Create mailbox")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────────────────────── Domains ───────────────────────────── */

function StatusBadge({ status }: { status: Domain["status"] }) {
  const map = {
    active: ["bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", t("Working")],
    pending: ["bg-amber-500/15 text-amber-700 dark:text-amber-400", t("Waiting for DNS records")],
    failing: ["bg-destructive/10 text-destructive", t("Records changed")],
  } as const
  const [cls, label] = map[status]
  return <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", cls)}>{label}</span>
}

function DnsRecords({ domain }: { domain: Domain }) {
  return (
    <ul className="grid gap-3 text-sm">
      {domain.records.map((r, i) => {
        const ok = domain.checks[r.purpose]
        return (
          <li key={i} className="grid gap-1.5">
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">
                {r.type}
                {r.priority ? ` ${r.priority}` : ""}
              </span>
              {r.purpose === "clients" ? (
                <span className="text-muted-foreground">{t("Optional, lets mail apps find the servers")}</span>
              ) : ok ? (
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" /> {t("Found")}
                </span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3.5" /> {t("Not found yet")}
                </span>
              )}
            </span>
            <CopyField label={r.name === domain.domain ? t("{type} record", { type: r.type }) : r.name} value={r.value} />
          </li>
        )
      })}
    </ul>
  )
}

function DomainsSection({ setup, act, refresh }: { setup: MailSetup; act: Act; refresh: () => Promise<unknown> }) {
  const [domain, setDomain] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  useSettingsDraft(!!domain.trim(), busy !== null)
  const waiting = setup.domains.filter((d) => d.status !== "active").map((d) => d.id).join()
  // Domains still waiting for DNS are checked on their own, so nobody has to keep clicking.
  React.useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return
      await Promise.all(waiting.split(",").map((domainId) => api("POST", "/api/app/mail/settings", { action: "domain.check", domainId, auto: true }).catch(() => null)))
      await refresh()
    }, AUTO_CHECK_MS)
    return () => window.clearInterval(timer)
  }, [waiting, refresh])
  return (
    <SettingsSection title={t("Domains")} description={t("The domains your addresses live on. A new domain needs a few DNS records; we check them for you.")}>
      <div className="grid gap-4">
        {setup.domains.map((d) => {
          const custom = d.kind !== "subdomain"
          const boxes = setup.mailboxes.filter((m) => m.domainId === d.id)
          return (
            <div key={d.id} className="bg-surface grid gap-4 rounded-2xl px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    <Globe className="text-muted-foreground size-4" /> <span className="min-w-0 break-all">{d.domain}</span> <StatusBadge status={d.status} />
                  </span>
                  {d.checkedAt ? (
                    <span className="text-muted-foreground text-xs">
                      {t("Last checked {time}", { time: new Date(d.checkedAt).toLocaleString(appLocale(), { dateStyle: "short", timeStyle: "short" }) })}
                    </span>
                  ) : null}
                </div>
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
                    <RefreshCw className={cn(busy === d.id && "animate-spin")} /> {t("Check now")}
                  </Button>
                  <ActionMenuButton
                    size="icon-sm"
                    label={t("More for {domain}", { domain: d.domain })}
                    actions={[
                      {
                        label: t("Remove domain"),
                        icon: Trash2,
                        destructive: true,
                        disabled: boxes.length > 0,
                        confirm: { title: t("Remove {name}?", { name: d.domain }), description: t("Only a domain without mailboxes can be removed."), confirmLabel: t("Remove") },
                        onSelect: () => act({ action: "domain.remove", domainId: d.id }, t("Domain removed")),
                      },
                    ]}
                  />
                </div>
              </div>
              {d.status === "active" ? null : !custom ? (
                <p className="text-muted-foreground text-sm">{t("Work Inbox sets this address up for you. It starts working within a few minutes; this page checks on its own.")}</p>
              ) : (
                <ol className="grid gap-3 text-sm">
                  <Step n={1}>
                    {d.provider === "ses" ? (
                      <div className="grid gap-2">
                        <span>{t("Add the records below at your DNS provider. If the domain is on Cloudflare, we can add them for you.")}</span>
                        <div>
                          <ConnectCloudflare domain={d} onDone={() => act({ action: "domain.check", domainId: d.id })} />
                        </div>
                        <span className="text-muted-foreground text-xs">{t("On Cloudflare, turn Email Routing off for the domain first: it keeps its own MX records.")}</span>
                      </div>
                    ) : (
                      t("Add the records below at your DNS provider. On Cloudflare, turning on Email Routing for the domain adds them for you (any MX priority works).")
                    )}
                  </Step>
                  <Step n={2}>
                    {d.provider === "ses"
                      ? t("This page checks every minute. Mail arrives once the MX record is found; sending starts once the DKIM records are found, usually within minutes.")
                      : t("This page checks every minute. Mail arrives once the records are found, usually within minutes.")}
                  </Step>
                </ol>
              )}
              {!custom ? null : d.status === "active" ? (
                // Working domains keep their records out of the way; they're only needed when something breaks.
                <details>
                  <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs select-none">{t("DNS records")}</summary>
                  <div className="pt-3">
                    <DnsRecords domain={d} />
                  </div>
                </details>
              ) : (
                <DnsRecords domain={d} />
              )}
              {d.status !== "pending" && boxes.length ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("Mail to unknown addresses")}</Label>
                  <Select value={d.catchAllMailboxId ?? NONE} onValueChange={(v) => act({ action: "domain.catchAll", domainId: d.id, mailboxId: v === NONE ? null : v }, t("Saved"))}>
                    <SelectTrigger className="w-full md:w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("Reject it")}</SelectItem>
                      {boxes.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {t("Deliver to {address}", { address: m.address })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          )
        })}
        {setup.subdomainBase ? <FreeAddress base={setup.subdomainBase} act={act} /> : null}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!domain.trim()) return
            await act({ action: "domain.add", domain }, t("Domain added"))
            setDomain("")
          }}
        >
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" aria-label={t("Domain")} />
          <Button type="submit" variant="outline">
            <Plus /> {t("Add domain")}
          </Button>
        </form>
      </div>
    </SettingsSection>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums">{n}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}

/** A Cloudflare API token template with the two permissions connectCloudflare needs (Zone Read, DNS Edit). */
const TOKEN_URL = `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(
  JSON.stringify([{ key: "zone", type: "read" }, { key: "dns", type: "edit" }]),
)}&name=${encodeURIComponent("Work Inbox DNS")}`

/** "Connect Cloudflare": the admin pastes an API token once and the domain's records are added for them. */
function ConnectCloudflare({ domain, onDone }: { domain: { id: string; domain: string }; onDone: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [token, setToken] = React.useState("")
  const [replaceMx, setReplaceMx] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = (await api("POST", "/api/app/mail/settings", { action: "domain.connectCloudflare", domainId: domain.id, token, replaceMx })) as { created: number }
      toast.success(r.created ? tp(r.created, { one: "Added {n} DNS record on Cloudflare", other: "Added {n} DNS records on Cloudflare" }) : t("The records were already there"))
      setOpen(false)
      setToken("")
      await onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Globe /> {t("Connect Cloudflare")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t("Add the records on Cloudflare")}</DialogTitle>
              <DialogDescription>
                {t("Is {domain} on Cloudflare? Paste an API token and Work Inbox adds the records for you. The token is used once and not stored.", { domain: domain.domain })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="cf-token">{t("API token")}</Label>
              <Input id="cf-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required minLength={20} />
              <a href={TOKEN_URL} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground w-fit text-xs underline">
                {t("Create a token with Zone Read and DNS Edit")}
              </a>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={replaceMx} onCheckedChange={(v) => setReplaceMx(v === true)} className="mt-0.5" />
              <span>{t("Replace the domain's current MX records, so its mail moves to Work Inbox")}</span>
            </label>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={busy || token.trim().length < 20}>
                {busy ? t("Connecting…") : t("Add records")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Hosted: <name>.workinbox.io right away, with the admin's own mailbox on it, before they bring a domain. */
function FreeAddress({ base, act }: { base: string; act: Act }) {
  const [name, setName] = React.useState("")
  const [local, setLocal] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const label = name.trim().toLowerCase() || "acme"
  return (
    <form
      className="bg-surface grid gap-3 rounded-2xl px-5 py-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim() || !local.trim()) return
        setBusy(true)
        await act({ action: "domain.claimSubdomain", name, local }, t("Free address created"))
        setBusy(false)
      }}
    >
      <div className="grid gap-1">
        <span className="font-medium">{t("No domain yet? Start on {base}", { base })}</span>
        <span className="text-muted-foreground text-sm">
          {t("Get {address} for your team now and add your own domain whenever you're ready.", { address: `${label}.${base}` })}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="free-local" className="text-xs">{t("Your address")}</Label>
          <Input id="free-local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="anna" className="w-36" />
        </div>
        <span className="text-muted-foreground pb-2">@</span>
        <div className="grid gap-1">
          <Label htmlFor="free-name" className="text-xs">{t("Team name")}</Label>
          <Input id="free-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="acme" className="w-40" />
        </div>
        <span className="text-muted-foreground pb-2">.{base}</span>
        <Button type="submit" disabled={busy || !name.trim() || !local.trim()}>
          {t("Create")}
        </Button>
      </div>
    </form>
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

export interface Credentials {
  address: string
  password: string
  reset?: boolean
}

/** Shown once: the sign-in details to hand over. The password is never shown again. */
export function CredentialsDialog({ credentials, onClose }: { credentials: Credentials | null; onClose: () => void }) {
  const url = typeof location === "undefined" ? "" : `${location.origin}/login`
  const text = credentials ? t("Sign in at {url}\nE-mail: {address}\nTemporary password: {password}\nChange the password after you sign in.", { url, address: credentials.address, password: credentials.password }) : ""
  return (
    <Dialog open={!!credentials} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{credentials?.reset ? t("New temporary password") : t("{address} is ready", { address: credentials?.address ?? "" })}</DialogTitle>
          <DialogDescription>{t("Hand these over in person or through a channel you trust. The password won't be shown again.")}</DialogDescription>
        </DialogHeader>
        {credentials ? (
          <div className="grid gap-3">
            <CopyField label={t("Sign-in page")} value={url} />
            <CopyField label={t("E-mail")} value={credentials.address} />
            <CopyField label={t("Temporary password")} value={credentials.password} />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success(t("Copied")))}>
            {t("Copy all")}
          </Button>
          <Button onClick={onClose}>{t("Done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}