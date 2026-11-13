/**
 * Day and week views: time-zone gutters on the left (the first zone is the grid's own), an all-day row, hours
 * below. Drag on empty space to create, drag a block to move it (also to another day), drag its bottom edge to
 * resize; 15-minute steps. In availability mode the same drag picks free slots instead.
 */
import * as React from "react"
import { Sunrise, Sunset, X } from "lucide-react"
import { ActionMenu, type MenuAction } from "@/components/workspace/action-menu"
import { tint } from "@/components/workspace/ui"
import { availableSlots, type Slot } from "@/lib/calendar/availability"
import { layoutDay } from "@/lib/calendar/layout"
import { sunTimes, type SunLocation } from "@/lib/calendar/sun"
import { addDays, minuteOfDay, sameDay, startOfDay, wallTime, zoneAbbr, type HourCycle } from "@/lib/calendar/time"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { TODAY_CIRCLE, atMinute, eventKey, fmt, fmtTime, HOUR, isAllDayRow, SNAP, type Draft, type EventView } from "./shared"

/** The weekday as wide as its column allows ("M", "Mon", "Monday"); the parent must be an `@container`. */
export function Weekday({ day, tz, className }: { day: number; tz: string; className?: string }) {
  return (
    <span className={cn("truncate uppercase", className)}>
      <span className="@min-[3.5rem]:hidden">{fmt(day, tz, { weekday: "narrow" })}</span>
      <span className="hidden @min-[3.5rem]:inline @min-[9rem]:hidden">{fmt(day, tz, { weekday: "short" })}</span>
      <span className="hidden @min-[9rem]:inline">{fmt(day, tz, { weekday: "long" })}</span>
    </span>
  )
}

interface Props {
  days: number[]
  tz: string
  hourCycle?: HourCycle
  /** Extra zones shown in more gutters (the grid's own zone first is implied). */
  zones: string[]
  events: EventView[]
  colorOf: (e: EventView) => string
  editable: (e: EventView) => boolean
  selectedKey: string | null
  draft: Draft | null
  /** Non-null in availability mode. */
  slots: Slot[] | null
  availabilityReady: boolean
  now: number
  sunLocation: SunLocation | null
  approximateSun?: boolean
  workStart: number
  onSelect: (e: EventView) => void
  onCreate: (d: Draft) => void
  /** The unsaved new event's rectangle was moved or resized. */
  onDraft: (d: Draft) => void
  /** The zone labels above the hours open the time zone settings. */
  onZones: () => void
  /** Right-click on the unsaved new event. */
  draftActions: () => MenuAction[]
  onChange: (e: EventView, start: number, end: number) => void
  onSlots: (slots: Slot[]) => void
  onDay: (day: number) => void
  /** Right-click on an event. */
  eventActions: (e: EventView) => MenuAction[]
  /** Right-click on empty space: the instant under the pointer (15-minute step), or the day for the all-day row. */
  spaceActions: (at: number, allDay: boolean) => MenuAction[]
}

/** Undefined for nothing to do, so the browser's own menu stays. */
export const menuOf = (actions: MenuAction[]) => (actions.length ? actions : undefined)
/** An event's menu must not also open the empty-space menu around it. */
const own = (e: React.MouseEvent) => e.stopPropagation()

type Draw = { kind: "create" | "slot"; day: number; from: number; to: number; x: number; y: number; moved: boolean }
/** Moving or resizing an event, or the unsaved draft (`event` null). */
type Edit = { kind: "move" | "resize" | "resize-start"; event: EventView | null; target: { start: number; end: number }; day: number; grabDay: number; grabMin: number; min: number; x: number; y: number; moved: boolean }
type Drag = Draw | Edit
const drawing = (d: Drag): d is Draw => d.kind === "create" || d.kind === "slot"

const GUTTER = 52
const DRAFT_COLOR = "#4f8ff7"
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
const snapDown = (m: number) => Math.floor(m / SNAP) * SNAP

