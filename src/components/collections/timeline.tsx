/**
 * A collection as a timeline, like Linear's: records on the left (status, ID, title), bars from the view's start date
 * to its end date (or one day) on a scrolling day grid with months and days above, weekends shaded and a line at today.
 * Zoom by week, month or quarter. Editors drag a bar to move it by whole days, or its edges to change start and end
 * (when the view has an end field); a click without moving opens the record. Records without a start date wait under
 * "No dates".
 */
import * as React from "react"
import { Button } from "@/components/ui/button"
import { ActionMenu, type MenuAction } from "@/components/workspace/action-menu"
import { isClosed, statusFieldOf, type FieldValue } from "@/lib/collections/fields"
import { today } from "@/lib/collections/settings"
import type { ViewConfig } from "@/lib/collections/view-config"
import { appLocale, t } from "@/lib/i18n/panel"
import type { Collection, CollectionRecord } from "@/lib/server/collections"
import { cn } from "@/lib/utils"
import { StatusIcon, optionColor, type Person } from "./values"

const DAY = 86_400_000
const ZOOMS = { week: 40, month: 14, quarter: 5 } as const
type Zoom = keyof typeof ZOOMS

const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY
const isoOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10)
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)

type Drag = { id: string; mode: "move" | "start" | "end"; x: number; delta: number; moved: boolean }

