import * as React from "react"
import { Check, ExternalLink, Users } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
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
import { appLocale, t, tp } from "@/lib/i18n/panel"

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

const STATUS: Record<string, { label: () => string; dot: string }> = {
  trialing: { label: () => t("Trial"), dot: "bg-primary" },
  active: { label: () => t("Active"), dot: "bg-emerald-500" },
  past_due: { label: () => t("Payment failed"), dot: "bg-red-500" },
  unpaid: { label: () => t("Unpaid"), dot: "bg-red-500" },
  canceled: { label: () => t("Canceled"), dot: "bg-muted-foreground" },
  incomplete: { label: () => t("Incomplete"), dot: "bg-amber-500" },
}

/** Shown under the plan table; replace with what every plan of your product includes. */
const included = () => [t("Unlimited shared mailboxes and aliases"), t("Two-factor authentication"), t("Email support"), t("Cancel any time")]

const money = (cents: number) =>
  new Intl.NumberFormat(appLocale(), { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(cents / 100)

export function BillingPanel(props: BillingPanelProps) {
  const { usage, status } = props
  const [interval, setInterval] = React.useState<"month" | "year">("month")
  const [pending, setPending] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (props.justCheckedOut) toast.success(t("Thanks! Your subscription is being activated."))
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
  const s = STATUS[status] ?? { label: () => status, dot: "bg-muted-foreground" }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={t("Billing")}
        description={
          props.canManage
            ? t("Your plan, usage against its limits, and invoices.")
            : t("Your plan and usage. Only owners and admins can change the plan or see invoices.")
        }
        actions={
          props.hasCustomer && props.canManage ? (
            <Button loading={pending === "portal"} variant="outline" disabled={pending !== null} onClick={() => void go("portal", "/api/app/billing/portal")}>
              {pending === "portal" ? t("Opening…") : t("Invoices & payment")}
              <ExternalLink />
            </Button>
          ) : null
        }
      />

      <section className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <div className="bg-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6 sm:p-8">
          <div className="grid gap-1">
            <SectionLabel>{t("Current plan")}</SectionLabel>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-normal tracking-tight">{usage.plan.name}</span>
              <Badge variant="outline" className="gap-1.5 font-normal">
                <span className={cn("size-1.5 rounded-full", s.dot)} />
                {s.label()}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm tracking-tight">
              {status === "trialing" && trialDays !== null
                ? trialDays > 0
                  ? `${tp(trialDays, { one: "Your free trial ends in {n} day.", other: "Your free trial ends in {n} days." })}${canPick ? ` ${t("Pick a plan below to keep going.")}` : ""}`
                  : `${t("Your trial has ended.")}${canPick ? ` ${t("Choose a plan below to continue.")}` : ""}`
                : props.currentPeriodEnd
                  ? t("Renews on {date}.", { date: new Date(props.currentPeriodEnd).toLocaleDateString(appLocale(), { dateStyle: "long" }) })
                  : null}
            </p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-medium tracking-tight tabular-nums">{money(usage.plan.priceMonthly * usage.seats)}</div>
            <div className="text-muted-foreground text-sm">
              {tp(usage.seats, { one: "{price} × {n} person", other: "{price} × {n} people" }, { price: money(usage.plan.priceMonthly) })}
              {usage.seats === MIN_SEATS
                ? ` ${t("(covers up to {n} people)", { n: FREE_PEOPLE + MIN_SEATS })}`
                : ` ${t("(the first {n} are free)", { n: FREE_PEOPLE })}`}
              {status === "trialing" && usage.plan.priceMonthly > 0 ? ` ${t("a month after the trial")}` : ` ${t("a month")}`}
            </div>
          </div>
        </div>
        <TickKpiCard
          metrics={[
            { label: t("People (personal mailboxes, the first {n} are free)", { n: FREE_PEOPLE }), icon: <Users />, value: usage.people, max: null },
            { label: t("People billed"), icon: <Users />, value: usage.seats, max: null },
            { label: t("Team members"), icon: <Users />, value: usage.members, max: usage.plan.members },
          ].map((m) => ({ ...m, color: usageColor(m.value, m.max) }))}
        />
      </section>

      {!props.hasSubscription ? (
        <Card className="gap-0 pb-0">
          <CardHeader className="pb-4">
            <CardTitle>{t("Choose a plan")}</CardTitle>
            <CardDescription>
              {t("Prices in {currency} per person (personal mailbox), excluding VAT, at least {n} billed. Shared mailboxes and aliases are free.", { currency: CURRENCY, n: MIN_SEATS })}
            </CardDescription>
            <CardAction>
              <PeriodTabs
                size="sm"
                options={[
                  { value: "month", label: t("Monthly") },
                  { value: "year", label: t("Yearly · 2 months free") },
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
                  <TableHead className="pl-7">{t("Plan")}</TableHead>
                  <TableHead className="text-right">{t("Per person")}</TableHead>
                  <TableHead className="text-right">{tp(usage.seats, { one: "For {n} billed person", other: "For {n} billed people" })}</TableHead>
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
                              {status === "trialing" ? t("Your trial") : t("Current")}
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="tabular-nums">{money(price)}</span>
                        <span className="text-muted-foreground text-xs">/{interval === "month" ? t("mo") : t("yr")}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-base font-medium tabular-nums">{money(price * usage.seats)}</span>
                        <span className="text-muted-foreground text-xs">/{interval === "month" ? t("mo") : t("yr")}</span>
                      </TableCell>
                      <TableCell className="pr-7 text-right">
                        <Button
                          size="sm"
                          className="w-full"
                          variant={current ? "default" : "outline"}
                          disabled={pending !== null || !props.canManage}
                          onClick={() => void go(plan.id, "/api/app/billing/checkout", { plan: plan.id, interval })}
                        >
                          {pending === plan.id ? t("Redirecting…") : t("Choose {plan}", { plan: plan.name })}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 px-7 py-5 text-xs">
              <span className="text-foreground font-medium">{t("Every plan includes")}</span>
              {included().map((f) => (
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
