import * as React from "react"

import { cn } from "cn"
import { heatmapMax, heatmapOpacity } from "@/lib/heatmap"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { t, appLocale } from "@/lib/i18n/panel"

export interface HeatmapChartProps extends React.ComponentProps<"div"> {
  /** Row labels, top to bottom ("Mon" … "Sun"). */
  rows: string[]
  /** Column labels, left to right ("00" … "23"). */
  columns: string[]
  /** `values[row][column]`. `null` is a cell nothing was counted for, drawn empty. */
  values: (number | null)[][]
  /** Any CSS color. Defaults to the theme primary. */
  color?: string
  /** Defaults to a compact number in `locale`. */
  valueFormatter?: (value: number) => string
  /** Locale of the default value format. Pass the app's locale (`appLocale()`). */
  locale?: string
  /** Shown above the value in a cell's tooltip. Defaults to "row column". */
  cellLabel?: (row: string, column: string) => string
  /** Label every n-th column only (e.g. 6 for hours). Defaults to every column. */
  columnLabelEvery?: number
  /** The two ends of the legend under the grid. Omit to hide it. */
  legend?: [low: string, high: string]
  /** Tooltip text for a cell nothing was counted for. */
  missingLabel?: string
}

/**
 * Two-axis density, such as weekday × hour. Cells are square at any width: the grid has one label
 * column and `columns.length` equal columns, so it never overflows its card.
 */
function HeatmapChart({
  rows,
  columns,
  values,
  color = "var(--primary)",
  locale = "en",
  valueFormatter = (value) =>
    new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value),
  cellLabel = (row, column) => `${row} ${column}`,
  columnLabelEvery = 1,
  legend,
  missingLabel = t("Not counted"),
  className,
  ...props
}: HeatmapChartProps) {
  const max = heatmapMax(values)
  const template = { gridTemplateColumns: `2.25rem repeat(${columns.length}, minmax(0, 1fr))` }

  return (
    <TooltipProvider delayDuration={100} skipDelayDuration={0}>
      <div data-slot="heatmap-chart" className={cn("flex flex-col gap-[3px]", className)} {...props}>
        {rows.map((row, r) => (
          <div key={row} className="grid items-center gap-[3px]" style={template}>
            <span className="text-muted-foreground truncate text-xs">{row}</span>
            {columns.map((column, c) => {
              const value = values[r]?.[c] ?? null
              const opacity = heatmapOpacity(value, max)
              return (
                <Tooltip key={column}>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "aspect-square rounded-[3px]",
                        opacity === null && "border-border border border-dashed"
                      )}
                      style={opacity === null ? undefined : { backgroundColor: color, opacity }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <div className="text-muted-foreground">{cellLabel(row, column)}</div>
                      <div className="font-medium tabular-nums">
                        {value === null ? missingLabel : valueFormatter(value)}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        ))}
        <div
          className="text-muted-foreground mt-1 grid gap-[3px] text-[10.5px] tabular-nums"
          style={template}
          aria-hidden="true"
        >
          <span />
          {columns.map((column, c) => (
            <span key={column} className="truncate">
              {c % columnLabelEvery === 0 ? column : ""}
            </span>
          ))}
        </div>
        {legend ? (
          <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            <span>{legend[0]}</span>
            {[0.08, 0.3, 0.55, 0.8, 1].map((opacity) => (
              <span
                key={opacity}
                className="h-2.5 w-3.5 rounded-[2px]"
                style={{ backgroundColor: color, opacity }}
              />
            ))}
          <span>{legend[1]}</span>
        </div>
      ) : null}
    </div>
    </TooltipProvider>
  )
}

export { HeatmapChart }
