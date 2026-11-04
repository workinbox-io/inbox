"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  AreaRevealShape,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type AreaRevealShapeProps,
} from "recharts"

import { cn } from "cn"

export interface SparklineProps extends React.ComponentProps<"div"> {
  /** Series to plot, oldest first. `null` is a gap (a day not reported), never a zero. */
  data: (number | null)[]
  variant?: "area" | "line"
  /** Area fill: a plain gradient, or a dot grid that fades out toward the line. */
  fill?: "gradient" | "dots"
  /** Any CSS color. Defaults to the theme primary. */
  color?: string
  curve?: "monotone" | "linear" | "step"
  strokeWidth?: number
  /** Animate after hydration and when data changes. Respects reduced motion. */
  animate?: boolean
  animationDuration?: number
  /**
   * Called with the index under the pointer, and `null` when it leaves. Turns on a thin cursor line,
   * so a card can show the hovered point's value in place of its total.
   */
  onHoverIndex?: (index: number | null) => void
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)"

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getReducedMotionSnapshot() {
  return window.matchMedia(reducedMotionQuery).matches
}

function getReducedMotionServerSnapshot() {
  return true
}

/** Area shape that masks the fill to a dot grid while keeping the stroke solid. */
function DotGridAreaShape({
  maskId,
  ...props
}: AreaRevealShapeProps & { maskId: string }) {
  return (
    <>
      <g mask={`url(#${maskId})`}>
        <AreaRevealShape {...props} stroke="none" />
      </g>
      <AreaRevealShape {...props} id={undefined} fill="none" />
    </>
  )
}

function Sparkline({
  data,
  variant = "area",
  fill = "gradient",
  color = "var(--primary)",
  curve = "monotone",
  strokeWidth = 1.5,
  animate = true,
  animationDuration = 500,
  onHoverIndex,
  className,
  ...props
}: SparklineProps) {
  const id = React.useId()
  const reducedMotion = React.useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  )
  const animationActive = animate && !reducedMotion
  const dots = variant === "area" && fill === "dots"
  const points = React.useMemo(() => data.map((y, i) => ({ i, y })), [data])
  const margin = { top: 2, right: 0, bottom: 0, left: 0 }
  const hover = onHoverIndex
    ? {
        onMouseMove: (state: { activeTooltipIndex?: number | string | null }) => {
          const index = Number(state.activeTooltipIndex)
          onHoverIndex(Number.isInteger(index) ? index : null)
        },
        onMouseLeave: () => onHoverIndex(null),
      }
    : {}
  const cursor = onHoverIndex ? (
    <Tooltip
      content={() => null}
      cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
      isAnimationActive={false}
    />
  ) : null

  return (
    <div
      data-slot="sparkline"
      aria-hidden="true"
      className={cn("h-10 w-full", onHoverIndex && "cursor-crosshair", className)}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        {variant === "line" ? (
          <LineChart data={points} margin={margin} {...hover}>
            {cursor}
            <Line
              type={curve}
              dataKey="y"
              stroke={color}
              strokeWidth={strokeWidth}
              dot={false}
              isAnimationActive={animationActive}
              animationDuration={animationDuration}
              animationEasing="ease-out"
            />
          </LineChart>
        ) : (
          <AreaChart data={points} margin={margin} {...hover}>
            {cursor}
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={dots ? 0.08 : 0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={dots ? 0.9 : 0} />
              </linearGradient>
              {dots ? (
                <>
                  <pattern
                    id={`${id}-dots`}
                    patternUnits="userSpaceOnUse"
                    width={4}
                    height={4}
                  >
                    <circle cx={2} cy={2} r={0.9} fill="#fff" />
                  </pattern>
                  <mask
                    id={`${id}-mask`}
                    maskUnits="userSpaceOnUse"
                    x={0}
                    y={0}
                    width="100%"
                    height="100%"
                  >
                    <rect width="100%" height="100%" fill={`url(#${id}-dots)`} />
                  </mask>
                </>
              ) : null}
            </defs>
            <Area
              type={curve}
              dataKey="y"
              stroke={color}
              strokeWidth={strokeWidth}
              fill={`url(#${id})`}
              fillOpacity={dots ? 1 : undefined}
              dot={false}
              isAnimationActive={animationActive}
              animationDuration={animationDuration}
              animationEasing="ease-out"
              shape={
                dots
                  ? (shapeProps: AreaRevealShapeProps) => (
                      <DotGridAreaShape {...shapeProps} maskId={`${id}-mask`} />
                    )
                  : undefined
              }
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export { Sparkline }
