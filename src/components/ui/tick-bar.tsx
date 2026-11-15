import * as React from "react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** One tick drawn with its own color and an optional hover label. */
export interface Tick {
  /** Defaults to the bar's `color`; null draws an unfilled (track) tick. */
  color?: string | null
  label?: React.ReactNode
}

export interface TickBarProps extends React.ComponentProps<"div"> {
  /** Current value, from 0 to max. Ignored when `ticks` is set. */
  value?: number
  max?: number
  /** Number of ticks. */
  segments?: number
  /** Any CSS color for the filled ticks. Defaults to chart-1. */
  color?: string
  /** Any CSS color for the unfilled ticks. Defaults to muted. */
  trackColor?: string
  /** "tick" draws thin bars; "pill" draws wide rounded ones. */
  shape?: "tick" | "pill"
  /** Reveal filled ticks in sequence when the bar mounts. */
  animate?: boolean
  /** Total reveal time in milliseconds. */
  animationDuration?: number
  /**
   * Explicit ticks, e.g. one per day of an uptime history. Overrides `value`,
   * `max` and `segments`; each tick gets its own color and tooltip.
   * Needs a TooltipProvider above when labels are used.
   */
  ticks?: Tick[]
}

/** A progress bar drawn as a row of ticks, lit up to the current value. */
function TickBar({
  value = 0,
  max = 100,
  segments = 40,
  color = "var(--chart-1)",
  trackColor,
  shape = "tick",
  animate = false,
  animationDuration = 700,
  ticks,
  className,
  ...props
}: TickBarProps) {
  const fraction = Math.min(1, Math.max(0, value / (max || 1)))
  // Any non-zero value lights at least one tick so small values still register.
  const filled = fraction === 0 ? 0 : Math.max(1, Math.round(fraction * segments))

  const radius = shape === "tick" ? "rounded-[1.5px]" : "rounded-full"

  if (ticks) {
    return (
      <div
        data-slot="tick-bar"
        data-shape={shape}
        className={cn("flex w-full", shape === "tick" ? "h-6 gap-[3px]" : "h-4 gap-1.5", className)}
        {...props}
      >
        {ticks.map((tick, index) => {
          const span = (
            <span
              data-filled={tick.color !== null}
              className={cn("bg-muted h-full min-w-0 flex-1 transition-opacity hover:opacity-70", radius)}
              style={{ backgroundColor: tick.color === null ? trackColor : (tick.color ?? color) }}
            />
          )
          return tick.label ? (
            <Tooltip key={index}>
              <TooltipTrigger asChild>{span}</TooltipTrigger>
              <TooltipContent>{tick.label}</TooltipContent>
            </Tooltip>
          ) : (
            <React.Fragment key={index}>{span}</React.Fragment>
          )
        })}
      </div>
    )
  }

  return (
    <div
      data-slot="tick-bar"
      data-shape={shape}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(
        "flex w-full",
        shape === "tick" ? "h-6 gap-[3px]" : "h-4 gap-1.5",
        className
      )}
      {...props}
    >
      {Array.from({ length: segments }, (_, index) => {
        const lit = index < filled
        return (
          <span
            key={index}
            data-filled={lit}
            className={cn(
              "bg-muted relative h-full min-w-0 flex-1 overflow-hidden transition-colors",
              shape === "tick" ? "rounded-[1.5px]" : "rounded-full"
            )}
            style={{ backgroundColor: trackColor }}
          >
            {lit ? (
              <span
                className={cn(
                  "absolute inset-0",
                  shape === "tick" ? "rounded-[1.5px]" : "rounded-full",
                  animate && "motion-safe:animate-in motion-safe:fade-in"
                )}
                style={{
                  backgroundColor: color,
                  ...(animate
                    ? {
                        animationDelay: `${(index / Math.max(1, filled)) * animationDuration * 0.8}ms`,
                        animationDuration: `${Math.max(120, animationDuration * 0.25)}ms`,
                        animationFillMode: "both",
                      }
                    : null),
                }}
              />
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

export { TickBar }
