import * as React from "react"

import { cn } from "@/lib/utils"
import { type NumberFormat } from "@/lib/format"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DeltaBadge, getDeltaDirection } from "@/components/ui/delta-badge"
import { Sparkline } from "@/components/ui/sparkline"
import { MetricValue } from "@/components/ui/metric-value"

export interface KpiCardProps extends Omit<
  React.ComponentProps<typeof Card>,
  "children"
> {
  /** Metric name, e.g. "Revenue". */
  label: string
  /** Current value. Numbers are formatted with `format`; strings render as-is. */
  value: number | string
  /** Fractional change vs. the previous period, e.g. 0.124 for +12.4%. */
  delta?: number
  /** Context for the delta, e.g. "vs. last 30 days". */
  deltaLabel?: string
  /** Series for the sparkline, oldest first. Rendered when it has two or more points; `null` is a gap. */
  trend?: (number | null)[]
  /**
   * One label per `trend` point ("Oct 26"). With it, pointing at the sparkline shows that point's
   * value and label in place of `value` and `deltaLabel`.
   */
  trendLabels?: string[]
  format?: NumberFormat
  /** ISO 4217 code, used when `format` is "currency". */
  currency?: string
  /** Treat a decrease as good and an increase as bad (churn, latency, errors). */
  invertDelta?: boolean
  /** Optional icon shown before the label. */
  icon?: React.ReactNode
  children?: React.ReactNode
}

function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  trend,
  trendLabels,
  format = "number",
  currency,
  invertDelta = false,
  icon,
  className,
  children,
  ...props
}: KpiCardProps) {
  const [hovered, setHovered] = React.useState<number | null>(null)
  const point = hovered !== null && trendLabels ? hovered : null
  const shown = point !== null ? (trend?.[point] ?? null) : value
  const direction = getDeltaDirection(delta)
  const isPositive =
    direction === "flat" ? null : (direction === "up") !== invertDelta
  const trendColor =
    isPositive === true
      ? "var(--color-emerald-500)"
      : isPositive === false
        ? "var(--color-red-500)"
        : "var(--primary)"

  return (
    <Card
      data-slot="kpi-card"
      data-direction={direction}
      className={cn("gap-4 py-6", className)}
      {...props}
    >
      <CardHeader className="px-6">
        <CardDescription className="flex items-center gap-1.5 [&>svg]:size-4">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-3xl font-normal tabular-nums tracking-tight">
          {shown === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <MetricValue value={shown} format={format} currency={currency} />
          )}
        </CardTitle>
        {delta !== undefined ? (
          <CardAction>
            <DeltaBadge delta={delta} invert={invertDelta} />
          </CardAction>
        ) : null}
      </CardHeader>
      {trend && trend.length > 1 ? (
        <CardContent className="px-6">
          <Sparkline
            data={trend}
            color={trendColor}
            {...(trendLabels ? { onHoverIndex: setHovered } : {})}
          />
        </CardContent>
      ) : null}
      {deltaLabel || children || point !== null ? (
        <CardContent className="text-muted-foreground flex items-center gap-2 px-6 text-xs">
          {point !== null ? (
            <span>{trendLabels?.[point]}</span>
          ) : deltaLabel ? (
            <span>{deltaLabel}</span>
          ) : null}
          {children}
        </CardContent>
      ) : null}
    </Card>
  )
}

export { KpiCard }
