/**
 * Day and week views: time-zone gutters on the left (the first zone is the grid's own), an all-day row, hours
 * below. Drag on empty space to create, drag a block to move it (also to another day), drag its bottom edge to
 * resize; 15-minute steps. In availability mode the same drag picks free slots instead.
 */
import * as React from "react"
import { X } from "lucide-react"
import { tint } from "@/components/workspace/ui"
import type { Slot } from "@/lib/calendar/availability"
import { layoutDay } from "@/lib/calendar/layout"
import { addDays, minuteOfDay, sameDay, startOfDay, wallTime, zoneAbbr } from "@/lib/calendar/time"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { atMinute, eventKey, fmt, fmtTime, HOUR, isAllDayRow, SNAP, type Draft, type EventView } from "./shared"

interface Props {
  days: number[]
  tz: string
  /** Extra zones shown in more gutters (the grid's own zone first is implied). */
  zones: string[]
  events: EventView[]
  colorOf: (e: EventView) => string
  editable: (e: EventView) => boolean
  selectedKey: string | null
  draft: Draft | null
  /** Non-null in availability mode. */
  slots: Slot[] | null
  now: number
  workStart: number
  onSelect: (e: EventView) => void
  onCreate: (d: Draft) => void
  onChange: (e: EventView, start: number, end: number) => void
  onSlots: (slots: Slot[]) => void
  onDay: (day: number) => void
}

type Draw = { kind: "create" | "slot"; day: number; from: number; to: number; x: number; y: number; moved: boolean }
type Edit = { kind: "move" | "resize"; event: EventView; day: number; grabDay: number; grabMin: number; min: number; x: number; y: number; moved: boolean }
type Drag = Draw | Edit
const drawing = (d: Drag): d is Draw => d.kind === "create" || d.kind === "slot"

const GUTTER = 52
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
const snapDown = (m: number) => Math.floor(m / SNAP) * SNAP

