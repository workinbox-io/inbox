import * as React from "react"
import { CalendarClock, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface DateTimePreset {
  id: string
  label: string
  at: Date
}

/** Monday unless the browser's locale says otherwise (`Intl.Locale#getWeekInfo`, 7 = Sunday). */
function weekStart(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }
    const first = locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay ?? 1
    return (first % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  } catch {
    return 1
  }
}

const pad = (n: number) => String(n).padStart(2, "0")
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "Tue 11 Nov, 09:00"; the year only when it isn't this one. */
export function formatDateTime(ms: number) {
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: sameYear ? undefined : "numeric", hour: "2-digit", minute: "2-digit" })
}

/** The next round hour at least an hour away: a sensible starting point for "pick a time". */
function defaultTime(now = new Date()) {
  const d = new Date(now)
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d
}

/**
 * A date and time chooser: quick presets on the left, a month calendar and a time on the right,
 * and a confirm button. Only future times can be confirmed. Inline, for a dialog or popover body.
 */
export function DateTimePanel({
  value,
  onConfirm,
  presets = [],
  confirmLabel = "Set",
  className,
}: {
  value?: number
  onConfirm: (ms: number) => void
  presets?: DateTimePreset[]
  confirmLabel?: string
  className?: string
}) {
  const [date, setDate] = React.useState<Date>(() => (value ? new Date(value) : defaultTime()))
  const [time, setTime] = React.useState(() => timeOf(value ? new Date(value) : defaultTime()))
  const startOfWeek = React.useMemo(weekStart, [])
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const combined = React.useMemo(() => {
    const [h, m] = time.split(":").map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    const d = new Date(date)
    d.setHours(h!, m!, 0, 0)
    return d.getTime()
  }, [date, time])
  const past = combined !== null && combined <= Date.now()

  return (
    <div className={cn("flex flex-col sm:flex-row", className)}>
      {presets.length ? (
        <div className="flex flex-col gap-px border-b p-2 sm:w-60 sm:border-r sm:border-b-0">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onConfirm(p.at.getTime())}
              className="hover:bg-accent focus-visible:ring-ring/50 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap outline-none focus-visible:ring-[3px]"
            >
              {p.label}
              <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums" suppressHydrationWarning>
                {p.at.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col">
        <Calendar
          mode="single"
          required
          selected={date}
          onSelect={(d) => d && setDate(d)}
          defaultMonth={date}
          weekStartsOn={startOfWeek}
          disabled={{ before: today }}
          className="bg-transparent p-3"
        />
        <div className="flex items-center gap-2 border-t p-3">
          <Input type="time" aria-label="Time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="h-8 w-28 tabular-nums" />
          <span className={cn("min-w-0 flex-1 truncate text-xs", past ? "text-destructive" : "text-muted-foreground")}>{past ? "That's in the past" : combined ? formatDateTime(combined) : ""}</span>
          <Button size="sm" disabled={combined === null || past} onClick={() => combined && onConfirm(combined)}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** A button that shows the chosen time and opens `DateTimePanel` in a popover. */
export function DateTimePicker({
  value,
  onChange,
  presets,
  placeholder = "Pick a date and time",
  confirmLabel,
  clearLabel,
  disabled,
  className,
  align = "start",
}: {
  value?: number
  onChange: (ms: number | undefined) => void
  presets?: DateTimePreset[]
  placeholder?: string
  confirmLabel?: string
  /** Shows a clear button when a value is set; its accessible label. */
  clearLabel?: string
  disabled?: boolean
  className?: string
  align?: "start" | "center" | "end"
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled} className={cn("justify-start font-normal", !value && "text-muted-foreground", className)}>
            <CalendarClock />
            <span className="truncate" suppressHydrationWarning>{value ? formatDateTime(value) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} collisionPadding={12} className="w-auto max-w-[calc(100vw-1.5rem)] overflow-hidden p-0">
          {open ? (
            <DateTimePanel
              value={value}
              presets={presets}
              confirmLabel={confirmLabel}
              onConfirm={(ms) => {
                onChange(ms)
                setOpen(false)
              }}
            />
          ) : null}
        </PopoverContent>
      </Popover>
      {value && clearLabel ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={clearLabel} title={clearLabel} disabled={disabled} onClick={() => onChange(undefined)}>
          <X />
        </Button>
      ) : null}
    </div>
  )
}