export function RecordTimeline({ collection, records, config, openId, idOf, onOpen, onPatch, actions }: {
  collection: Collection
  records: CollectionRecord[]
  config: ViewConfig
  people: Person[]
  openId: string | null
  idOf: (r: CollectionRecord) => string | null
  onOpen: (r: CollectionRecord) => void
  onPatch?: (r: CollectionRecord, values: Record<string, FieldValue | null>) => void
  actions?: (r: CollectionRecord) => MenuAction[]
}) {
  const [zoom, setZoom] = React.useState<Zoom>("month")
  const px = ZOOMS[zoom]
  const startId = config.start!
  const endId = config.end
  const status = statusFieldOf(collection.fields)
  const now = dayOf(today())
  const scroller = React.useRef<HTMLDivElement>(null)
  const [drag, setDrag] = React.useState<Drag | null>(null)

  const span = (r: CollectionRecord) => {
    const s = r.values[startId]
    if (!isDate(s)) return null
    const e = endId ? r.values[endId] : undefined
    const a = dayOf(s)
    return { a, b: isDate(e) ? Math.max(a, dayOf(e)) : a }
  }
  const dated = records.filter((r) => span(r)).sort((x, y) => span(x)!.a - span(y)!.a || x.title.localeCompare(y.title))
  const undated = records.filter((r) => !span(r))
  const first = Math.min(now, ...dated.map((r) => span(r)!.a)) - 14
  const last = Math.max(now, ...dated.map((r) => span(r)!.b)) + 60
  const days = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const width = days.length * px

  const scrollToToday = React.useCallback(() => {
    const el = scroller.current
    if (el) el.scrollLeft = (now - first) * px - el.clientWidth / 3
  }, [now, first, px])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount and on zoom only
  React.useEffect(scrollToToday, [zoom])

  /** The span shown while dragging. */
  const live = (r: CollectionRecord) => {
    const s = span(r)!
    if (drag?.id !== r.id) return s
    if (drag.mode === "move") return { a: s.a + drag.delta, b: s.b + drag.delta }
    if (drag.mode === "start") return { a: Math.min(s.b, s.a + drag.delta), b: s.b }
    return { a: s.a, b: Math.max(s.a, s.b + drag.delta) }
  }

  function down(e: React.PointerEvent, r: CollectionRecord, mode: Drag["mode"]) {
    if (e.button !== 0) return
    e.stopPropagation()
    if (!onPatch) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: r.id, mode, x: e.clientX, delta: 0, moved: false })
  }
  function move(e: React.PointerEvent) {
    if (!drag) return
    const delta = Math.round((e.clientX - drag.x) / px)
    if (delta !== drag.delta || (!drag.moved && Math.abs(e.clientX - drag.x) > 3)) setDrag({ ...drag, delta, moved: drag.moved || Math.abs(e.clientX - drag.x) > 3 })
  }
  function up(r: CollectionRecord) {
    const d = drag
    setDrag(null)
    if (!d || !d.moved) return onOpen(r)
    const before = span(r)!
    const after = live(r)
    if (after.a === before.a && after.b === before.b) return
    const values: Record<string, FieldValue | null> = { [startId]: isoOf(after.a) }
    if (endId) values[endId] = isoOf(after.b)
    onPatch?.(r, values)
  }

  // Header: months on top, then days / week starts / nothing by zoom.
  const months: { day: number; n: number }[] = []
  for (const d of days) {
    const m = isoOf(d).slice(0, 7)
    if (months.at(-1) && isoOf(months.at(-1)!.day).slice(0, 7) === m) months.at(-1)!.n++
    else months.push({ day: d, n: 1 })
  }
  const monthName = (d: number) => new Date(d * DAY).toLocaleDateString(appLocale(), { month: zoom === "quarter" ? "short" : "long", year: "numeric", timeZone: "UTC" })
  const weekday = (d: number) => new Date(d * DAY).getUTCDay()
  const ticks = zoom === "quarter" ? [] : days.filter((d) => zoom === "week" || weekday(d) === 1)

  const titleCell = (r: CollectionRecord) => {
    const option = status ? r.values[status.id] : undefined
    const cell = (
      <button type="button" onClick={() => onOpen(r)} className={cn("bg-background sticky left-0 z-10 flex h-9 w-64 shrink-0 items-center gap-2 border-r px-3 text-left text-[13px]", r.id === openId && "bg-[color-mix(in_oklab,var(--primary)_6%,var(--background))]")}>
        {status ? <StatusIcon field={status} option={typeof option === "string" ? option : undefined} /> : null}
        {idOf(r) ? <span className="text-muted-foreground trim-caps shrink-0 font-mono text-[11px]">{idOf(r)}</span> : null}
        <span className="truncate font-medium">{r.title}</span>
      </button>
    )
    return actions ? <ActionMenu actions={() => actions(r)}>{cell}</ActionMenu> : cell
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-1.5">
        <div role="group" aria-label={t("Zoom")} className="bg-muted flex rounded-md p-0.5">
          {(["week", "month", "quarter"] as const).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)} className={cn("h-6 rounded px-2 text-xs font-medium", zoom === z ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {z === "week" ? t("Week") : z === "month" ? t("Month") : t("Quarter")}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="h-7" onClick={scrollToToday}>{t("Today")}</Button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        <div style={{ width: width + 256 }} className="relative min-h-full">
          <div className="bg-background sticky top-0 z-20 flex border-b">
            <div className="bg-background sticky left-0 z-10 w-64 shrink-0 border-r" />
            <div className="relative" style={{ width }}>
              <div className="flex h-6">
                {months.map((m) => (
                  <div key={m.day} style={{ width: m.n * px }} className="text-muted-foreground truncate border-l px-2 text-xs leading-6 font-medium">{monthName(m.day)}</div>
                ))}
              </div>
              <div className="relative h-6">
                {ticks.map((d) => (
                  <span key={d} style={{ left: (d - first) * px, width: zoom === "week" ? px : undefined }} className={cn("text-muted-foreground absolute text-[11px] leading-6 tabular-nums", zoom === "week" ? "text-center" : "pl-1", d === now && "text-primary font-semibold")}>
                    {new Date(d * DAY).getUTCDate()}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="relative">
            {/* Weekends and today, behind the rows. */}
            <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: 256, width }}>
              {zoom !== "quarter" ? days.filter((d) => weekday(d) === 0 || weekday(d) === 6).map((d) => <div key={d} className="bg-foreground/[0.025] absolute inset-y-0" style={{ left: (d - first) * px, width: px }} />) : null}
              <div className="bg-primary absolute inset-y-0 w-px" style={{ left: (now - first) * px + px / 2 }} />
            </div>
            {dated.map((r) => {
              const s = live(r)
              const option = status ? r.values[status.id] : undefined
              const color = status && typeof option === "string" ? optionColor(status, option) : "var(--primary)"
              const left = (s.a - first) * px
              const w = (s.b - s.a + 1) * px
              const handle = "absolute inset-y-0 w-2 cursor-ew-resize"
              return (
                <div key={r.id} className={cn("relative flex h-9 border-b", r.id === openId && "bg-primary/[0.06]")}>
                  {titleCell(r)}
                  <div className="relative" style={{ width }}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${r.title}: ${isoOf(s.a)} – ${isoOf(s.b)}`}
                      onPointerDown={(e) => down(e, r, "move")}
                      onPointerMove={move}
                      onPointerUp={() => up(r)}
                      onPointerCancel={() => setDrag(null)}
                      onKeyDown={(e) => e.key === "Enter" && onOpen(r)}
                      style={{ left, width: Math.max(w, 6), background: `color-mix(in oklab, ${color} 22%, var(--background))`, borderColor: color }}
                      className={cn("absolute top-1.5 bottom-1.5 flex items-center overflow-hidden rounded-md border px-2 text-xs font-medium whitespace-nowrap select-none", onPatch ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", isClosed(collection.fields, r.values) && "opacity-50", drag?.id === r.id && "ring-primary/40 ring-2")}
                    >
                      {w > 40 ? <span className="truncate">{r.title}</span> : null}
                      {onPatch && endId ? (
                        <>
                          <span className={cn(handle, "left-0")} onPointerDown={(e) => down(e, r, "start")} onPointerMove={(e) => (e.stopPropagation(), move(e))} onPointerUp={(e) => (e.stopPropagation(), up(r))} />
                          <span className={cn(handle, "right-0")} onPointerDown={(e) => down(e, r, "end")} onPointerMove={(e) => (e.stopPropagation(), move(e))} onPointerUp={(e) => (e.stopPropagation(), up(r))} />
                        </>
                      ) : null}
                    </div>
                    {/* A bar too short for its title gets it beside, like Linear's. */}
                    {w <= 40 ? <span className="text-muted-foreground pointer-events-none absolute top-1/2 -translate-y-1/2 truncate text-xs whitespace-nowrap" style={{ left: left + Math.max(w, 6) + 6, maxWidth: 260 }}>{r.title}</span> : null}
                  </div>
                </div>
              )
            })}
          </div>
          {undated.length ? (
            <div className="sticky left-0 w-64">
              <p className="text-muted-foreground px-3 pt-4 pb-1 text-xs font-medium">{t("No dates")}</p>
              {undated.map((r) => <div key={r.id} className="border-b">{titleCell(r)}</div>)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
