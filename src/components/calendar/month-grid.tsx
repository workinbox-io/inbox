/** Month view: six weeks, a few events per day and "+N more" (opens the day). Double-click a day for an all-day event. */
import * as React from "react"
import { addDays, sameDay, wallTime, type HourCycle } from "@/lib/calendar/time"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { ActionMenu, type MenuAction } from "@/components/workspace/action-menu"
import { Chip, menuOf, Weekday } from "./time-grid"
import { eventKey, fmt, fmtTime, type Draft, type EventView } from "./shared"

const SHOWN = 3

export function MonthGrid({
  days,
  month,
  tz,
  hourCycle,
  now,
  events,
  colorOf,
  selectedKey,
  onSelect,
  onDay,
  onCreate,
  eventActions,
  spaceActions,
}: {
  days: number[]
  /** 1–12: days outside it are dimmed. */
  month: number
  tz: string
  hourCycle: HourCycle
  now: number
  events: EventView[]
  colorOf: (e: EventView) => string
  selectedKey: string | null
  onSelect: (e: EventView) => void
  onDay: (day: number) => void
  onCreate: (d: Draft) => void
  eventActions: (e: EventView) => MenuAction[]
  spaceActions: (at: number, allDay: boolean) => MenuAction[]
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b">
        {days.slice(0, 7).map((d) => (
          <div key={d} className="text-muted-foreground @container flex min-w-0 justify-center border-l py-1.5 text-xs">
            <Weekday day={d} tz={tz} />
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const next = addDays(d, 1, tz)
          const list = events.filter((e) => e.start < next && e.end > d)
          const w = wallTime(d, tz)
          return (
            <ActionMenu key={d} actions={() => spaceActions(d, true)}>
            <div
              className={cn("flex min-h-0 flex-col gap-0.5 overflow-hidden border-b border-l p-1", w.month !== month && "bg-muted/30")}
              onDoubleClick={() => onCreate({ start: d, end: next, allDay: true })}
            >
              <button
                type="button"
                onClick={() => onDay(d)}
                className={cn(
                  "hover:bg-muted grid size-6 shrink-0 place-items-center self-start rounded-full text-xs tabular-nums",
                  sameDay(d, now, tz) && "bg-primary text-primary-foreground hover:bg-primary",
                  w.month !== month && "text-muted-foreground",
                )}
              >
                {w.day}
              </button>
              {list.slice(0, SHOWN).map((e) =>
                e.allDay ? (
                  <Chip key={eventKey(e)} e={e} color={colorOf(e)} selected={selectedKey === eventKey(e)} onClick={() => onSelect(e)} actions={menuOf(eventActions(e))} />
                ) : (
                  <ActionMenu key={eventKey(e)} actions={menuOf(eventActions(e))}>
                  <button
                    type="button"
                    onContextMenu={(ev) => ev.stopPropagation()}
                    onClick={() => onSelect(e)}
                    className={cn("hover:bg-muted flex items-center gap-1 truncate rounded px-1 text-left text-[11px]", selectedKey === eventKey(e) && "bg-muted", e.myStatus === "declined" && "line-through opacity-50")}
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: colorOf(e) }} />
                    <span className="text-muted-foreground tabular-nums">{fmtTime(e.start, tz, hourCycle)}</span>
                    <span className="truncate">{e.role === "busy" ? t("Busy") : e.title || t("(No title)")}</span>
                  </button>
                  </ActionMenu>
                ),
              )}
              {list.length > SHOWN ? (
                <button type="button" onClick={() => onDay(d)} className="text-muted-foreground hover:text-foreground px-1 text-left text-[11px]">
                  {t("+{count} more", { count: list.length - SHOWN })}
                </button>
              ) : null}
            </div>
            </ActionMenu>
          )
        })}
      </div>
    </div>
  )
}
