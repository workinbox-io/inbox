import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { TODAY_CIRCLE, fmt, rangeOf } from "./shared"

/** Twelve compact months; open a month to see its events. */
export function YearGrid({ date, tz, weekStart, now, onMonth }: {
  date: number
  tz: string
  weekStart: number
  now: number
  onMonth: (date: number) => void
}) {
  const { from } = rangeOf(date, "year", tz, weekStart)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 @xl/cal:p-6">
      <Calendar
        month={new Date(from)}
        numberOfMonths={12}
        timeZone={tz}
        today={new Date(now)}
        weekStartsOn={weekStart as 0 | 1 | 6}
        hideNavigation
        disableNavigation
        showOutsideDays={false}
        fixedWeeks
        onDayClick={(day) => onMonth(day.getTime())}
        formatters={{
          formatWeekdayName: (day) => fmt(day.getTime(), tz, { weekday: "narrow" }),
        }}
        components={{
          MonthCaption: ({ calendarMonth }) => (
            <Button variant="ghost" className="self-start" onClick={() => onMonth(calendarMonth.date.getTime())}>
              {fmt(calendarMonth.date.getTime(), tz, { month: "long" })}
            </Button>
          ),
        }}
        className="w-full bg-transparent p-0 [--cell-size:--spacing(7)]"
        classNames={{
          root: "w-full",
          months: "grid grid-cols-1 gap-x-8 gap-y-6 @xl/cal:grid-cols-2 @3xl/cal:grid-cols-3 @5xl/cal:grid-cols-4",
          month: "flex min-w-0 flex-col gap-2",
          today: cn("rounded-full font-semibold", TODAY_CIRCLE),
        }}
      />
    </div>
  )
}