export function TimeGrid(props: Props) {
  const { days, tz, zones, events, slots } = props
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const colsRef = React.useRef<HTMLDivElement>(null)
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const dragRef = React.useRef<Drag | null>(null)
  const set = (d: Drag | null) => {
    dragRef.current = d
    setDrag(d)
  }

  // Start the day near the working hours.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: Math.max(0, (props.workStart / 60 - 1) * HOUR) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length])

  const timed = events.filter((e) => !isAllDayRow(e))
  const allDay = events.filter(isAllDayRow)

  /** Day index and minute under the pointer. */
  function at(clientX: number, clientY: number) {
    const r = colsRef.current!.getBoundingClientRect()
    const day = clamp(Math.floor(((clientX - r.left) / r.width) * days.length), 0, days.length - 1)
    const min = clamp(((clientY - r.top) / HOUR) * 60, 0, 1440)
    return { day, min }
  }

  function preview(d: Drag): { start: number; end: number } {
    if (drawing(d)) {
      const a = snapDown(Math.min(d.from, d.to))
      const b = Math.max(a + SNAP, Math.ceil(Math.max(d.from, d.to) / SNAP) * SNAP)
      return { start: atMinute(days[d.day]!, a, tz), end: atMinute(days[d.day]!, Math.min(b, 1440), tz) }
    }
    const e = d.event
    if (d.kind === "move") {
      const shift = Math.round((d.min - d.grabMin) / SNAP) * SNAP
      const startMin = clamp(minuteOfDay(e.start, tz) + shift, 0, 1440 - SNAP)
      const startDay = addDays(startOfDay(e.start, tz), d.day - d.grabDay, tz)
      const start = atMinute(startDay, startMin, tz)
      return { start, end: start + (e.end - e.start) }
    }
    const end = atMinute(days[d.day]!, Math.round(d.min / SNAP) * SNAP, tz)
    return { start: e.start, end: Math.max(e.start + SNAP * 60_000, end) }
  }

  function begin(e: React.PointerEvent, d: Drag) {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    set(d)
  }

  function onMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const moved = d.moved || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4
    const { day, min } = at(e.clientX, e.clientY)
    if (drawing(d)) set({ ...d, to: min, moved })
    else set({ ...d, day, min, moved })
  }

  function onUp() {
    const d = dragRef.current
    set(null)
    if (!d) return
    const p = preview(d)
    // A plain click makes 30 minutes, like Cron.
    const range = d.moved ? p : { start: p.start, end: p.start + 30 * 60_000 }
    if (drawing(d)) {
      if (d.kind === "create") props.onCreate({ ...range, allDay: false })
      else props.onSlots([...(slots ?? []), range])
    } else if (!d.moved) props.onSelect(d.event)
    else if (p.start !== d.event.start || p.end !== d.event.end) props.onChange(d.event, p.start, p.end)
  }

  const live = drag && !drawing(drag) && drag.moved ? drag : null
  const ghost = drag && drawing(drag) && drag.moved ? { kind: drag.kind, ...preview(drag) } : null

  const today = props.now
  const firstDay = days[0]!

  return (
    <div className="flex min-h-0 flex-1 flex-col select-none">
      {/* Day headers and the all-day row */}
      <div className="flex border-b">
        <div className="flex shrink-0 items-end" style={{ width: GUTTER * (zones.length + 1) }}>
          {[...zones].reverse().concat(tz).map((z) => (
            <div key={z} className="text-muted-foreground w-[52px] truncate px-1 pb-1 text-center text-[10px]" title={z}>
              {zoneAbbr(firstDay, z)}
            </div>
          ))}
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => {
            const isToday = sameDay(d, today, tz)
            return (
              <button key={d} type="button" onClick={() => props.onDay(d)} className="hover:bg-muted/50 flex items-baseline justify-center gap-1.5 border-l py-1.5 text-xs">
                <span className="text-muted-foreground uppercase">{fmt(d, tz, { weekday: "short" })}</span>
                <span className={cn("grid size-6 place-items-center rounded-full text-sm font-medium tabular-nums", isToday && "bg-primary text-primary-foreground")}>
                  {wallTime(d, tz).day}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex border-b">
        <div className="text-muted-foreground shrink-0 px-1 py-1 text-right text-[10px]" style={{ width: GUTTER * (zones.length + 1) }}>
          {t("All day")}
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => {
            const next = addDays(d, 1, tz)
            const list = allDay.filter((e) => e.start < next && e.end > d)
            return (
              <div
                key={d}
                className="grid min-h-7 content-start gap-0.5 border-l p-0.5"
                onDoubleClick={() => props.onCreate({ start: d, end: next, allDay: true })}
              >
                {list.map((e) => (
                  <Chip key={eventKey(e)} e={e} color={props.colorOf(e)} selected={props.selectedKey === eventKey(e)} onClick={() => props.onSelect(e)} />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Hours */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: HOUR * 24 }}>
          {[...zones].reverse().concat(tz).map((z, zi, all) => (
            <div key={z} className={cn("relative w-[52px] shrink-0", zi === all.length - 1 ? "" : "text-muted-foreground/70")}>
              {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => {
                const instant = atMinute(firstDay, h * 60, tz)
                return (
                  <span key={h} className="text-muted-foreground absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums" style={{ top: h * HOUR }}>
                    {fmt(instant, z, { hour: "numeric", minute: wallTime(instant, z).minute ? "2-digit" : undefined })}
                  </span>
                )
              })}
            </div>
          ))}
          <div
            ref={colsRef}
            className="relative grid flex-1"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => set(null)}
          >
            {days.map((d, di) => {
              const next = addDays(d, 1, tz)
              const mine = timed.filter((e) => e.start < next && e.end > d)
              const span = (e: { start: number; end: number }) => ({
                top: e.start <= d ? 0 : minuteOfDay(e.start, tz),
                bottom: e.end >= next ? 1440 : minuteOfDay(e.end, tz) || 1440,
              })
              const placed = new Map(layoutDay(mine.map((e) => ({ id: eventKey(e), start: e.start, end: e.end }))).map((p) => [p.id, p]))
              return (
                <div
                  key={d}
                  className="relative border-l"
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR}px)` }}
                  onPointerDown={(e) => {
                    const { min } = at(e.clientX, e.clientY)
                    begin(e, { kind: slots ? "slot" : "create", day: di, from: min, to: min, x: e.clientX, y: e.clientY, moved: false })
                  }}
                >
                  {sameDay(d, today, tz) ? (
                    <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-red-500" style={{ top: (minuteOfDay(today, tz) / 60) * HOUR }}>
                      <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-red-500" />
                    </div>
                  ) : null}
                  {mine.map((e) => {
                    const key = eventKey(e)
                    const moving = live && eventKey(live.event) === key
                    const { top, bottom } = span(e)
                    const p = placed.get(key)!
                    const can = !slots && props.editable(e)
                    return (
                      <Block
                        key={key}
                        e={e}
                        tz={tz}
                        color={props.colorOf(e)}
                        selected={props.selectedKey === key}
                        dim={!!moving}
                        style={{
                          top: (top / 60) * HOUR,
                          height: Math.max(((bottom - top) / 60) * HOUR - 1, 16),
                          left: `${(p.col / p.cols) * 100}%`,
                          width: `calc(${100 / p.cols}% - 2px)`,
                        }}
                        onPointerDown={(ev) =>
                          can ? begin(ev, { kind: "move", event: e, ...grab(ev), x: ev.clientX, y: ev.clientY, moved: false }) : ev.stopPropagation()
                        }
                        onClick={(ev) => (ev.stopPropagation(), !can && !slots && props.onSelect(e))}
                        onResize={can ? (ev) => begin(ev, { kind: "resize", event: e, ...grab(ev), x: ev.clientX, y: ev.clientY, moved: false }) : undefined}
                      />
                    )
                  })}
                  {live && sameDay(preview(live).start, d, tz) ? (
                    <Ghost tz={tz} color={props.colorOf(live.event)} title={live.event.title} {...preview(live)} day={d} />
                  ) : null}
                  {ghost && sameDay(ghost.start, d, tz) ? <Ghost tz={tz} color={ghost.kind === "slot" ? "#4caf6e" : "#4f8ff7"} title="" {...ghost} day={d} /> : null}
                  {!ghost && props.draft && !props.draft.allDay && sameDay(props.draft.start, d, tz) ? (
                    <Ghost tz={tz} color="#4f8ff7" title={t("New event")} {...props.draft} day={d} />
                  ) : null}
                  {(slots ?? [])
                    .filter((s) => s.start < next && s.end > d)
                    .map((s, i) => {
                      const { top, bottom } = span(s)
                      return (
                        <button
                          key={i}
                          type="button"
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onClick={() => props.onSlots(slots!.filter((x) => x !== s))}
                          className="group absolute inset-x-0.5 z-10 flex items-start justify-between rounded-md border border-emerald-500 bg-emerald-500/15 px-1.5 py-0.5 text-left text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                          style={{ top: (top / 60) * HOUR, height: ((bottom - top) / 60) * HOUR - 1 }}
                          aria-label={t("Remove slot")}
                        >
                          {fmtTime(s.start, tz)} – {fmtTime(s.end, tz)}
                          <X className="size-3 opacity-0 group-hover:opacity-100" />
                        </button>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  /** Where on the block it was grabbed (day index and minute), for moves that keep the offset. */
  function grab(ev: React.PointerEvent) {
    const { day, min } = at(ev.clientX, ev.clientY)
    return { day, grabDay: day, grabMin: min, min }
  }
}

function blockStyle(e: EventView, color: string): React.CSSProperties {
  if (e.role === "busy")
    return { background: `repeating-linear-gradient(135deg, ${tint(color, 22)} 0 5px, ${tint(color, 8)} 5px 10px)`, borderColor: color, color }
  return { background: tint(color, e.myStatus === "needs-action" ? 6 : 18), borderColor: color }
}

function Block({
  e,
  tz,
  color,
  selected,
  dim,
  style,
  onPointerDown,
  onClick,
  onResize,
}: {
  e: EventView
  tz: string
  color: string
  selected: boolean
  dim: boolean
  style: React.CSSProperties
  onPointerDown: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
  onResize?: (e: React.PointerEvent) => void
}) {
  const short = e.end - e.start <= 45 * 60_000
  const title = e.role === "busy" ? t("Busy") : e.title || t("(No title)")
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${fmtTime(e.start, tz)}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={cn(
        "absolute z-10 cursor-pointer overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight",
        e.myStatus === "needs-action" || e.status === "tentative" ? "border border-dashed border-l-[3px]" : "",
        e.myStatus === "declined" && "line-through opacity-50",
        selected && "ring-foreground/60 z-20 ring-2",
        dim && "opacity-40",
      )}
      style={{ ...style, ...blockStyle(e, color) }}
    >
      <div className={cn("truncate font-medium", short && "inline")}>{title}</div>
      <div className={cn("text-foreground/60 truncate tabular-nums", short && "ml-1 inline")}>
        {fmtTime(e.start, tz)}
        {short ? "" : ` – ${fmtTime(e.end, tz)}`}
      </div>
      {!short && e.location && e.role !== "busy" ? <div className="text-foreground/60 truncate">{e.location}</div> : null}
      {onResize ? <div onPointerDown={onResize} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" aria-hidden /> : null}
    </div>
  )
}

function Ghost({ start, end, day, tz, color, title }: { start: number; end: number; day: number; tz: string; color: string; title: string }) {
  const next = addDays(day, 1, tz)
  const top = start <= day ? 0 : minuteOfDay(start, tz)
  const bottom = end >= next ? 1440 : minuteOfDay(end, tz) || 1440
  return (
    <div
      className="pointer-events-none absolute inset-x-0.5 z-30 rounded-md border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight shadow-md"
      style={{ top: (top / 60) * HOUR, height: Math.max(((bottom - top) / 60) * HOUR - 1, 16), background: tint(color, 30), borderColor: color }}
    >
      {title ? <div className="truncate font-medium">{title}</div> : null}
      <div className="tabular-nums">
        {fmtTime(start, tz)} – {fmtTime(end, tz)}
      </div>
    </div>
  )
}

export function Chip({ e, color, selected, onClick }: { e: EventView; color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(ev) => (ev.stopPropagation(), onClick())}
      className={cn("truncate rounded px-1.5 py-px text-left text-[11px] font-medium", selected && "ring-foreground/60 ring-2", e.myStatus === "declined" && "line-through opacity-50")}
      style={blockStyle(e, color)}
    >
      {e.role === "busy" ? t("Busy") : e.title || t("(No title)")}
    </button>
  )
}
