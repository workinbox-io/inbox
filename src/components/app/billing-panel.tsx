import * as React from "react"
import { Check, ExternalLink, Users } from "lucide-react"
import { toast } from "sonner"
import { CURRENCY, FREE_PEOPLE, MIN_SEATS, PLAN_LIST, priceYearly } from "@/config/plans"

import type { OrgUsage } from "@/lib/server/org"
import { api } from "@/lib/api-client"
import { tapllEvent, tapllSessionId } from "@/lib/tapll"
import { cn } from "@/lib/utils"
import { TickKpiCard, usageColor } from "@/components/tick-kpi-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PeriodTabs } from "@/components/ui/period-tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, SectionLabel } from "@/components/app/page-header"

interface BillingPanelProps {
  usage: OrgUsage
  status: string
  trialEndsAt?: string
  currentPeriodEnd?: string
  hasCustomer: boolean
  hasSubscription: boolean
  justCheckedOut: boolean
  /** Owners and admins can change the plan and open invoices. */
  canManage: boolean
}

const STATUS: Record<string, { label: string; dot: string }> = {
  trialing: { label: "Trial", dot: "bg-primary" },
  active: { label: "Active", dot: "bg-emerald-500" },
  past_due: { label: "Payment failed", dot: "bg-red-500" },
  unpaid: { label: "Unpaid", dot: "bg-red-500" },
  canceled: { label: "Canceled", dot: "bg-muted-foreground" },
  incomplete: { label: "Incomplete", dot: "bg-amber-500" },
}

/** Shown under the plan table; replace with what every plan of your product includes. */
const INCLUDED = ["Unlimited shared mailboxes and aliases", "Two-factor authentication", "Email support", "Cancel any time"]

const money = (cents: number) =>
  new Intl.NumberFormat("en", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(cents / 100)

export function BillingPanel(props: BillingPanelProps) {
  const { usage, status } = props
  const [interval, setInterval] = React.useState<"month" | "year">("month")
  const [pending, setPending] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (props.justCheckedOut) toast.success("Thanks! Your subscription is being activated.")
  }, [props.justCheckedOut])

  async function go(key: string, path: string, body?: { plan: string; interval: "month" | "year" }) {
    setPending(key)
    if (body) tapllEvent("checkout_started", body)
    try {
      const { url } = await api<{ url: string }>("POST", path, body ? { ...body, tapllSessionId: tapllSessionId() } : undefined)
      window.location.assign(url)
    } catch (e) {
      if (body) tapllEvent("checkout_failed", { reason: "request_failed" })
      toast.error((e as Error).message)
      setPending(null)
    }
  }

  const trialDays = props.trialEndsAt
    ? Math.ceil((new Date(props.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null
  /** The plan picker below only renders without a subscription. */
  const canPick = !props.hasSubscription
  const s = STATUS[status] ?? { label: status, dot: "bg-muted-foreground" }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Billing"
        description={
          props.canManage
            ? "Your plan, usage against its limits, and invoices."
            : "Your plan and usage. Only owners and admins can change the plan or see invoices."
        }
        actions={
          props.hasCustomer && props.canManage ? (
            <Button loading={pending === "portal"} variant="outline" disabled={pending !== null} onClick={() => void go("portal", "/api/app/billing/portal")}>
              {pending === "portal" ? "Opening…" : "Invoices & payment"}
              <ExternalLink />
            </Button>
          ) : null
        }
      />

      <section className="grid gap-4">
        <div className="bg-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6 sm:p-8">
          <div className="grid gap-1">
            <SectionLabel>Current plan</SectionLabel>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-normal tracking-tight">{usage.plan.name}</span>
              <Badge variant="outline" className="gap-1.5 font-normal">
                <span className={cn("size-1.5 rounded-full", s.dot)} />
                {s.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm tracking-tight">
              {status === "trialing" && trialDays !== null
                ? trialDays > 0
                  ? `Your free trial ends in ${trialDays} day${trialDays === 1 ? "" : "s"}.${canPick ? " Pick a plan below to keep going." : ""}`
                  : `Your trial has ended.${canPick ? " Choose a plan below to continue." : ""}`
                : props.currentPeriodEnd
                  ? `Renews on ${new Date(props.currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: "long" })}.`
                  : null}
            </p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-medium tracking-tight tabular-nums">{money(usage.plan.priceMonthly * usage.seats)}</div>
            <div className="text-muted-foreground text-sm">
              {money(usage.plan.priceMonthly)} × {usage.seats} people
              {usage.seats === MIN_SEATS ? ` (covers up to ${FREE_PEOPLE + MIN_SEATS} people)` : ` (the first ${FREE_PEOPLE} are free)`}
              {status === "trialing" && usage.plan.priceMonthly > 0 ? " a month after the trial" : " a month"}
            </div>
          </div>
        </div>
        <TickKpiCard
          metrics={[
            { label: `People (personal mailboxes, the first ${FREE_PEOPLE} are free)`, icon: <Users />, value: usage.people, max: null },
            { label: "People billed", icon: <Users />, value: usage.seats, max: null },
            { label: "Team members", icon: <Users />, value: usage.members, max: usage.plan.members },
          ].map((m) => ({ ...m, color: usageColor(m.value, m.max) }))}
        />
      </section>

      {!props.hasSubscription ? (
        <Card className="gap-0 pb-0">
          <CardHeader className="pb-4">
            <CardTitle>Choose a plan</CardTitle>
            <CardDescription>
              Prices in {CURRENCY} per person (personal mailbox), excluding VAT, at least {MIN_SEATS} billed. Shared mailboxes and aliases are free.
            </CardDescription>
            <CardAction>
              <PeriodTabs
                size="sm"
                options={[
                  { value: "month", label: "Monthly" },
                  { value: "year", label: "Yearly · 2 months free" },
                ]}
                value={interval}
                onValueChange={(v) => setInterval(v as "month" | "year")}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-7">Plan</TableHead>
                  <TableHead className="text-right">Per person</TableHead>
                  <TableHead className="text-right">For {usage.seats} billed people</TableHead>
                  <TableHead className="w-40 pr-7" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {PLAN_LIST.map((plan) => {
                  const current = plan.id === usage.plan.id
                  const price = interval === "month" ? plan.priceMonthly : priceYearly(plan)
                  return (
                    <TableRow key={plan.id} className={cn("h-14", current && "bg-primary/5 hover:bg-primary/5")}>
                      <TableCell className="pl-7">
                        <span className="flex items-center gap-2 font-medium">
                          {plan.name}
                          {current ? (
                            <Badge variant="info">
                              {status === "trialing" ? "Your trial" : "Current"}
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="tabular-nums">{money(price)}</span>
                        <span className="text-muted-foreground text-xs">/{interval === "month" ? "mo" : "yr"}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-base font-medium tabular-nums">{money(price * usage.seats)}</span>
                        <span className="text-muted-foreground text-xs">/{interval === "month" ? "mo" : "yr"}</span>
                      </TableCell>
                      <TableCell className="pr-7 text-right">
                        <Button
                          size="sm"
                          className="w-full"
                          variant={current ? "default" : "outline"}
                          disabled={pending !== null || !props.canManage}
                          onClick={() => void go(plan.id, "/api/app/billing/checkout", { plan: plan.id, interval })}
                        >
                          {pending === plan.id ? "Redirecting…" : `Choose ${plan.name}`}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 px-7 py-5 text-xs">
              <span className="text-foreground font-medium">Every plan includes</span>
              {INCLUDED.map((f) => (
                <span key={f} className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-500" />
                  {f}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
