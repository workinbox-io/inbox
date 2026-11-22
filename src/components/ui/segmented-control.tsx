import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

export interface SegmentOption<T extends string = string> {
  value: T
  label: React.ReactNode
  /** Shown instead of `label` below the `sm` breakpoint. */
  shortLabel?: React.ReactNode
  /** Small count after the label, e.g. unread items. */
  count?: number
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value?: T
  defaultValue?: T
  onValueChange?: (value: T) => void
  size?: "sm" | "default"
  /** Stretch to the container; each segment grows from its label's width. */
  fullWidth?: boolean
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

interface ThumbRect {
  left: number
  width: number
}

const thumbClass =
  "bg-background dark:bg-secondary rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-black/[0.06] dark:shadow-none dark:ring-white/[0.06]"

/**
 * Pick one of a few options (period, filter, view). A single thumb slides to the active segment.
 * Built on a single-select toggle group: arrow keys move between segments, and the value can't be
 * cleared by clicking the active one.
 */
function SegmentedControl<T extends string>({
  options,
  value,
  defaultValue,
  onValueChange,
  size = "default",
  fullWidth = false,
  disabled = false,
  className,
  ...props
}: SegmentedControlProps<T>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? options[0]?.value)
  const active = value ?? internalValue
  // Until the thumb is measured (SSR, first paint) the active segment paints its own background.
  const [thumb, setThumb] = React.useState<ThumbRect | null>(null)
  const [animate, setAnimate] = React.useState(false)

  const measure = React.useCallback(() => {
    const item = listRef.current?.querySelector<HTMLElement>('[data-state="on"]')
    if (item) setThumb({ left: item.offsetLeft, width: item.offsetWidth })
  }, [])

  React.useLayoutEffect(measure, [measure, active, options, size, fullWidth])

  React.useEffect(() => {
    if (!thumb || animate) return
    const frame = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [thumb, animate])

  React.useEffect(() => {
    const list = listRef.current
    if (!list) return
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [measure])

  return (
    <ToggleGroupPrimitive.Root
      ref={listRef}
      type="single"
      value={active}
      onValueChange={(next) => {
        if (!next) return
        setInternalValue(next as T)
        onValueChange?.(next as T)
      }}
      disabled={disabled}
      aria-label={props["aria-label"]}
      data-slot="segmented-control"
      className={cn(
        "bg-foreground/[0.05] relative isolate inline-flex max-w-full items-center rounded-full p-0.5",
        size === "sm" ? "h-7" : "h-8",
        fullWidth ? "flex w-full" : "w-fit",
        disabled && "opacity-50",
        className
      )}
    >
      {thumb ? (
        <span
          aria-hidden
          data-slot="segmented-control-thumb"
          className={cn(
            "pointer-events-none absolute inset-y-0.5 -z-10",
            thumbClass,
            animate && "transition-[left,width] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
          )}
          style={thumb}
        />
      ) : null}
      {options.map((option) => {
        const isActive = option.value === active
        return (
          <ToggleGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn(
              "relative inline-flex h-full min-w-0 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap outline-none transition-colors",
              "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none",
              size === "sm" ? "px-2.5 text-xs" : "px-3 text-[13px]",
              fullWidth && "flex-auto",
              isActive && "text-foreground hover:text-foreground",
              isActive && !thumb && thumbClass
            )}
          >
            {option.shortLabel != null ? (
              <>
                <span className="truncate sm:hidden">{option.shortLabel}</span>
                <span className="hidden truncate sm:inline">{option.label}</span>
              </>
            ) : (
              <span className="truncate">{option.label}</span>
            )}
            {option.count ? (
              <span className={cn("tabular-nums", isActive ? "text-muted-foreground" : "text-muted-foreground/70")}>
                {option.count > 99 ? "99+" : option.count}
              </span>
            ) : null}
          </ToggleGroupPrimitive.Item>
        )
      })}
    </ToggleGroupPrimitive.Root>
  )
}

export { SegmentedControl }
