/**
 * A collection as a month calendar: records on the day of the view's date field (status and title), at most four a
 * day and "+n more" for the rest. Editors drag a record to another day and add one on a day with "+". Prev / next /
 * Today step through months; weeks start on Monday. On phones the month reads as a list of days instead.
 */
import * as React from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ActionMenu, type MenuAction } from "@/components/workspace/action-menu"
import { useMediaQuery } from "@/components/workspace/ui"
import { isClosed, statusFieldOf, type FieldValue } from "@/lib/collections/fields"
import { today } from "@/lib/collections/settings"
import type { ViewConfig } from "@/lib/collections/view-config"
import { appLocale, t, tp } from "@/lib/i18n/panel"
import type { Collection, CollectionRecord } from "@/lib/server/collections"
import { cn } from "@/lib/utils"
import { StatusIcon, type Person } from "./values"

const DAY = 86_400_000
const SHOWN = 4
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY
const isoOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10)

export function RecordCalendar({ collection, records, config, openId, onOpen, onPatch, onNew, actions }: {
  collection: Collection
  records: CollectionRecord[]
  config: ViewConfig
  people: Person[]
  openId: string | null
  idOf: (r: CollectionRecord) => string | null
  onOpen: (r: CollectionRecord) => void
  onPatch?: (r: CollectionRecord, values: Record<string, FieldValue | null>) => void
  onNew?: (values: Record<string, FieldValue>) => void
  actions?: (r: CollectionRecord) => MenuAction[]
}) {
  const field = config.start!
  const status = statusFieldOf(collection.fields)
  const now = today()
  const [month, setMonth] = React.useState(now.slice(0, 7))
  const [over, setOver] = React.useState<string | null>(null)
  const wide = useMediaQuery("(min-width: 768px)")

  const byDay = React.useMemo(() => {
    const map = new Map<string, CollectionRecord[]>()
    for (const r of records) {
      const v = r.values[field]
      if (typeof v === "string") map.set(v, [...(map.get(v) ?? []), r])
    }
    return map
  }, [records, field])

  const firstOfMonth = dayOf(`${month}-01`)
  // Monday on or before the 1st; getUTCDay: 0 = Sunday.
  const gridStart = firstOfMonth - ((new Date(firstOfMonth * DAY).getUTCDay() + 6) % 7)
  const cells = Array.from({ length: 42 }, (_, i) => isoOf(gridStart + i))
  const step = (n: number) => {
    const [y, m] = month.split("-").map(Number) as [number, number]
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(d.toISOString().slice(0, 7))
  }
  const title = new Date(firstOfMonth * DAY).toLocaleDateString(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" })
  const weekdays = cells.slice(0, 7).map((iso) => new Date(dayOf(iso) * DAY).toLocaleDateString(appLocale(), { weekday: "short", timeZone: "UTC" }))

  const chip = (r: CollectionRecord) => {
    const option = status ? r.values[status.id] : undefined
    const el = (
      <button
        type="button"
        draggable={!!onPatch}
        onDragStart={(e) => (e.dataTransfer.setData("text/x-record", r.id), (e.dataTransfer.effectAllowed = "move"))}
        onClick={(e) => (e.stopPropagation(), onOpen(r))}
        className={cn("hover:bg-foreground/[0.06] flex h-6 w-full min-w-0 items-center gap-1.5 rounded px-1.5 text-left text-xs", r.id === openId && "ring-primary/50 bg-primary/[0.06] ring-2", isClosed(collection.fields, r.values) && "text-muted-foreground line-through decoration-foreground/30")}
      >
        {status ? <StatusIcon field={status} option={typeof option === "string" ? option : undefined} className="size-3" /> : null}
        <span className="truncate">{r.title}</span>
      </button>
    )
    return actions ? <ActionMenu key={r.id} actions={() => actions(r)}>{el}</ActionMenu> : <React.Fragment key={r.id}>{el}</React.Fragment>
  }

  const drop = (e: React.DragEvent, iso: string) => {
    e.preventDefault()
    setOver(null)
    const r = records.find((x) => x.id === e.dataTransfer.getData("text/x-record"))
    if (r && r.values[field] !== iso) onPatch?.(r, { [field]: iso })
  }

  const header = (
    <div className="flex shrink-0 items-center gap-1 border-b px-4 py-1.5">
      <h3 className="mr-2 text-sm font-semibold capitalize">{title}</h3>
      <Button variant="ghost" size="icon-sm" aria-label={t("Previous month")} title={t("Previous month")} onClick={() => step(-1)}><ChevronLeft /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={t("Next month")} title={t("Next month")} onClick={() => step(1)}><ChevronRight /></Button>
      <Button variant="ghost" size="sm" className="h-7" onClick={() => setMonth(now.slice(0, 7))}>{t("Today")}</Button>
    </div>
  )

  if (!wide) {
    const days = cells.filter((iso) => iso.startsWith(month) && byDay.has(iso))
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {days.length ? days.map((iso) => (
            <section key={iso} className="mb-3">
              <h4 className={cn("text-muted-foreground px-1.5 pb-1 text-xs font-medium", iso === now && "text-primary")}>
                {new Date(dayOf(iso) * DAY).toLocaleDateString(appLocale(), { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })}
              </h4>
              <div className="grid gap-0.5">{byDay.get(iso)!.map(chip)}</div>
            </section>
          )) : <p className="text-muted-foreground p-6 text-center text-sm">{t("Nothing this month")}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="grid shrink-0 grid-cols-7 border-b">
        {weekdays.map((w) => <div key={w} className="text-muted-foreground px-2 py-1 text-xs font-medium">{w}</div>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-y-auto">
        {cells.map((iso) => {
          const list = byDay.get(iso) ?? []
          const inMonth = iso.startsWith(month)
          return (
            <div
              key={iso}
              onDragOver={onPatch ? (e) => (e.preventDefault(), setOver(iso)) : undefined}
              onDragLeave={() => setOver((o) => (o === iso ? null : o))}
              onDrop={onPatch ? (e) => drop(e, iso) : undefined}
              className={cn("group/day flex min-h-24 min-w-0 flex-col gap-0.5 border-r border-b p-1", !inMonth && "bg-foreground/[0.02]", over === iso && "bg-primary/[0.08]")}
            >
              <div className="flex items-center justify-between">
                <span className={cn("grid size-6 place-items-center rounded-full text-xs tabular-nums", !inMonth && "text-muted-foreground/60", iso === now && "bg-primary text-primary-foreground font-semibold")}>
                  {Number(iso.slice(8))}
                </span>
                {onNew ? (
                  <button type="button" aria-label={t("New record on {date}", { date: iso })} onClick={() => onNew({ [field]: iso })} className="text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] grid size-6 place-items-center rounded opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100">
                    <Plus className="size-3.5" />
                  </button>
                ) : null}
              </div>
              {list.slice(0, SHOWN).map(chip)}
              {list.length > SHOWN ? (
                <Popover>
                  <PopoverTrigger className="text-muted-foreground hover:text-foreground px-1.5 text-left text-xs">{tp(list.length - SHOWN, { one: "+{n} more", other: "+{n} more" })}</PopoverTrigger>
                  <PopoverContent align="start" className="grid w-64 gap-0.5 p-1">{list.map(chip)}</PopoverContent>
                </Popover>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
