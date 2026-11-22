import * as React from "react"
import { CircleAlert, CircleCheck, CircleHelp, TriangleAlert } from "lucide-react"

import type { StatusOverview } from "@/lib/server/status"
import { STATUS_LABELS, type ServiceStatus } from "@/lib/status"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/ui/kpi-card"
import { TickBar, type Tick } from "@/components/ui/tick-bar"
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineHeader,
  TimelineItem,
  TimelineMarker,
  TimelineRail,
  TimelineTime,
  TimelineTitle,
} from "@/components/ui/timeline"
import { TooltipProvider } from "@/components/ui/tooltip"

type Status = ServiceStatus | "unknown"

const COLORS: Record<Status, string> = {
  ok: "var(--color-emerald-500)",
  degraded: "var(--color-amber-500)",
  down: "var(--destructive)",
  unknown: "var(--muted-foreground)",
}

const HEADLINE: Record<Status, string> = {
  ok: "All systems operational",
  degraded: "Some systems are degraded",
  down: "We're having an outage",
  unknown: "Status data is delayed",
}

const ICONS: Record<Status, typeof CircleCheck> = {
  ok: CircleCheck,
  degraded: TriangleAlert,
  down: CircleAlert,
  unknown: CircleHelp,
}

const pct = (v: number | null) => (v === null ? "–" : `${(Math.floor(v * 10000) / 100).toFixed(2)}%`)
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

function duration(from: string, to: string | null) {
  const min = Math.max(1, Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60_000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}

function StatusBadge({ status }: { status: Status }) {
  const Icon = ICONS[status]
  return (
    <Badge variant="outline" style={{ color: COLORS[status], backgroundColor: `color-mix(in oklab, ${COLORS[status]} 12%, transparent)` }}>
      <Icon className="size-3.5" />
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function dayTicks(days: StatusOverview["components"][number]["days"]): Tick[] {
  return days.map((d) => ({
    color: d.status ? COLORS[d.status] : null,
    label: (
      <div className="grid gap-0.5 text-xs">
        <span className="font-medium">{dayLabel(d.day)}</span>
        {d.status === null ? (
          <span>No data</span>
        ) : (
          <>
            <span>{pct(d.uptime)} uptime</span>
            {d.downMinutes ? <span>Down for about {d.downMinutes} min</span> : null}
            {d.status === "degraded" ? <span>Degraded performance</span> : null}
          </>
        )}
      </div>
    ),
  }))
}

export function StatusBoard({ overview }: { overview: StatusOverview }) {
  const Icon = ICONS[overview.status]
  const withData = overview.components.filter((c) => c.uptime !== null)
  const uptime = withData.length ? Math.min(...withData.map((c) => c.uptime!)) : null
  const open = overview.incidents.filter((i) => !i.resolvedAt)
  const days = overview.components[0]?.days.length ?? 90

  return (
    <TooltipProvider delayDuration={100}>
      <div className="grid gap-4">
        <Card className="border-none" style={{ backgroundColor: `color-mix(in oklab, ${COLORS[overview.status]} 10%, var(--card))` }}>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Icon className="size-8 shrink-0" style={{ color: COLORS[overview.status] }} />
            <div className="grid flex-1 gap-0.5">
              <span className="text-lg font-medium">{HEADLINE[overview.status]}</span>
              <span className="text-muted-foreground text-sm">
                {overview.updatedAt ? `Checked every minute · last check ${timeAgo(overview.updatedAt)}` : "No checks recorded yet"}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label={`Uptime, last ${days} days`} value={uptime === null ? "–" : pct(uptime)} />
          <KpiCard label="Incidents, last 30 days" value={overview.incidents.length} />
          <KpiCard label="Open incidents" value={open.length} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Components</CardTitle>
            <CardDescription>Each bar is one day. Hover for details.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {overview.components.map((c) => (
              <div key={c.id} className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="grid">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground text-xs">{c.description}</span>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <TickBar ticks={dayTicks(c.days)} className="h-8 gap-px sm:gap-[2px]" />
                <div className="text-muted-foreground flex justify-between text-xs">
                  <span>{days} days ago</span>
                  <span>{pct(c.uptime)} uptime</span>
                  <span>Today</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Incidents</CardTitle>
            <CardDescription>Detected automatically by our checks. Last 30 days.</CardDescription>
            {open.length ? (
              <CardAction>
                <StatusBadge status={open.some((i) => i.status === "down") ? "down" : "degraded"} />
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {overview.incidents.length ? (
              <Timeline>
                {overview.incidents.map((i) => {
                  const IncidentIcon = i.resolvedAt ? CircleCheck : ICONS[i.status]
                  return (
                    <TimelineItem key={i.id} status={i.resolvedAt ? "default" : i.status === "down" ? "danger" : "warning"}>
                      <TimelineRail>
                        <TimelineMarker>
                          <IncidentIcon />
                        </TimelineMarker>
                        <TimelineConnector />
                      </TimelineRail>
                      <TimelineContent className="pb-6">
                        <TimelineHeader>
                          <TimelineTitle>
                            {i.component}: {STATUS_LABELS[i.status].toLowerCase()}
                          </TimelineTitle>
                          <TimelineTime dateTime={i.startedAt}>{dateTime(i.startedAt)}</TimelineTime>
                        </TimelineHeader>
                        <TimelineDescription className={cn(!i.resolvedAt && "text-foreground")}>
                          {i.resolvedAt
                            ? `Resolved after ${duration(i.startedAt, i.resolvedAt)}.`
                            : `Ongoing for ${duration(i.startedAt, null)}. We're on it.`}
                        </TimelineDescription>
                      </TimelineContent>
                    </TimelineItem>
                  )
                })}
              </Timeline>
            ) : (
              <p className="text-muted-foreground text-sm">No incidents in the last 30 days.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
