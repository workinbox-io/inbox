import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import type { BillingDetails } from "@/lib/validation"

import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { authClient } from "@/lib/auth-client"
import { countries, countryName } from "@/lib/countries"
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
import { CopyField } from "@/components/app/copy-field"
import { DocsLink } from "@/components/app/docs-link"
import { SettingsSection } from "@/components/app/settings-section"
import { useSettingsDraft } from "@/components/settings/settings-draft"

// ---------------------------------------------------------------------------
// Name and ID
// ---------------------------------------------------------------------------

export function OrgProfileSection({ id, name: initialName, canManage }: { id: string; name: string; canManage: boolean }) {
  const [name, setName] = React.useState(initialName)
  const [saved, setSaved] = React.useState(initialName)
  const [pending, setPending] = React.useState(false)
  useSettingsDraft(name.trim() !== saved, pending)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const res = await api<{ name: string }>("PATCH", "/api/app/org", { name })
      setSaved(res.name)
      setName(res.name)
      toast.success(t("Organization renamed"))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsSection id="organization" title={t("Organization")} description={t("The workspace your mail, team and billing belong to.")}>
      <div className="grid max-w-xl gap-4">
        {canManage ? (
          <form onSubmit={save} className="grid gap-2">
            <Label htmlFor="org-name">{t("Name")}</Label>
            <div className="flex gap-2">
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required />
              <Button type="submit" variant="outline" loading={pending} disabled={pending || !name.trim() || name.trim() === saved}>
                {t("Save")}
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs">{t("Name")}</span>
            <span className="font-medium">{saved}</span>
          </div>
        )}
        <CopyField label={t("Organization ID")} value={id} />
      </div>
    </SettingsSection>
  )
}

// ---------------------------------------------------------------------------
// Company details
// ---------------------------------------------------------------------------

const FIELDS: { key: Exclude<keyof BillingDetails, "country">; label: () => string; placeholder?: string; autoComplete?: string }[] = [
  { key: "legalName", label: () => t("Legal name"), placeholder: "Acme GmbH", autoComplete: "organization" },
  { key: "vatId", label: () => t("VAT ID"), placeholder: "DE123456789" },
  { key: "addressLine1", label: () => t("Address"), autoComplete: "address-line1" },
  { key: "addressLine2", label: () => t("Address line 2"), autoComplete: "address-line2" },
  { key: "postalCode", label: () => t("Postal code"), autoComplete: "postal-code" },
  { key: "city", label: () => t("City"), autoComplete: "address-level2" },
  { key: "region", label: () => t("State or region"), autoComplete: "address-level1" },
]

export function CompanyDetailsSection({ initial, canManage }: { initial: BillingDetails; canManage: boolean }) {
  const [details, setDetails] = React.useState(initial)
  const [saved, setSaved] = React.useState(initial)
  const [pending, setPending] = React.useState(false)
  const dirty = (Object.keys(details) as (keyof BillingDetails)[]).some((k) => details[k] !== saved[k])
  useSettingsDraft(dirty, pending)
  const set = (key: keyof BillingDetails) => (value: string) => setDetails((d) => ({ ...d, [key]: value }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const res = await api<BillingDetails>("PUT", "/api/app/org/billing-details", details)
      setDetails(res)
      setSaved(res)
      toast.success(t("Company details saved"))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  const description = (
    <>
      {t("Who we bill. Invoices are issued by Paddle, our reseller: use the same name, address and VAT ID at checkout.")}{" "}
      <DocsLink href="/docs/billing">{t("Billing")}</DocsLink>
    </>
  )

  if (!canManage) {
    const lines = [
      saved.legalName,
      saved.vatId && t("VAT {id}", { id: saved.vatId }),
      saved.addressLine1,
      saved.addressLine2,
      [saved.postalCode, saved.city].filter(Boolean).join(" "),
      saved.region,
      countryName(saved.country),
    ].filter(Boolean)
    return (
      <SettingsSection id="company-details" title={t("Company details")} description={description}>
        {lines.length ? (
          <address className="bg-surface max-w-xl rounded-2xl px-5 py-4 text-sm not-italic">
            {lines.map((l) => (
              <div key={l as string}>{l}</div>
            ))}
          </address>
        ) : (
          <p className="text-muted-foreground text-sm">{t("Not set. Owners and admins can add them.")}</p>
        )}
      </SettingsSection>
    )
  }

  return (
    <SettingsSection id="company-details" title={t("Company details")} description={description}>
      <form onSubmit={save} className="grid max-w-xl gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.key.startsWith("address") || f.key === "legalName" ? "grid gap-2 sm:col-span-2" : "grid gap-2"}>
            <Label htmlFor={`bd-${f.key}`}>{f.label()}</Label>
            <Input
              id={`bd-${f.key}`}
              value={details[f.key]}
              placeholder={f.placeholder}
              autoComplete={f.autoComplete}
              onChange={(e) => set(f.key)(e.target.value)}
            />
          </div>
        ))}
        <div className="grid gap-2">
          <Label>{t("Country")}</Label>
          <Select value={details.country || undefined} onValueChange={set("country")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("Choose…")} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {countries().map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={pending} disabled={pending || !dirty}>
            {t("Save details")}
          </Button>
        </div>
      </form>
    </SettingsSection>
  )
}

