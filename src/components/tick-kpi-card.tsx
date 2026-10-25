"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { type NumberFormat } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { TickBar } from "@/components/ui/tick-bar"
import { MetricValue } from "@/components/ui/metric-value"

export interface TickKpiMetric {
  label: string
  value: number
  /** The whole the value is measured against, shown as "of 691". null = unlimited. */
  max: number | null
  format?: NumberFormat
  currency?: string
  /** Suffix after the max, e.g. "units". */
  unit?: string
  /** Any CSS color. Defaults to chart-1 through chart-5 in order. */
  color?: string
  icon?: React.ReactNode
  /** Slot in the top-right corner, e.g. a menu button. */
  action?: React.ReactNode
}

export interface TickKpiCardProps extends React.ComponentProps<typeof Card> {
  metrics: TickKpiMetric[]
  /** Number of ticks in each bar. */
  segments?: number
}

const defaultColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

/** Primary until 80% of the limit, then amber, then red at the limit. */
function usageColor(used: number, limit: number | null) {
  const r = limit ? used / limit : 0
  return r >= 1 ? "var(--color-red-500)" : r >= 0.8 ? "var(--color-amber-500)" : "var(--chart-1)"
}

/** A card with a row of KPI tiles, each with a value out of a whole and a tick bar showing how far along it is. */
function TickKpiCard({ metrics, segments = 40, className, ...props }: TickKpiCardProps) {
  return (
    <Card
      data-slot="tick-kpi-card"
      className={cn("rounded-none bg-transparent py-0", className)}
      {...props}
    >
      <CardContent className="px-0">
        {/* Tiles wrap to fit and stretch to fill their row, each on its own flat surface. */}
        <div className="flex flex-wrap gap-4">
          {metrics.map((metric, index) => {
            const color = metric.color ?? defaultColors[index % defaultColors.length]
            const options = { format: metric.format, currency: metric.currency }
            return (
              <div
                key={metric.label}
                data-slot="tick-kpi-metric"
                className="bg-surface flex min-w-0 flex-[1_1_14rem] flex-col gap-4 rounded-2xl p-6"
              >
                <div className="flex items-center gap-3">
                  {metric.icon ? (
                    <span className="bg-background flex size-9 shrink-0 items-center justify-center rounded-full [&>svg]:size-4">
                      {metric.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">
                    {metric.label}
                  </span>
                  {metric.action ? <span className="shrink-0">{metric.action}</span> : null}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <MetricValue
                    value={metric.value}
                    {...options}
                    className="text-3xl font-normal tracking-tight"
                  />
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {metric.max === null ? (
                      "of unlimited"
                    ) : (
                      <>
                        of{" "}
                        <MetricValue
                          value={metric.max}
                          {...options}
                          suffix={metric.unit ? ` ${metric.unit}` : undefined}
                        />
                      </>
                    )}
                  </span>
                </div>
                <TickBar
                  value={metric.max === null ? 0 : metric.value}
                  max={metric.max ?? 1}
                  segments={segments}
                  color={color}
                  className="h-5"
                />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export { TickKpiCard, usageColor }