export function TimeGrid(props: Props) {
  const { days, tz, hourCycle, zones, events, slots } = props
  const gutter = hourCycle === "h12" ? 64 : GUTTER
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const colsRef = React.useRef<HTMLDivElement>(null)
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const dragRef = React.useRef<Drag | null>(null)
  // Where the last right-click on empty space landed (day index, minute).
  const spot = React.useRef({ day: 0, min: 0 })
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
    const e = d.target
    if (d.kind === "resize-start") {
      const start = atMinute(days[d.day]!, Math.round(d.min / SNAP) * SNAP, tz)
      return { start: Math.min(start, e.end - SNAP * 60_000), end: e.end }
    }
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
    // Menus are portals, but React bubbles their clicks through the tree: a menu item must not draw or drag here.
    if (slots && !props.availabilityReady) return
    if (e.button !== 0 || !(e.currentTarget as Node).contains(e.target as Node)) return
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
    const range = d.moved ? p : { start: p.start, end: Math.min(p.start + 30 * 60_000, addDays(days[d.day]!, 1, tz)) }
    if (drawing(d)) {
      if (d.kind === "create") props.onCreate({ ...range, allDay: false })
      else if (props.availabilityReady) props.onSlots([...(slots ?? []), range])
    } else if (!d.moved) {
      if (d.event) props.onSelect(d.event)
    } else if (p.start !== d.target.start || p.end !== d.target.end) {
      if (d.event) props.onChange(d.event, p.start, p.end)
      else props.onDraft({ ...props.draft!, start: p.start, end: p.end, allDay: false })
    }
    // Drawing, clicking or moving the new event: back to typing its title (the panel's field).
    if (d.kind === "create" || (!drawing(d) && !d.event)) requestAnimationFrame(() => document.getElementById("event-title")?.focus())
  }

  const live = drag && !drawing(drag) && drag.moved ? drag : null
  const ghost = drag && drawing(drag) && drag.moved ? { kind: drag.kind, ...preview(drag) } : null

  const today = props.now
  const firstDay = days[0]!
  const nowMinute = minuteOfDay(today, tz)

  return (
    <div className="flex min-h-0 flex-1 flex-col select-none">
      {/* Day headers and the all-day row */}
      <div className="flex border-b">
        <div className="flex shrink-0 items-end" style={{ width: gutter * (zones.length + 1) }}>
          {[...zones].reverse().concat(tz).map((z) => (
            <button
              key={z}
              type="button"
              onClick={props.onZones}
              className="text-muted-foreground hover:bg-muted hover:text-foreground mb-0.5 truncate rounded px-1 py-0.5 text-center text-[10px]"
              style={{ width: gutter }}
              title={`${z} · ${t("Calendar settings")}`}
              aria-label={`${zoneAbbr(firstDay, z)}, ${t("Calendar settings")}`}
            >
              {zoneAbbr(firstDay, z)}
            </button>
          ))}
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => {
            const isToday = sameDay(d, today, tz)
            return (
              <button key={d} type="button" onClick={() => props.onDay(d)} className="hover:bg-muted/50 @container flex min-w-0 items-baseline justify-center border-l py-1.5 text-xs">
                <span className="flex min-w-0 items-baseline justify-center gap-1.5">
                  <Weekday day={d} tz={tz} className="text-muted-foreground" />
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-sm font-medium tabular-nums", isToday && TODAY_CIRCLE)}>
                    {wallTime(d, tz).day}
                  </span>
                  <span className="text-muted-foreground hidden truncate @min-[15rem]:inline">{fmt(d, tz, { month: "long" })}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex border-b">
        <div className="text-muted-foreground shrink-0 px-1 py-1 text-right text-[10px]" style={{ width: gutter * (zones.length + 1) }}>
          {t("All day")}
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => {
            const next = addDays(d, 1, tz)
            const list = allDay.filter((e) => e.start < next && e.end > d)
            return (
              <ActionMenu key={d} actions={() => props.spaceActions(d, true)}>
                <div className="grid min-h-7 content-start gap-0.5 border-l p-0.5" onDoubleClick={() => !slots && props.onCreate({ start: d, end: next, allDay: true })}>
                  {list.map((e) => (
                    <Chip
                      key={eventKey(e)}
                      e={e}
                      color={props.colorOf(e)}
                      selected={props.selectedKey === eventKey(e)}
                      onClick={() => props.onSelect(e)}
                      actions={menuOf(props.eventActions(e))}
                    />
                  ))}
                </div>
              </ActionMenu>
            )
          })}
        </div>
      </div>

      {/* Hours */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: HOUR * 24 }}>
          {[...zones].reverse().concat(tz).map((z, zi, all) => (
            <div key={z} className={cn("relative shrink-0", zi === all.length - 1 ? "" : "text-muted-foreground/70")} style={{ width: gutter }}>
              {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => {
                const instant = atMinute(firstDay, h * 60, tz)
                return (
                  <span key={h} className="text-muted-foreground absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums" style={{ top: h * HOUR }}>
                    {fmt(instant, z, { hour: "numeric", minute: wallTime(instant, z).minute ? "2-digit" : undefined, hourCycle })}
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
                <ActionMenu key={d} actions={() => props.spaceActions(atMinute(days[spot.current.day]!, snapDown(spot.current.min), tz), false)}>
                <div
                  className={cn("@container relative border-l", slots && "cursor-crosshair touch-none")}
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR}px)` }}
                  onContextMenu={(e) => (spot.current = at(e.clientX, e.clientY))}
                  onPointerDown={(e) => {
                    const { min } = at(e.clientX, e.clientY)
                    begin(e, { kind: slots ? "slot" : "create", day: di, from: min, to: min, x: e.clientX, y: e.clientY, moved: false })
                  }}
                >
                  {props.sunLocation ? sunTimes(d, tz, props.sunLocation).map(({ kind, at }) => {
                    const Icon = kind === "sunrise" ? Sunrise : Sunset
                    const label = t(kind === "sunrise" ? "Sunrise" : "Sunset")
                    const time = `${props.approximateSun ? "≈ " : ""}${fmtTime(at, tz, hourCycle)}`
                    return (
                      <div key={`${kind}-${at}`} className="pointer-events-none absolute inset-x-0 z-[1] flex -translate-y-1/2 items-center gap-1 text-muted-foreground" style={{ top: (minuteOfDay(at, tz) / 60) * HOUR }} role="img" aria-label={`${label} · ${props.approximateSun ? t("Approximate time") + " · " : ""}${fmtTime(at, tz, hourCycle)}`}>
                        <span className="min-w-1 flex-1 border-t border-dashed border-current opacity-25" />
                        <span className="bg-background/90 mr-1 flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px] tabular-nums">
                          <Icon className="size-3" aria-hidden="true" />
                          <span className="hidden @min-[15rem]:inline">{label}</span>
                          {time}
                        </span>
                      </div>
                    )
                  }) : null}
                  {sameDay(d, today, tz) ? (
                    <div className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center" style={{ top: (nowMinute / 60) * HOUR }} role="img" aria-label={`${t("Current time")} · ${fmtTime(today, tz, hourCycle)}`}>
                      {/* The dot meets the line with an inverted corner radius: arcs (r 2) tangent to both, no hard corner. */}
                      <svg className="fill-calendar-today absolute -left-1 h-2 w-3.5" viewBox="0 0 14 8" aria-hidden="true">
                        <path d="M7.555 2.167A2 2 0 0 0 9.333 3.25H14V4.75H9.333A2 2 0 0 0 7.555 5.833A4 4 0 1 1 7.555 2.167Z" />
                      </svg>
                      <span className="bg-calendar-today h-[1.5px] flex-1 rounded-full" />
                      <span className="bg-calendar-today text-calendar-today-foreground mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm">{fmtTime(today, tz, hourCycle)}</span>
                    </div>
                  ) : null}
                  {mine.map((e) => {
                    const key = eventKey(e)
                    const moving = live?.event && eventKey(live.event) === key
                    const { top, bottom } = span(e)
                    const p = placed.get(key)!
                    const can = !slots && props.editable(e)
                    return (
                      <Block
                        key={key}
                        e={e}
                        tz={tz} hourCycle={hourCycle}
                        color={props.colorOf(e)}
                        selected={props.selectedKey === key}
                        dim={!!moving}
                        style={{
                          top: (top / 60) * HOUR,
                          height: Math.max(((bottom - top) / 60) * HOUR - 1, 16),
                          left: `${(p.col / p.cols) * 100}%`,
                          width: `calc(${100 / p.cols}% - 2px)`,
                        }}
                        onPointerDown={(ev) => (slots && (!e.busy || e.myStatus === "declined" || e.status === "cancelled") ? undefined : can ? begin(ev, { kind: "move", event: e, target: e, ...grab(ev), x: ev.clientX, y: ev.clientY, moved: false }) : ev.stopPropagation())}
                        onClick={(ev) => (ev.stopPropagation(), !can && !slots && props.onSelect(e))}
                        onResize={can ? (ev, kind) => begin(ev, { kind, event: e, target: e, ...grab(ev), x: ev.clientX, y: ev.clientY, moved: false }) : undefined}
                        actions={slots ? undefined : menuOf(props.eventActions(e))}
                      />
                    )
                  })}
                  {live && sameDay(preview(live).start, d, tz) ? (
                    <Ghost
                      tz={tz} hourCycle={hourCycle}
                      color={live.event ? props.colorOf(live.event) : DRAFT_COLOR}
                      title={live.event ? live.event.title : props.draft?.title || t("New event")}
                      {...preview(live)}
                      day={d}
                    />
                  ) : null}
                  {ghost && sameDay(ghost.start, d, tz) ? (ghost.kind === "slot" ? availableSlots([ghost], events) : [ghost]).map((range) => (
                    <Ghost key={range.start} tz={tz} hourCycle={hourCycle} color={DRAFT_COLOR} slot={ghost.kind === "slot"} title="" {...range} day={d} />
                  )) : null}
                  {!ghost && !(live && !live.event) && props.draft && !props.draft.allDay && sameDay(props.draft.start, d, tz) ? (
                    <DraftBlock
                      actions={menuOf(props.draftActions())}
                      draft={props.draft}
                      day={d}
                      tz={tz} hourCycle={hourCycle}
                      onPointerDown={(ev, kind) => begin(ev, { kind, event: null, target: props.draft!, ...grab(ev), x: ev.clientX, y: ev.clientY, moved: false })}
                    />
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
                          onContextMenu={own}
                          onClick={(ev) => (ev.stopPropagation(), props.onSlots(slots!.filter((x) => x !== s)))}
                          className="group absolute inset-x-0.5 z-10 flex items-start justify-between overflow-hidden rounded-md border border-primary bg-primary/15 px-1.5 py-0.5 text-left text-[11px] font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ top: (top / 60) * HOUR, height: ((bottom - top) / 60) * HOUR - 1 }}
                          aria-label={`${t("Remove slot")}: ${fmtTime(s.start, tz, hourCycle)} – ${fmtTime(s.end, tz, hourCycle)}`}
                        >
                          {fmtTime(s.start, tz, hourCycle)} – {fmtTime(s.end, tz, hourCycle)}
                          <X className="size-3 opacity-0 group-hover:opacity-100" />
                        </button>
                      )
                    })}
                </div>
                </ActionMenu>
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

/** The colour's own darker shade for text on its tint (Notion Calendar style: no side bar, the block is the colour). */
const ink = (color: string) => `color-mix(in oklab, ${color} 60%, var(--foreground))`

function blockStyle(e: EventView, color: string, selected = false): React.CSSProperties {
  if (selected) return { ...solid(color), borderColor: color }
  if (e.role === "busy") return { background: `repeating-linear-gradient(135deg, ${tint(color, 22)} 0 5px, ${tint(color, 8)} 5px 10px)`, color: ink(color) }
  if (e.myStatus === "needs-action" || e.status === "tentative") return { background: tint(color, 6), borderColor: tint(color, 70), color: ink(color) }
  return { background: tint(color, 22), color: ink(color) }
}

/** The solid look of what's being dragged or drawn. */
const solid = (color: string): React.CSSProperties => ({ background: color, color: "var(--ink-dark)" })

function Block({
  e,
  tz,
  hourCycle,
  color,
  selected,
  dim,
  style,
  onPointerDown,
  onClick,
  onResize,
  actions,
}: {
  e: EventView
  tz: string
  hourCycle?: HourCycle
  color: string
  selected: boolean
  dim: boolean
  style: React.CSSProperties
  onPointerDown: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
  onResize?: (e: React.PointerEvent, kind: "resize" | "resize-start") => void
  actions?: MenuAction[]
}) {
  const short = e.end - e.start <= 45 * 60_000
  const title = e.role === "busy" ? t("Busy") : e.title || t("(No title)")
  return (
    <ActionMenu actions={actions}>
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${fmtTime(e.start, tz, hourCycle)}`}
      onContextMenu={own}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={cn(
        // The background-coloured outline keeps overlapping blocks apart.
        "absolute z-10 cursor-pointer overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight shadow-[0_0_0_1px_var(--background)]",
        e.myStatus === "needs-action" || e.status === "tentative" ? "border border-dashed" : "",
        e.myStatus === "declined" && "line-through opacity-50",
        selected && "z-20 shadow-md",
        dim && "opacity-40",
      )}
      style={{ ...style, ...blockStyle(e, color, selected) }}
    >
      <div className={cn("truncate font-medium", short && "inline")}>{title}</div>
      <div className={cn("truncate tabular-nums opacity-75", short && "ml-1 inline")}>
        {fmtTime(e.start, tz, hourCycle)}
        {short ? "" : ` – ${fmtTime(e.end, tz, hourCycle)}`}
      </div>
      {!short && e.location && e.role !== "busy" ? <div className="truncate opacity-75">{e.location}</div> : null}
      {onResize ? (
        <>
          <div onPointerDown={(ev) => onResize(ev, "resize-start")} className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize" aria-hidden />
          <div onPointerDown={(ev) => onResize(ev, "resize")} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" aria-hidden />
        </>
      ) : null}
    </div>
    </ActionMenu>
  )
}

/** The unsaved new event: drag it to move, its top and bottom handles to change the times. */
function DraftBlock({
  draft,
  day,
  tz,
  hourCycle,
  actions,
  onPointerDown,
}: {
  draft: Draft
  day: number
  tz: string
  hourCycle?: HourCycle
  actions?: MenuAction[]
  onPointerDown: (e: React.PointerEvent, kind: "move" | "resize" | "resize-start") => void
}) {
  const next = addDays(day, 1, tz)
  const top = draft.start <= day ? 0 : minuteOfDay(draft.start, tz)
  const bottom = draft.end >= next ? 1440 : minuteOfDay(draft.end, tz) || 1440
  const height = Math.max(((bottom - top) / 60) * HOUR - 1, 16)
  const handle = "absolute inset-x-0 flex h-2.5 cursor-ns-resize justify-center"
  // Inverse of the theme (dark pills on light, light on dark), so they read on the solid block and the grid alike.
  const pill = "bg-foreground border-background h-1 w-6 rounded-full border shadow-sm transition-opacity"
  return (
    <ActionMenu actions={actions}>
    <div
      role="group"
      aria-label={t("New event")}
      onContextMenu={own}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onClick={(e) => e.stopPropagation()}
      className="group/draft absolute inset-x-0.5 z-30 cursor-grab rounded-md px-1.5 py-0.5 text-[11px] leading-tight shadow-lg active:cursor-grabbing"
      style={{ top: (top / 60) * HOUR, height, ...solid(DRAFT_COLOR) }}
    >
      <div className={cn("truncate font-medium", height < 30 && "inline")}>{draft.title || t("New event")}</div>
      <div className={cn("tabular-nums opacity-85", height < 30 && "ml-1 inline")}>
        {fmtTime(draft.start, tz, hourCycle)} – {fmtTime(draft.end, tz, hourCycle)}
      </div>
      <div onPointerDown={(e) => onPointerDown(e, "resize-start")} className={cn(handle, "-top-1 items-start")} aria-hidden>
        <span className={pill} />
      </div>
      <div onPointerDown={(e) => onPointerDown(e, "resize")} className={cn(handle, "-bottom-1 items-end")} aria-hidden>
        <span className={pill} />
      </div>
    </div>
    </ActionMenu>
  )
}

/** What's being dragged or drawn: solid, or (`slot`) looking like the picked availability slots it will become. */
function Ghost({ start, end, day, tz, hourCycle, color, title, slot }: { start: number; end: number; day: number; tz: string; hourCycle?: HourCycle; color: string; title: string; slot?: boolean }) {
  const next = addDays(day, 1, tz)
  const top = start <= day ? 0 : minuteOfDay(start, tz)
  const bottom = end >= next ? 1440 : minuteOfDay(end, tz) || 1440
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0.5 z-30 rounded-md px-1.5 py-0.5 text-[11px] leading-tight",
        slot ? "border-primary bg-primary/15 text-primary border font-medium" : "shadow-lg",
      )}
      style={{ top: (top / 60) * HOUR, height: Math.max(((bottom - top) / 60) * HOUR - 1, 16), ...(slot ? {} : solid(color)) }}
    >
      {title ? <div className="truncate font-medium">{title}</div> : null}
      <div className={cn("tabular-nums", !slot && "opacity-85")}>
        {fmtTime(start, tz, hourCycle)} – {fmtTime(end, tz, hourCycle)}
      </div>
    </div>
  )
}

export function Chip({ e, color, selected, onClick, actions }: { e: EventView; color: string; selected: boolean; onClick: () => void; actions?: MenuAction[] }) {
  return (
    <ActionMenu actions={actions}>
    <button
      type="button"
      onContextMenu={own}
      onClick={(ev) => (ev.stopPropagation(), onClick())}
      className={cn(
        "truncate rounded px-1.5 py-px text-left text-[11px] font-medium",
        (e.myStatus === "needs-action" || e.status === "tentative") && !selected && "border border-dashed",
        e.myStatus === "declined" && "line-through opacity-50",
      )}
      style={blockStyle(e, color, selected)}
    >
      {e.role === "busy" ? t("Busy") : e.title || t("(No title)")}
    </button>
    </ActionMenu>
  )
}
