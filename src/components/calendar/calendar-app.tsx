/**
 * /app/calendar, keyboard-first like Cron: week view by default (also day and month), the rail with the mini month,
 * calendars and colleagues overlaid, the open event on the right. Address: ?date=YYYY-MM-DD&view=&event=<id>[:<occurrence>].
 * Shortcuts: c new, t today, j/k or arrows previous/next, d/w/m views, a availability, / add a colleague, Esc close,
 * Backspace delete, Enter edit the title.
 */
import * as React from "react"
import { CalendarCheck, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, CircleHelp, Copy, ExternalLink, PanelRightOpen, Trash2, UserPlus, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import { AppFrame } from "@/components/workspace/app-frame"
import { IconAction } from "@/components/workspace/detail-header"
import { shortcutsPaused, useAppLayout, useMounted } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import type { Slot } from "@/lib/calendar/availability"
import { sameDay, startOfDay, wallTime } from "@/lib/calendar/time"
import { t } from "@/lib/i18n/panel"
import { replaceUrl } from "@/lib/panel-history"
import { cn } from "@/lib/utils"
import { AvailabilityBar } from "./availability-bar"
import { CalendarRail } from "./calendar-rail"
import { EventPanel, useScopePrompt, type EventBody } from "./event-panel"
import { MonthGrid } from "./month-grid"
import {
  atMinute,
  browserZone,
  CALENDAR_COLORS,
  canEdit,
  dayKey,
  eventKey,
  fmt,
  fmtRange,
  LS,
  parseDayKey,
  personColor,
  rangeOf,
  stepDate,
  type CalendarView,
  type Draft,
  type EventView,
  type Prefs,
  type Scope,
  type ViewMode,
} from "./shared"
import { TimeGrid } from "./time-grid"

export interface CalendarAppProps {
  calendars: CalendarView[]
  prefs: Prefs
  canManage: boolean
  /** The user view: full screen, the account menu at the bottom of the rail. */
  account?: MailUser
}

const VIEWS: ViewMode[] = ["day", "week", "month"]
const IMPORT_MAX = 2 * 1024 * 1024

export function CalendarApp(props: CalendarAppProps) {
  const mounted = useMounted()
  const [prefs, setPrefs] = React.useState(props.prefs)
  const tz = prefs.timezones[0] ?? (mounted ? browserZone() : "UTC")
  const [calendars, setCalendars] = React.useState(props.calendars)
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())
  const [people, setPeople] = React.useState<string[]>([])
  const [view, setView] = React.useState<ViewMode>("week")
  const [date, setDate] = React.useState(() => Date.now())
  const [events, setEvents] = React.useState<EventView[]>([])
  const [loading, setLoading] = React.useState(false)
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [opened, setOpened] = React.useState<EventView | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  // Each new draft gets a fresh panel; moving or resizing it keeps what's typed.
  const [draftSeq, setDraftSeq] = React.useState(0)
  const newDraft = (d: Draft) => (setDraftSeq((n) => n + 1), setDraft(d))
  const [slots, setSlots] = React.useState<Slot[] | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())
  const fileRef = React.useRef<HTMLInputElement>(null)
  const { ref: frameRef, desktop } = useAppLayout()
  const scope = useScopePrompt()

  const { days, from, to } = React.useMemo(() => rangeOf(date, view, tz, prefs.weekStart), [date, view, tz, prefs.weekStart])
  const shownIds = calendars.filter((c) => !hidden.has(c.id)).map((c) => c.id).join(",")

  const load = React.useCallback(async () => {
    const q = new URLSearchParams({ from: String(from), to: String(to), calendars: shownIds || "none" })
    if (people.length) q.set("people", people.join(","))
    setLoading(true)
    try {
      setEvents((await api<{ events: EventView[] }>("GET", `/api/app/calendar/events?${q}`)).events)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [from, to, shownIds, people])

  React.useEffect(() => {
    if (mounted) void load()
  }, [load, mounted])

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const reloadCalendars = React.useCallback(async () => {
    try {
      setCalendars((await api<{ calendars: CalendarView[] }>("GET", "/api/app/calendar/calendars")).calendars)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [])

  // ---------- opening and drafting ----------

  const close = React.useCallback(() => {
    setSelectedKey(null)
    setOpened(null)
    setDraft(null)
  }, [])

  const select = React.useCallback((e: EventView) => {
    if (e.role === "busy") return
    setDraft(null)
    setSelectedKey(eventKey(e))
    setOpened(e)
  }, [])

  async function openKey(key: string) {
    const [id, occ] = key.split(":")
    if (!id) return
    try {
      const e = await api<EventView>("GET", `/api/app/calendar/events/${id}`)
      const occurrence = occ ? Number(occ) : null
      // An occurrence of a series: same event, that occurrence's times.
      const shifted = occurrence !== null && e.occurrence === null && e.rrule ? { ...e, occurrence, start: occurrence, end: occurrence + (e.end - e.start) } : e
      setSelectedKey(eventKey(shifted))
      setOpened(shifted)
      setDate(shifted.start)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const newEvent = React.useCallback(
    (at?: number) => {
      const zone = tz
      const base = at ?? date
      const start = sameDay(base, Date.now(), zone)
        ? Math.ceil(Date.now() / 1_800_000) * 1_800_000
        : atMinute(startOfDay(base, zone), Math.max(prefs.workStart, 9 * 60), zone)
      setSelectedKey(null)
      setOpened(null)
      newDraft({ start, end: start + 3_600_000, allDay: false })
    },
    [date, tz, prefs.workStart],
  )

  // Address in, once: view, date, open event, ?new=1; then the saved rail choices.
  React.useEffect(() => {
    const p = new URLSearchParams(location.search)
    const zone = props.prefs.timezones[0] ?? browserZone()
    const v = p.get("view") as ViewMode | null
    if (v && VIEWS.includes(v)) setView(v)
    else if (window.innerWidth < 640) setView("day")
    const d = parseDayKey(p.get("date"), zone)
    if (d !== null) setDate(d)
    const ev = p.get("event")
    if (ev) void openKey(ev)
    else if (p.get("new")) newEvent()
    setHidden(new Set(LS.read<string[]>("calendar.hidden", [])))
    setPeople(LS.read<string[]>("calendar.people", []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Address out.
  React.useEffect(() => {
    if (!mounted) return
    const url = new URL(location.href)
    url.searchParams.delete("new")
    url.searchParams.set("date", dayKey(date, tz))
    url.searchParams.set("view", view)
    if (selectedKey) url.searchParams.set("event", selectedKey.replace(/:$/, ""))
    else url.searchParams.delete("event")
    replaceUrl(url)
  }, [mounted, date, view, selectedKey, tz])

  const toggleCalendar = (id: string) =>
    setHidden((h) => {
      const next = new Set(h)
      if (!next.delete(id)) next.add(id)
      LS.write("calendar.hidden", [...next])
      return next
    })

  const choosePeople = (ids: string[]) => {
    setPeople(ids)
    LS.write("calendar.people", ids)
  }

  // ---------- changes ----------

  async function askScope(e: EventView, title: string): Promise<Scope | null> {
    return e.rrule && e.occurrence !== null ? scope.prompt(title) : "all"
  }

  async function patchEvent(e: EventView, body: EventBody, s: Scope) {
    if (!e.rrule || e.occurrence === null) return api<EventView>("PATCH", `/api/app/calendar/events/${e.id}`, body)
    const { rrule: _drop, ...one } = body
    if (s === "this" && e.id !== e.seriesId) return api<EventView>("PATCH", `/api/app/calendar/events/${e.id}`, one)
    return api<EventView>("PATCH", `/api/app/calendar/events/${e.seriesId}`, { ...(s === "this" ? one : body), scope: s, occurrence: e.occurrence })
  }

  async function save(e: EventView, body: EventBody) {
    if (!Object.keys(body).length) return close()
    const s = await askScope(e, t("Change a repeating event"))
    if (!s) return
    try {
      const saved = await patchEvent(e, body, s)
      toast.success(t("Saved"))
      if (e.rrule || saved.rrule) close()
      else {
        setOpened(saved)
        setSelectedKey(eventKey(saved))
      }
    } catch (err) {
      toast.error((err as Error).message)
    }
    await load()
  }

  async function move(e: EventView, start: number, end: number) {
    const s = await askScope(e, t("Move a repeating event"))
    if (!s) return
    const key = eventKey(e)
    setEvents((list) => list.map((x) => (eventKey(x) === key ? { ...x, start, end } : x)))
    try {
      await patchEvent(e, { start, end }, s)
      if (opened && eventKey(opened) === key) setOpened({ ...opened, start, end })
    } catch (err) {
      toast.error((err as Error).message)
    }
    await load()
  }

  async function create(body: EventBody) {
    try {
      const made = await api<EventView>("POST", "/api/app/calendar/events", body)
      setDraft(null)
      setOpened(made)
      setSelectedKey(eventKey(made))
      toast.success(t("Event created"))
    } catch (err) {
      toast.error((err as Error).message)
    }
    await load()
  }

  async function remove(e: EventView) {
    const s = await askScope(e, t("Delete a repeating event"))
    if (!s) return
    try {
      const series = e.rrule && e.occurrence !== null
      await api("DELETE", series ? `/api/app/calendar/events/${e.seriesId}?scope=${s}&occurrence=${e.occurrence}` : `/api/app/calendar/events/${e.id}`)
      close()
      toast.success(t("Event deleted"))
    } catch (err) {
      toast.error((err as Error).message)
    }
    await load()
  }

  async function rsvp(e: EventView, status: "accepted" | "declined" | "tentative") {
    try {
      const saved = await api<EventView>("POST", `/api/app/calendar/events/${e.id}/rsvp`, { status })
      setOpened({ ...e, myStatus: saved.myStatus, attendees: saved.attendees })
    } catch (err) {
      toast.error((err as Error).message)
    }
    await load()
  }

  async function importFile(file: File) {
    if (file.size > IMPORT_MAX) return void toast.error(t("The file is too big (2 MB at most)."))
    const target = calendars.find((c) => c.personal && c.role === "owner") ?? calendars.find((c) => c.role === "owner" || c.role === "edit")
    if (!target) return void toast.error(t("You have no calendar to import into."))
    const id = toast.loading(t("Importing…"))
    try {
      const r = await api<{ created: number; updated: number }>("POST", "/api/app/calendar/import", { calendarId: target.id, ics: await file.text() })
      toast.success(t("Imported: {created} new, {updated} updated.", r), { id })
    } catch (err) {
      toast.error((err as Error).message, { id })
    }
    await load()
  }

  // ---------- right-click menus ----------

  function eventActions(e: EventView): MenuAction[] {
    if (e.role === "busy") return []
    const editable = canEdit(e)
    return cleanActions([
      { label: t("Open"), icon: PanelRightOpen, shortcut: "↵", onSelect: () => select(e) },
      e.url ? { label: t("Join meeting"), icon: ExternalLink, onSelect: () => void window.open(e.url, "_blank", "noopener") } : null,
      e.myStatus ? { separator: true } : null,
      e.myStatus ? { label: t("Going"), icon: Check, disabled: e.myStatus === "accepted", onSelect: () => rsvp(e, "accepted") } : null,
      e.myStatus ? { label: t("Maybe"), icon: CircleHelp, disabled: e.myStatus === "tentative", onSelect: () => rsvp(e, "tentative") } : null,
      e.myStatus ? { label: t("Not going"), icon: X, disabled: e.myStatus === "declined", onSelect: () => rsvp(e, "declined") } : null,
      { separator: true },
      editable
        ? {
            label: t("Duplicate"),
            icon: Copy,
            onSelect: () =>
              create({
                calendarId: e.calendarId,
                title: e.title,
                description: e.description,
                location: e.location,
                url: e.url,
                start: e.start,
                end: e.end,
                allDay: e.allDay,
                timezone: e.timezone,
                busy: e.busy,
                reminders: e.reminders,
              }),
          }
        : null,
      { label: t("Go to day"), icon: CalendarDays, onSelect: () => (setDate(e.start), setView("day")) },
      editable ? { separator: true } : null,
      editable ? { label: t("Delete"), icon: Trash2, destructive: true, shortcut: "⌫", onSelect: () => remove(e) } : null,
    ])
  }

  function spaceActions(at: number, allDay: boolean): MenuAction[] {
    const startNew = (d: { start: number; end: number; allDay: boolean }) => (setSelectedKey(null), setOpened(null), newDraft(d))
    return cleanActions([
      allDay
        ? { label: t("New all-day event"), icon: CalendarPlus, onSelect: () => startNew({ start: startOfDay(at, tz), end: stepDate(startOfDay(at, tz), "day", 1, tz), allDay: true }) }
        : { label: t("New event here"), icon: CalendarPlus, shortcut: "C", onSelect: () => startNew({ start: at, end: at + 30 * 60_000, allDay: false }) },
      { label: slots ? t("Leave availability") : t("Pick availability"), icon: CalendarCheck, shortcut: "A", onSelect: () => setSlots((s) => (s ? null : [])) },
      { separator: true },
      view !== "day" ? { label: t("Open this day"), icon: CalendarDays, shortcut: "D", onSelect: () => (setDate(at), setView("day")) } : null,
      { label: t("Today"), shortcut: "T", onSelect: () => setDate(Date.now()) },
    ])
  }

  // ---------- keyboard ----------

  const selected = (selectedKey && events.find((e) => eventKey(e) === selectedKey)) || opened
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutsPaused(e)) return
      const go = (fn: () => void) => (e.preventDefault(), fn())
      switch (e.key) {
        case "c":
          return go(() => newEvent())
        case "t":
          return go(() => setDate(Date.now()))
        case "j":
        case "ArrowRight":
          return go(() => setDate((d) => stepDate(d, view, 1, tz)))
        case "k":
        case "ArrowLeft":
          return go(() => setDate((d) => stepDate(d, view, -1, tz)))
        case "d":
          return go(() => setView("day"))
        case "w":
          return go(() => setView("week"))
        case "m":
          return go(() => setView("month"))
        case "a":
          return go(() => setSlots((s) => (s ? null : [])))
        case "/":
          return go(() => setPickerOpen(true))
        case "Escape":
          return slots ? go(() => setSlots(null)) : selected || draft ? go(close) : undefined
        case "Enter":
          return selected ? go(() => document.getElementById("event-title")?.focus()) : undefined
        case "Backspace":
        case "Delete":
          return selected && canEdit(selected) ? go(() => void remove(selected)) : undefined
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // ---------- render ----------

  const colorOf = (e: EventView) =>
    e.person ? personColor(e.person, people) : (CALENDAR_COLORS[calendars.find((c) => c.id === e.calendarId)?.color ?? "blue"] ?? CALENDAR_COLORS.blue!)

  const title =
    view === "day"
      ? fmt(date, tz, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : view === "month"
        ? fmt(date, tz, { month: "long", year: "numeric" })
        : wallTime(days[0]!, tz).month === wallTime(days[6]!, tz).month
          ? fmt(days[0]!, tz, { month: "long", year: "numeric" })
          : `${fmt(days[0]!, tz, { month: "short" })} – ${fmt(days[6]!, tz, { month: "short", year: "numeric" })}`
  // Shown instead when the header has room: the week's exact dates.
  const longTitle = view === "week" ? fmtRange(days[0]!, days[6]!, tz, { day: "numeric", month: "long", year: "numeric" }) : title

  const panelOpen = !!(selected || draft)
  const panel = panelOpen ? (
    <EventPanel
      key={draft ? `draft:${draftSeq}` : selectedKey!}
      event={draft ? null : selected!}
      draft={draft}
      tz={tz}
      calendars={calendars}
      defaultReminder={prefs.defaultReminder}
      onClose={close}
      onCreate={create}
      onSave={save}
      onDelete={remove}
      onRsvp={rsvp}
      onDraft={(d) => setDraft((x) => (x && x.start === d.start && x.end === d.end && x.allDay === d.allDay && x.title === d.title ? x : d))}
    />
  ) : null

  const rail = (
    <CalendarRail
      date={date}
      tz={tz}
      prefs={prefs}
      calendars={calendars}
      hidden={hidden}
      people={people}
      pickerOpen={pickerOpen}
      account={props.account}
      canManage={props.canManage}
      onDate={(d) => setDate(d)}
      onNew={() => newEvent()}
      onToggle={toggleCalendar}
      onCalendars={reloadCalendars}
      onPeople={choosePeople}
      onPickerOpen={setPickerOpen}
      settingsOpen={settingsOpen}
      onSettingsOpen={setSettingsOpen}
      onPrefs={setPrefs}
      onImport={() => fileRef.current?.click()}
    />
  )

  return (
    <AppFrame ref={frameRef} userView={!!props.account}>
      {desktop ? rail : null}
      <div className="@container/cal flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 flex-wrap items-center gap-1 border-b px-2 py-1.5 md:px-3">
          <Button variant="outline" size="sm" onClick={() => setDate(Date.now())}>
            {t("Today")}
          </Button>
          <IconAction label={t("Previous (k)")} onClick={() => setDate((d) => stepDate(d, view, -1, tz))}>
            <ChevronLeft />
          </IconAction>
          <IconAction label={t("Next (j)")} onClick={() => setDate((d) => stepDate(d, view, 1, tz))}>
            <ChevronRight />
          </IconAction>
          <h1 className={cn("order-last ml-1 min-w-0 basis-full truncate text-sm font-semibold sm:order-none sm:basis-auto sm:flex-1", loading && "opacity-60")}>{mounted ? (
              <>
                <span className="@3xl/cal:hidden">{title}</span>
                <span className="hidden @3xl/cal:inline">{longTitle}</span>
              </>
            ) : (
              ""
            )}
          </h1>
          <IconAction label={t("Availability (a)")} onClick={() => setSlots((s) => (s ? null : []))}>
            <CalendarCheck className={cn(slots && "text-emerald-600")} />
          </IconAction>
          {!desktop ? (
            <IconAction label={t("Show a colleague's calendar (/)")} onClick={() => setPickerOpen(true)}>
              <UserPlus />
            </IconAction>
          ) : null}
          <SegmentedControl
            size="sm"
            aria-label={t("View")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "day", label: t("Day"), shortLabel: "D" },
              { value: "week", label: t("Week"), shortLabel: "W" },
              { value: "month", label: t("Month"), shortLabel: "M" },
            ]}
          />
          {!desktop && props.account ? <AccountMenu user={props.account} canManage={props.canManage} compact /> : null}
        </header>
        {!mounted ? (
          <div className="flex-1" />
        ) : view === "month" ? (
          <MonthGrid
            days={days}
            month={wallTime(date, tz).month}
            tz={tz}
            now={now}
            events={events}
            colorOf={colorOf}
            selectedKey={selectedKey}
            onSelect={select}
            onDay={(d) => (setDate(d), setView("day"))}
            onCreate={(d) => (setSelectedKey(null), setOpened(null), newDraft(d))}
            eventActions={eventActions}
            spaceActions={spaceActions}
          />
        ) : (
          <TimeGrid
            days={days}
            tz={tz}
            zones={prefs.timezones.slice(1)}
            events={events}
            colorOf={colorOf}
            editable={canEdit}
            selectedKey={selectedKey}
            draft={draft}
            slots={slots}
            now={now}
            workStart={prefs.workStart}
            onSelect={select}
            onCreate={(d) => (setSelectedKey(null), setOpened(null), newDraft(d))}
            onDraft={setDraft}
            onZones={() => setSettingsOpen(true)}
            onChange={(e, s, en) => void move(e, s, en)}
            onSlots={setSlots}
            onDay={(d) => (setDate(d), setView("day"))}
            eventActions={eventActions}
            spaceActions={spaceActions}
          />
        )}
        {slots ? <AvailabilityBar slots={slots} zones={[tz, ...prefs.timezones.slice(1)]} onClear={() => setSlots([])} onDone={() => setSlots(null)} /> : null}
      </div>
      {desktop && panel ? <aside className="w-[clamp(340px,26vw,440px)] shrink-0 border-l">{panel}</aside> : null}
      {!desktop ? (
        <Sheet open={panelOpen} onOpenChange={(o) => !o && close()}>
          <SheetContent className="w-full gap-0 p-0 sm:max-w-md" showCloseButton={false}>
            <SheetTitle className="sr-only">{t("Event")}</SheetTitle>
            {panel}
          </SheetContent>
        </Sheet>
      ) : null}
      {scope.dialog}
      <input
        ref={fileRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) void importFile(file)
        }}
      />
    </AppFrame>
  )
}
