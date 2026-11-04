import * as React from "react"

import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import { ArrowDownIcon, ArrowUpIcon } from "@/config/icons"

export interface BarListItem {
  name: string
  value: number
  /** Renders the label as a link. */
  href?: string
  icon?: React.ReactNode
  /** Stable key when names can repeat. */
  key?: string
  /** More numbers after the value, one per extra column (visits, bounce, revenue…). */
  extra?: React.ReactNode[]
  /** A row that stands for "none" or "not set": drawn in the muted colour. */
  muted?: boolean
  /** The row the page is filtered by. */
  active?: boolean
}

export interface BarListColumn {
  label: React.ReactNode
  /** Hidden on narrow screens. The name and value columns never hide. */
  hideBelow?: "sm"
  /** Width class of an extra column. Defaults to `w-16`. */
  className?: string
}

export type BarListVariant = "fill" | "track" | "meter"

export interface BarListProps extends React.ComponentProps<"div"> {
  data: BarListItem[]
  valueFormatter?: (value: number) => string
  sortOrder?: "descending" | "ascending" | "none"
  /**
   * How a row's share is drawn:
   * - `fill`: a soft bar behind the name (the default);
   * - `track`: a thin rounded track under the name;
   * - `meter`: nothing behind the name, a short meter next to the value.
   */
  variant?: BarListVariant
  /** `hatched` stripes the bar, like `breakdown-card`. Applies to `track` and `meter`. */
  pattern?: "solid" | "hatched"
  /** Any CSS color. Defaults to chart-1 for `fill` and the muted foreground for `track` and `meter`. */
  color?: string
  /** The bar's colour while the row is pointed at. Defaults to `color`. */
  hoverColor?: string
  /** Show each row's share of the total next to its value. */
  showPercentage?: boolean
  onItemClick?: (item: BarListItem) => void
  /**
   * A header row: the name column, the value column, then one per `extra` cell. Without it the
   * list has no header, as before.
   */
  columns?: BarListColumn[]
  /** The sorted column (index into `columns`, 1 or more). The list does not sort by it: the caller does. */
  sort?: { column: number; direction: "asc" | "desc" }
  /** Makes the value and extra headers buttons. */
  onSort?: (column: number) => void
}

function fillStyle(variant: BarListVariant, pattern: "solid" | "hatched"): React.CSSProperties {
  if (variant === "fill") {
    return { backgroundColor: "color-mix(in oklab, var(--bar-now) 20%, transparent)" }
  }
  if (pattern === "hatched") {
    return {
      backgroundColor: "color-mix(in oklab, var(--bar-now) 30%, transparent)",
      backgroundImage:
        "repeating-linear-gradient(135deg, var(--bar-now) 0 1.5px, transparent 1.5px 4.5px)",
    }
  }
  return { backgroundColor: "color-mix(in oklab, var(--bar-now) 70%, transparent)" }
}

