import { ArrowRight, CreditCard, FolderKanban, Users } from "lucide-react"

import type { AuditRow } from "@/lib/server/audit"
import { AUDIT_ACTIONS, type AuditAction } from "@/config/audit"
import { timeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { TickKpiCard, usageColor } from "@/components/tick-kpi-card"
import { PageHeader, SectionLabel } from "@/components/app/page-header"

/** "Created API key" → "created API key", to read after the actor's name. */
const actionText = (action: string) => {
  const label: string = AUDIT_ACTIONS[action as AuditAction] ?? action
  return label.charAt(0).toLowerCase() + label.slice(1)
}

interface OverviewProps {
  userName: string
  plan: { name: string; projects: number | null; members: number | null }
  status: string
  trialDaysLeft: number | null
  projects: number
  members: number
  recent: AuditRow[] | null
}

/** Dashboard home: plan usage, a nudge while on trial, and recent activity. Make it about your product. */
export function OverviewPanel(props: OverviewProps) {
  return (
    <div className="grid gap-8">
      <PageHeader
        title={`Welcome, ${props.userName.split(" ")[0]}`}
        description="Here's what's happening in your organization."
        actions={
          <Button asChild>
            <a href="/app/projects?new=1">
              New project <ArrowRight />
            </a>
          </Button>
        }
      />

      {props.status === "trialing" && props.trialDaysLeft !== null ? (
        <div className="bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-6 py-4">
          <span className="flex items-center gap-2 text-sm">
            <CreditCard className="text-primary size-4" />
            {props.trialDaysLeft > 0
              ? `Your ${props.plan.name} trial ends in ${props.trialDaysLeft} day${props.trialDaysLeft === 1 ? "" : "s"}.`
              : "Your trial has ended."}
          </span>
          <Button asChild size="sm" variant="outline">
            <a href="/app/billing">Choose a plan</a>
          </Button>
        </div>
      ) : null}

      <section className="grid gap-3">
        <SectionLabel>{props.plan.name} plan</SectionLabel>
        <TickKpiCard
          metrics={[
            { label: "Projects", icon: <FolderKanban />, value: props.projects, max: props.plan.projects },
            { label: "Team members", icon: <Users />, value: props.members, max: props.plan.members },
          ].map((m) => ({ ...m, color: usageColor(m.value, m.max) }))}
        />
      </section>

      {props.recent ? (
        <section className="grid gap-3">
          <SectionLabel>Recent activity</SectionLabel>
          {props.recent.length ? (
            <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
              {props.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{r.actorName}</span>{" "}
                    <span className="text-muted-foreground">{actionText(r.action)}</span>
                    {r.target ? <span className="font-mono text-xs"> {r.target}</span> : null}
                  </span>
                  <time className="text-muted-foreground shrink-0 text-xs" dateTime={r.createdAt}>
                    {timeAgo(r.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Nothing yet.</p>
          )}
        </section>
      ) : null}
    </div>
  )
}