// ---------------------------------------------------------------------------
// Leave, transfer, delete
// ---------------------------------------------------------------------------

interface DangerZoneProps {
  orgId: string
  orgName: string
  role: string
  /** Everyone else in the org, for "Transfer ownership". */
  others: { id: string; name: string; email: string; role: string }[]
}

export function OrgDangerZone({ orgId, orgName, role, others }: DangerZoneProps) {
  const [dialog, setDialog] = React.useState<"leave" | "transfer" | "delete" | null>(null)
  const close = () => setDialog(null)
  const owner = role === "owner"

  return (
    <SettingsSection
      id="danger-zone"
      title={t("Danger zone")}
      destructive
      description={
        <>
          {t("Leaving, handing over or deleting this organization.")} <DocsLink href="/docs/team#leaving-and-deleting">{t("How it works")}</DocsLink>
        </>
      }
    >
      <ul className="bg-surface divide-border/60 max-w-xl divide-y rounded-2xl">
        {owner ? (
          <>
            <Row
              title={t("Transfer ownership")}
              text={others.length ? t("Make another member the owner. You stay on as an admin.") : t("Invite someone first. Ownership goes to an existing member.")}
            >
              <Button variant="outline" size="sm" disabled={!others.length} onClick={() => setDialog("transfer")}>
                {t("Transfer")}
              </Button>
            </Row>
            <Row title={t("Delete organization")} text={t("Deletes all mail, API keys and the team. Cancels the subscription.")}>
              <Button variant="destructive" size="sm" onClick={() => setDialog("delete")}>
                {t("Delete")}
              </Button>
            </Row>
          </>
        ) : (
          <Row title={t("Leave organization")} text={t("You lose access to it right away. An admin can invite you back.")}>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDialog("leave")}>
              {t("Leave")}
            </Button>
          </Row>
        )}
      </ul>

      {dialog === "leave" ? <LeaveDialog orgId={orgId} orgName={orgName} onClose={close} /> : null}
      {dialog === "transfer" ? <TransferDialog orgName={orgName} others={others} onClose={close} /> : null}
      {dialog === "delete" ? <DeleteOrgDialog orgName={orgName} onClose={close} /> : null}
    </SettingsSection>
  )
}

function Row({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{text}</span>
      </span>
      {children}
    </li>
  )
}

function LeaveDialog({ orgId, orgName, onClose }: { orgId: string; orgName: string; onClose: () => void }) {
  const [pending, setPending] = React.useState(false)
  async function leave() {
    setPending(true)
    const { error } = await authClient.organization.leave({ organizationId: orgId })
    if (error) {
      setPending(false)
      return void toast.error(error.message ?? t("Something went wrong"))
    }
    // The dashboard picks your next organization (or a new personal one).
    window.location.href = "/app"
  }
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Leave {name}?", { name: orgName })}</DialogTitle>
          <DialogDescription>{t("You lose access to its mail and settings right away. Your account stays.")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button variant="destructive" loading={pending} disabled={pending} onClick={() => void leave()}>
            {t("Leave organization")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransferDialog({ orgName, others, onClose }: { orgName: string; others: DangerZoneProps["others"]; onClose: () => void }) {
  const [memberId, setMemberId] = React.useState<string>("")
  const [pending, setPending] = React.useState(false)
  const target = others.find((o) => o.id === memberId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      await api("POST", "/api/app/org/transfer", { memberId })
      toast.success(target ? t("{name} now owns {org}", { name: target.name, org: orgName }) : t("Ownership transferred"))
      window.location.reload()
    } catch (err) {
      setPending(false)
      toast.error((err as Error).message)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("Transfer ownership of {name}", { name: orgName })}</DialogTitle>
            <DialogDescription>
              {t("The new owner can delete the organization and manage everyone, including you. You become an admin.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>{t("New owner")}</Label>
            <Select value={memberId || undefined} onValueChange={setMemberId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("Choose a member…")} />
              </SelectTrigger>
              <SelectContent>
                {others.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} <span className="text-muted-foreground">· {o.email}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={pending || !memberId}>
              {t("Transfer ownership")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteOrgDialog({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  const [typed, setTyped] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await api("DELETE", "/api/app/org", { confirmName: typed })
      window.location.href = "/app"
    } catch (err) {
      setPending(false)
      setError((err as Error).message)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("Delete {name}?", { name: orgName })}</DialogTitle>
            <DialogDescription>
              {t("All mail, API keys and audit log entries are deleted right away. The subscription is cancelled now, and nobody can sign in to this organization any more. This can't be undone.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="delete-org-name">
              {t("Type {name} to confirm", { name: orgName })}
            </Label>
            <Input id="delete-org-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="destructive" loading={pending} disabled={pending || typed.trim() !== orgName}>
              {t("Delete organization")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
