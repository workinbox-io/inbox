import { navigatePanel } from "@/lib/panel-history"
/**
 * The open event on the right (a Sheet on phones): title, time, repeat, people with their answers, meeting link,
 * place, notes, reminder and calendar. Changes are saved with "Save"; the app asks which part of a series they
 * apply to. Invited people answer with Yes / Maybe / No.
 */
import * as React from "react"
import { AlignLeft, ArrowUpRight, Bell, CalendarDays, Clock, MapPin, NotebookPen, Repeat, Trash2, Users, Video, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { ConfirmDialog } from "@/components/app/confirm-button"
import { UserAvatar } from "@/components/app/user-avatar"
import { AddressInput, ComposeFooter, ComposeFrame, type AddressSuggestion } from "@/components/mail/compose"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { addDays } from "@/lib/calendar/time"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { CALENDAR_COLORS, dayKey, joinDayTime, parseDayKey, repeatPresets, timeKey, type CalendarView, type Draft, type EventView, type Scope } from "./shared"

const searchContacts = (q: string) =>
  api<{ suggestions: AddressSuggestion[] }>("GET", `/api/app/contacts/suggest?q=${encodeURIComponent(q)}`).then((r) => r.suggestions)

const REMINDERS = [null, 0, 5, 10, 15, 30, 60, 1440]
const reminderLabel = (m: number | null) =>
  m === null ? t("No reminder") : m === 0 ? t("At the start") : m < 60 ? t("{n} minutes before", { n: m }) : m < 1440 ? t("{n} hours before", { n: m / 60 }) : t("1 day before")

const STATUS: Record<string, string> = { accepted: "Going", declined: "Not going", tentative: "Maybe", "needs-action": "Waiting" }

export interface EventBody {
  calendarId?: string
  title?: string
  description?: string
  location?: string
  url?: string
  start?: number
  end?: number
  allDay?: boolean
  rrule?: string | null
  attendees?: { email: string; name?: string; optional?: boolean }[]
  reminders?: number[]
  busy?: boolean
  timezone?: string
}

interface Form {
  title: string
  description: string
  location: string
  url: string
  startDay: string
  startTime: string
  endDay: string
  endTime: string
  allDay: boolean
  rrule: string
  attendees: string[]
  reminder: number | null
  calendarId: string
  busy: boolean
}

function initial(e: EventView | null, d: Draft | null, tz: string, calendarId: string, defaultReminder: number | null): Form {
  const start = e?.start ?? d!.start
  const allDay = e?.allDay ?? d!.allDay
  // All-day events end at the next midnight; the form shows the last day.
  const end = allDay ? addDays(e?.end ?? d!.end, -1, tz) : (e?.end ?? d!.end)
  return {
    title: e?.title ?? d?.title ?? "",
    description: e?.description ?? "",
    location: e?.location ?? "",
    url: e?.url ?? "",
    startDay: dayKey(start, tz),
    startTime: timeKey(start, tz),
    endDay: dayKey(Math.max(end, start), tz),
    endTime: timeKey(e?.end ?? d!.end, tz),
    allDay,
    rrule: e?.rrule ?? "",
    attendees: e?.attendees.map((a) => a.email) ?? [],
    reminder: e ? (e.reminders[0] ?? null) : allDay ? null : defaultReminder,
    calendarId: e?.calendarId ?? calendarId,
    busy: e?.busy ?? !allDay,
  }
}

function times(f: Form, tz: string) {
  if (f.allDay) {
    const start = parseDayKey(f.startDay, tz)
    const last = parseDayKey(f.endDay, tz)
    if (start === null || last === null) return null
    return { start, end: addDays(Math.max(last, start), 1, tz) }
  }
  const start = joinDayTime(f.startDay, f.startTime, tz)
  const end = joinDayTime(f.endDay, f.endTime, tz)
  if (start === null || end === null) return null
  return { start, end: Math.max(end, start) }
}

export function EventPanel({
  event,
  draft,
  tz,
  calendars,
  defaultReminder,
  onClose,
  onCreate,
  onSave,
  onDelete,
  onRsvp,
  onDraft,
  open = true,
}: {
  open?: boolean
  event: EventView | null
  draft: Draft | null
  tz: string
  calendars: CalendarView[]
  defaultReminder: number | null
  onClose: () => void
  onCreate: (body: EventBody) => Promise<void>
  onSave: (e: EventView, body: EventBody) => Promise<void>
  onDelete: (e: EventView) => Promise<void>
  onRsvp: (e: EventView, status: "accepted" | "declined" | "tentative") => Promise<void>
  /** The form's times and title changed while drafting, so the rectangle in the grid follows. */
  onDraft?: (d: Draft) => void
}) {
  const writable = calendars.filter((c) => c.role === "owner" || c.role === "edit")
  const start = React.useMemo(
    () => initial(event, draft, tz, writable.find((c) => c.personal)?.id ?? writable[0]?.id ?? "", defaultReminder),
    // A draft's form starts from it once (the panel is keyed per draft); later moves only patch the times below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, tz],
  )
  const formId = React.useId()
  const [f, setF] = React.useState(start)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => setF(start), [start])
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }))
  const editable = !event || event.role === "owner" || event.role === "edit"
  const range = times(f, tz)

  /** A new start keeps the event's length, like other calendars (all-day events only push the end day forward). */
  function setStart(patch: { startDay?: string; startTime?: string }) {
    const was = times(f, tz)
    const s = f.allDay ? null : joinDayTime(patch.startDay ?? f.startDay, patch.startTime ?? f.startTime, tz)
    if (!was || s === null) {
      const day = patch.startDay ?? f.startDay
      return set({ ...patch, ...(day > f.endDay ? { endDay: day } : {}) })
    }
    const end = s + (was.end - was.start)
    set({ ...patch, endDay: dayKey(end, tz), endTime: timeKey(end, tz) })
  }

  // Grid → form: the draft's rectangle was moved or resized.
  React.useEffect(() => {
    if (event || !draft) return
    const now = times(f, tz)
    if (now && now.start === draft.start && now.end === draft.end && f.allDay === draft.allDay) return
    const d = initial(null, draft, tz, "", null)
    set({ startDay: d.startDay, startTime: d.startTime, endDay: d.endDay, endTime: d.endTime, allDay: d.allDay })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.start, draft?.end, draft?.allDay])

  // Form → grid: times or title typed in the panel.
  React.useEffect(() => {
    if (!open || event || !range || !onDraft) return
    onDraft({ start: range.start, end: range.end, allDay: f.allDay, title: f.title.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end, f.allDay, f.title, open])
  const presets = repeatPresets(range?.start ?? Date.now(), tz)
  const custom = f.rrule && !presets.some((p) => p.value === f.rrule)

  function body(): EventBody | null {
    if (!range) return null
    const prev = event?.attendees ?? []
    const out: EventBody = {
      title: f.title.trim(),
      description: f.description,
      location: f.location.trim(),
      url: f.url.trim(),
      start: range.start,
      end: range.end,
      allDay: f.allDay,
      rrule: f.rrule || null,
      attendees: f.attendees.map((email) => {
        const p = prev.find((a) => a.email === email)
        return { email, ...(p?.name ? { name: p.name } : {}), ...(p ? { optional: p.optional } : {}) }
      }),
      reminders: f.reminder === null ? [] : [f.reminder],
      calendarId: f.calendarId || undefined,
      busy: f.busy,
    }
    if (!event) return { ...out, timezone: tz }
    // Only what changed, so a series' other fields and the attendees' answers stay put.
    const was = times(start, tz)!
    const diff: EventBody = {}
    for (const k of ["title", "description", "location", "url", "allDay", "busy", "calendarId"] as const)
      if (out[k] !== (k === "calendarId" ? event.calendarId : (event as unknown as Record<string, unknown>)[k])) (diff as Record<string, unknown>)[k] = out[k]
    if (out.start !== was.start || out.end !== was.end || out.allDay !== event.allDay) Object.assign(diff, { start: out.start, end: out.end })
    if ((out.rrule ?? null) !== (event.rrule ?? null)) diff.rrule = out.rrule
    if (f.attendees.join() !== start.attendees.join()) diff.attendees = out.attendees
    if (f.reminder !== start.reminder) diff.reminders = out.reminders
    return diff
  }

  async function save() {
    const b = body()
    if (!b) return
    setBusy(true)
    try {
      if (event) await onSave(event, b)
      else await onCreate(b)
    } finally {
      setBusy(false)
    }
  }

  const dirty = JSON.stringify(f) !== JSON.stringify(start) || !event
  const field = "h-8 bg-transparent"

  const [discarding, setDiscarding] = React.useState(false)
  const filled = !event && !!(f.title.trim() || f.description.trim() || f.location.trim() || f.url.trim() || f.attendees.length)
  const requestClose = () => filled ? setDiscarding(true) : onClose()

  const content = (
    <div className="flex h-full min-h-0 flex-col">
      {event ? <header className="flex min-h-12 items-center gap-1 border-b px-3">
        <span className="text-muted-foreground flex-1 text-xs font-medium">{event ? (editable ? t("Event") : t("Event (view only)")) : t("New event")}</span>
        {event && editable ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("Delete")} onClick={() => void onDelete(event)}>
            <Trash2 />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon-sm" aria-label={t("Close")} onClick={onClose}>
          <X />
        </Button>
      </header> : null}
      <form
        id={formId}
        className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) void save()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (dirty && range && !busy) e.currentTarget.requestSubmit()
          }
        }}
      >
        <input
          id="event-title"
          autoFocus={!event}
          value={f.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={t("Event title")}
          disabled={!editable}
          maxLength={500}
          className="bg-transparent text-lg font-semibold outline-none"
        />

        {event?.myStatus ? (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground mr-1 text-xs">{t("Going?")}</span>
            {(["accepted", "tentative", "declined"] as const).map((s) => (
              <Button key={s} type="button" size="sm" variant={event.myStatus === s ? "default" : "outline"} onClick={() => void onRsvp(event, s)}>
                {s === "accepted" ? t("Yes") : s === "tentative" ? t("Maybe") : t("No")}
              </Button>
            ))}
          </div>
        ) : null}

        <Row icon={Clock}>
          <div className="grid gap-1.5">
            <div className="flex items-center gap-1.5">
              <Input type="date" aria-label={t("Starts")} className={cn(field, "min-w-0 flex-1")} value={f.startDay} disabled={!editable} onChange={(e) => setStart({ startDay: e.target.value })} />
              {!f.allDay ? <Input type="time" step={900} aria-label={t("Start time")} className={cn(field, "w-28")} value={f.startTime} disabled={!editable} onChange={(e) => setStart({ startTime: e.target.value })} /> : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Input type="date" aria-label={t("Ends")} className={cn(field, "min-w-0 flex-1")} value={f.endDay} min={f.startDay} disabled={!editable} onChange={(e) => set({ endDay: e.target.value })} />
              {!f.allDay ? <Input type="time" step={900} aria-label={t("End time")} className={cn(field, "w-28")} value={f.endTime} disabled={!editable} onChange={(e) => set({ endTime: e.target.value })} /> : null}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={f.allDay} disabled={!editable} onCheckedChange={(v) => set({ allDay: !!v, busy: !v })} />
              {t("All day")}
            </label>
            {!range ? <p className="text-destructive text-xs">{t("Check the date and time.")}</p> : null}
          </div>
        </Row>

        <Row icon={Repeat}>
          <Select value={f.rrule || "none"} onValueChange={(v) => set({ rrule: v === "none" ? "" : v })} disabled={!editable}>
            <SelectTrigger size="sm" aria-label={t("Repeat")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.value || "none"} value={p.value || "none"}>
                  {p.label}
                </SelectItem>
              ))}
              {custom ? <SelectItem value={f.rrule}>{t("Custom: {rule}", { rule: f.rrule })}</SelectItem> : null}
            </SelectContent>
          </Select>
        </Row>

        <Row icon={Users}>
          <div className="grid gap-2">
            {editable ? (
              <div className="rounded-md border px-2 py-1">
                <AddressInput id="event-people" value={f.attendees} onChange={(attendees) => set({ attendees })} suggestions={[]} search={searchContacts} placeholder={t("Add people")} />
              </div>
            ) : null}
            {event?.organizer ? (
              <p className="text-muted-foreground text-xs">{t("Organized by {email}", { email: event.organizer.email })}</p>
            ) : null}
            {event?.attendees.length ? (
              <ul className="grid gap-1">
                {event.attendees.map((a) => (
                  <li key={a.email} className="flex items-center gap-2 text-sm">
                    <UserAvatar seed={a.email} size={20} />
                    <span className="min-w-0 flex-1 truncate">{a.name || a.email}</span>
                    <span className={cn("text-xs", a.status === "accepted" ? "text-emerald-600" : a.status === "declined" ? "text-destructive" : "text-muted-foreground")}>
                      {t(STATUS[a.status]!)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : !editable ? (
              <p className="text-muted-foreground text-xs">{t("No guests")}</p>
            ) : null}
          </div>
        </Row>

        <Row icon={Video}>
          <div className="flex items-center gap-1.5">
            <Input type="url" className={field} value={f.url} disabled={!editable} onChange={(e) => set({ url: e.target.value })} placeholder={t("Meeting link")} />
            {event?.url ? (
              <Button type="button" size="sm" asChild>
                <a href={event.url} target="_blank" rel="noopener noreferrer">
                  {t("Join")}
                </a>
              </Button>
            ) : null}
          </div>
        </Row>

        {event && event.role !== "busy" ? <MeetingNotes event={event} /> : null}

        <Row icon={MapPin}>
          <Input className={field} value={f.location} disabled={!editable} onChange={(e) => set({ location: e.target.value })} placeholder={t("Location")} maxLength={500} />
        </Row>

        <Row icon={AlignLeft}>
          <Textarea value={f.description} disabled={!editable} onChange={(e) => set({ description: e.target.value })} placeholder={t("Description")} rows={4} />
        </Row>

        <Row icon={Bell}>
          <Select value={String(f.reminder)} onValueChange={(v) => set({ reminder: v === "null" ? null : Number(v) })} disabled={!editable}>
            <SelectTrigger size="sm" aria-label={t("Reminder")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDERS.map((m) => (
                <SelectItem key={String(m)} value={String(m)}>
                  {reminderLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row icon={CalendarDays}>
          <div className="grid gap-2">
            <Select value={f.calendarId} onValueChange={(calendarId) => set({ calendarId })} disabled={!editable || !writable.length}>
              <SelectTrigger size="sm" aria-label={t("Calendar")} className="w-full">
                <SelectValue placeholder={t("Calendar")} />
              </SelectTrigger>
              <SelectContent>
                {(editable ? writable : calendars).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="size-2.5 rounded-sm" style={{ background: CALENDAR_COLORS[c.color] ?? c.color }} />
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={!f.busy} disabled={!editable} onCheckedChange={(v) => set({ busy: !v })} />
              {t("Show me as free")}
            </label>
          </div>
        </Row>

      </form>
      {editable ? (
        <ComposeFooter>
          <Button type="button" variant="ghost" size="sm" onClick={requestClose}>{t("Cancel")}</Button>
          <span className="flex-1" />
          <Button type="submit" form={formId} size="sm" loading={busy} disabled={!dirty || !range || busy}>
            {event ? t("Save changes") : t("Create event")}
          </Button>
        </ComposeFooter>
      ) : null}
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={t("Discard this event?")}
        description={t("What you've entered will be lost.")}
        confirmLabel={t("Discard")}
        onConfirm={onClose}
      />
    </div>
  )
  return event ? content : (
    <ComposeFrame open={open} title={t("New event")} closeLabel={t("Close")} dockedOnMobile onClose={requestClose}>
      {content}
    </ComposeFrame>
  )
}

/** Keep the form mounted while its window closes or is hidden behind availability. */
export function NewEventWindow({ draft, open, ...props }: Omit<React.ComponentProps<typeof EventPanel>, "event" | "draft"> & { draft: Draft | null; open: boolean }) {
  const [lastDraft, setLastDraft] = React.useState(draft)
  if (draft && draft !== lastDraft) setLastDraft(draft)
  return lastDraft ? <EventPanel {...props} event={null} draft={draft ?? lastDraft} open={open} /> : null
}

/** "Meeting notes": opens the event's note (shared with its people), making it the first time. */
function MeetingNotes({ event }: { event: EventView }) {
  const path = `/api/app/calendar/events/${event.id}/notes${event.occurrence ? `?occurrence=${event.occurrence}` : ""}`
  const [note, setNote] = React.useState<{ id: string; title: string } | null | undefined>(undefined)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    let live = true
    setNote(undefined)
    api<{ note: { id: string; title: string } | null }>("GET", path)
      .then((r) => live && setNote(r.note))
      .catch(() => live && setNote(null))
    return () => {
      live = false
    }
  }, [path])
  async function open() {
    setBusy(true)
    try {
      const r = await api<{ note: { id: string } }>("POST", path)
      navigatePanel(`/app/notes/${r.note.id}`)
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Row icon={NotebookPen}>
      {/* Looks like the rows' fields around it: a placeholder until the note exists, then a link to it. */}
      <button
        type="button"
        disabled={note === undefined || busy}
        onClick={() => void open()}
        className="border-input hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex h-8 w-full min-w-0 items-center gap-2 rounded-xl border bg-transparent px-3 text-left text-sm outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
      >
        <span className={cn("min-w-0 flex-1 truncate", !note && "text-muted-foreground/60 dark:text-muted-foreground/50")}>{note ? t("Meeting notes") : t("Take meeting notes")}</span>
        {note ? <ArrowUpRight className="text-muted-foreground size-4 shrink-0" /> : null}
      </button>
    </Row>
  )
}

function Row({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="text-muted-foreground mt-2 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** "This event / This and following / All events" for changes to a series. Resolves null when dismissed. */
export function useScopePrompt() {
  const [ask, setAsk] = React.useState<{ title: string; resolve: (s: Scope | null) => void } | null>(null)
  const prompt = React.useCallback((title: string) => new Promise<Scope | null>((resolve) => setAsk({ title, resolve })), [])
  const done = (s: Scope | null) => {
    ask?.resolve(s)
    setAsk(null)
  }
  const dialog = (
    <Dialog open={!!ask} onOpenChange={(o) => !o && done(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{ask?.title}</DialogTitle>
          <DialogDescription>{t("This event repeats.")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button autoFocus onClick={() => done("this")}>{t("This event")}</Button>
          <Button variant="outline" onClick={() => done("following")}>
            {t("This and following events")}
          </Button>
          <Button variant="outline" onClick={() => done("all")}>
            {t("All events")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  return { prompt, dialog }
}