function BarList({
  data,
  valueFormatter = (value) => formatNumber(value, { format: "compact" }),
  sortOrder = "descending",
  variant = "fill",
  pattern = "solid",
  color,
  hoverColor,
  showPercentage = false,
  onItemClick,
  columns,
  sort,
  onSort,
  className,
  style,
  ...props
}: BarListProps) {
  const items = React.useMemo(() => {
    if (sortOrder === "none") return data
    const sorted = [...data].sort((a, b) => a.value - b.value)
    return sortOrder === "descending" ? sorted.reverse() : sorted
  }, [data, sortOrder])
  const max = Math.max(...items.map((item) => item.value), 0)
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const barColor = color ?? (variant === "fill" ? "var(--chart-1)" : "var(--muted-foreground)")
  const bar = fillStyle(variant, pattern)
  const track = variant === "track"
  const meter = variant === "meter"
  const hide = (column: BarListColumn | undefined) =>
    column?.hideBelow === "sm" ? "max-sm:hidden" : undefined

  // The value block is as wide in the header as in every row, so the columns line up.
  const valueBlock = (value: React.ReactNode, meterEl: React.ReactNode, share: React.ReactNode) => (
    <>
      <span className="w-16 text-right">{value}</span>
      {meter ? <span className="flex w-10 items-center">{meterEl}</span> : null}
      {showPercentage ? <span className="w-12 text-right">{share}</span> : null}
    </>
  )

  const header = columns ? (
    <div
      data-slot="bar-list-header"
      className="text-muted-foreground flex items-center gap-3 pb-1 text-xs font-medium"
    >
      <span className="min-w-0 flex-1 truncate px-2">{columns[0]?.label}</span>
      <div className="flex shrink-0 items-center gap-3">
        {columns.slice(1).map((column, i) => {
          const index = i + 1
          const sorted = sort?.column === index
          const Arrow = sort?.direction === "asc" ? ArrowUpIcon : ArrowDownIcon
          const label = (
            <span
              className={cn(
                "inline-flex items-center justify-end gap-1",
                sorted && "text-foreground"
              )}
            >
              {column.label}
              {sorted ? <Arrow className="size-3" /> : null}
            </span>
          )
          const cell = onSort ? (
            <button
              type="button"
              onClick={() => onSort(index)}
              aria-sort={sorted ? (sort?.direction === "asc" ? "ascending" : "descending") : undefined}
              className="hover:text-foreground"
            >
              {label}
            </button>
          ) : (
            label
          )
          if (index === 1) {
            return <React.Fragment key={index}>{valueBlock(cell, null, null)}</React.Fragment>
          }
          return (
            <span
              key={index}
              className={cn("text-right", column.className ?? "w-16", hide(column))}
            >
              {cell}
            </span>
          )
        })}
      </div>
    </div>
  ) : null

  return (
    <div
      data-slot="bar-list"
      data-variant={variant}
      className={cn("flex flex-col", track ? "gap-1" : "gap-1.5", className)}
      style={
        { "--bar": barColor, "--bar-hover": hoverColor ?? barColor, ...style } as React.CSSProperties
      }
      {...props}
    >
      {header}
      {items.map((item) => {
        const width = max > 0 ? (item.value / max) * 100 : 0
        const share = total > 0 ? item.value / total : 0
        const interactive = Boolean(item.href || onItemClick)
        const Label = item.href ? "a" : onItemClick ? "button" : "div"
        const fill = (
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-y-0 left-0 transition-[width] duration-300",
              variant === "fill" ? "rounded-md" : "rounded-full"
            )}
            style={{ width: `${width}%`, ...bar }}
          />
        )

        return (
          <div
            key={item.key ?? item.name}
            data-slot="bar-list-row"
            data-active={item.active || undefined}
            className={cn(
              "flex gap-3 rounded-md text-sm [--bar-now:var(--bar)] hover:[--bar-now:var(--bar-hover)]",
              track ? "items-start py-1" : "items-center",
              item.active && "bg-muted"
            )}
          >
            <div
              className={cn(
                "relative flex min-w-0 flex-1",
                track ? "flex-col gap-1.5" : "h-8 items-center"
              )}
            >
              {variant === "fill" ? fill : null}
              <Label
                {...(item.href ? { href: item.href } : {})}
                {...(onItemClick && !item.href
                  ? { type: "button" as const, onClick: () => onItemClick(item) }
                  : {})}
                className={cn(
                  "relative flex min-w-0 items-center gap-2 px-2 text-left",
                  track && "h-6",
                  item.muted && "text-muted-foreground",
                  item.active && "font-medium",
                  interactive && "hover:underline"
                )}
              >
                {item.icon ? (
                  <span className="text-muted-foreground shrink-0 [&>svg]:size-4">
                    {item.icon}
                  </span>
                ) : null}
                <span className="truncate">{item.name}</span>
              </Label>
              {track ? (
                <span className="bg-muted relative mx-2 h-[5px] overflow-hidden rounded-full">
                  {fill}
                </span>
              ) : null}
            </div>
            <div className={cn("flex shrink-0 items-center gap-3 tabular-nums", track && "h-6")}>
              {valueBlock(
                <span className={cn("font-medium", item.muted && "text-muted-foreground")}>
                  {valueFormatter(item.value)}
                </span>,
                <span className="bg-muted relative h-1 w-10 overflow-hidden rounded-full">
                  {fill}
                </span>,
                <span className="text-muted-foreground text-xs">
                  {formatNumber(share, { format: "percent" })}
                </span>
              )}
              {item.extra?.map((cell, i) => {
                const column = columns?.[i + 2]
                return (
                  <span
                    key={i}
                    className={cn(
                      "text-muted-foreground text-right",
                      column?.className ?? "w-16",
                      hide(column)
                    )}
                  >
                    {cell}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { BarList }
