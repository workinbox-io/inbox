/**
 * The calendar's rail: "New event", a mini month, the calendars (click to show or hide, "…" to share, rename,
 * recolour, delete), colleagues overlaid on the grid, and the settings (time zones, week start, subscription link,
 * .ics import).
 */
import * as React from "react"
import { CalendarPlus, Check, ChevronsUpDown, Download, RefreshCw, Globe, Palette, Pencil, Plus, Settings2, Share2, Trash2, UserMinus, UserPlus } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { useNotePeople } from "@/components/notes/editor/people"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { CommandPalette } from "@/components/ui/command-palette"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import { Rail, RailAction, RailItem, RailList, RailSection, RailSectionButton } from "@/components/workspace/rail"
import { ShareDialog } from "@/components/workspace/share-dialog"
import { Kbd } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import { isTimeZone, wallTime } from "@/lib/calendar/time"
import { appLocale, t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { notifySaved, onSettingsSaved, openSettings } from "@/components/settings/open-settings"
import { PrefHeading, PrefList, PrefRow } from "@/components/mailbox/pref-ui"
import { CALENDAR_COLORS, COLOR_NAMES, parseDayKey, personColor, type CalendarView, type Prefs, type ViewMode } from "./shared"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { ConfirmButton } from "@/components/app/confirm-button"
import { useSettingsDraft } from "@/components/settings/settings-draft"

const pad = (n: number) => String(n).padStart(2, "0")

export function CalendarRail({
  date,
  view,
  tz,
  prefs,
  calendars,
  hidden,
  people,
  pickerOpen,
  account,
  canManage,
  onDate,
  onNew,
  onToggle,
  onCalendars,
  onPeople,
  onPickerOpen,
  onImport,
  onSettingsOpen,
}: {
  date: number
  view: ViewMode
  tz: string
  prefs: Prefs
  calendars: CalendarView[]
  hidden: Set<string>
  people: string[]
  pickerOpen: boolean
  account: MailUser
  canManage: boolean
  onDate: (ms: number) => void
  onNew: () => void
  onToggle: (id: string) => void
  onCalendars: () => Promise<void>
  onPeople: (ids: string[]) => void
  onPickerOpen: (open: boolean) => void
  onImport: () => void
  /** Calendar settings (also opened from the grid's zone label). */
  onSettingsOpen: (open: boolean) => void
}) {
  const everyone = useNotePeople()
  const [editing, setEditing] = React.useState<CalendarView | "new" | null>(null)
  const [sharing, setSharing] = React.useState<CalendarView | null>(null)
  const w = wallTime(date, tz)
  const selected = new Date(w.year, w.month - 1, w.day)
  const [month, setMonth] = React.useState(selected)
  // Week view: the whole week shown in the grid gets a band in the mini month.
  const weekFrom = new Date(w.year, w.month - 1, w.day - ((selected.getDay() - prefs.weekStart + 7) % 7))
  const week = view === "week" ? { from: weekFrom, to: new Date(weekFrom.getFullYear(), weekFrom.getMonth(), weekFrom.getDate() + 6) } : undefined
  React.useEffect(() => setMonth(new Date(w.year, w.month - 1, 1)), [w.year, w.month])

  async function remove(c: CalendarView) {
    try {
      await api("DELETE", `/api/app/calendar/calendars/${c.id}`)
      await onCalendars()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function recolor(c: CalendarView, color: string) {
    try {
      await api("PATCH", `/api/app/calendar/calendars/${c.id}`, { color })
      await onCalendars()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const actions = (c: CalendarView): MenuAction[] => [
    { label: hidden.has(c.id) ? t("Show") : t("Hide"), onSelect: () => onToggle(c.id) },
    ...(c.manage
      ? ([
          { label: t("Share…"), icon: Share2, onSelect: () => setSharing(c) },
          { label: t("Rename…"), icon: Pencil, onSelect: () => setEditing(c) },
          {
            label: t("Colour"),
            icon: Palette,
            items: Object.keys(CALENDAR_COLORS).map((color) => ({ label: (c.color === color ? "✓ " : "") + t(COLOR_NAMES[color] ?? color), onSelect: () => recolor(c, color) })),
          },
          ...(!c.personal
            ? [
                { separator: true },
                {
                  label: t("Delete calendar"),
                  icon: Trash2,
                  destructive: true,
                  confirm: { title: t("Delete \"{name}\"?", { name: c.name }), description: t("Its events are deleted for everyone."), confirmLabel: t("Delete") },
                  onSelect: () => remove(c),
                },
              ]
            : []),
        ] as MenuAction[])
      : []),
  ]

  return (
    <>
      <Rail
        label={t("Calendar")}
        hint={
          <>
            <Kbd>C</Kbd> {t("New")} <Kbd>T</Kbd> {t("Today")} <Kbd>A</Kbd> {t("Availability")}
          </>
        }
        footer={<AccountMenu user={account} canManage={canManage} />}
      >
        <RailAction icon={CalendarPlus} label={t("New event")} shortcut="C" onClick={onNew} />
        <Calendar
          mode="single"
          animate
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          weekStartsOn={prefs.weekStart as 0 | 1 | 6}
          modifiers={week ? { week } : undefined}
          modifiersClassNames={{ week: "bg-muted rounded-none! first:rounded-l-full! last:rounded-r-full!" }}
          onSelect={(d) => d && onDate(parseDayKey(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, tz)!)}
          // Spans the (resizable) rail: columns stretch, days stay round cells centred in them.
          // Today: red text, a red circle when it's also the picked day (shared.ts, like the grid's headers).
          classNames={{
            root: "w-full",
            today: "[&_button]:font-semibold [&_button]:text-calendar-today [&_button[data-selected-single=true]]:bg-calendar-today [&_button[data-selected-single=true]]:text-calendar-today-foreground",
          }}
          // Only the day buttons are fixed-size: react-day-picker puts data-day on the cells too, which must stretch so the
          // week band runs unbroken.
          className="-mx-2 p-0 [--cell-size:--spacing(7)] [&_button[data-day]]:mx-auto [&_button[data-day]]:w-(--cell-size) [&_[role=gridcell]]:aspect-auto [&_[role=gridcell]]:h-(--cell-size)"
        />
        <RailSection
          title={t("Calendars")}
          action={
            <span className="flex items-center">
              <ActionMenuButton
                label={t("Calendar settings")}
                actions={[
                  { label: t("Calendar settings"), icon: Settings2, onSelect: () => onSettingsOpen(true) },
                  { separator: true },
                  { label: t("Sync with Google Calendar…"), icon: RefreshCw, onSelect: () => openSettings("calendar-feed") },
                  { label: t("Import .ics file"), icon: Download, onSelect: onImport },
                ]}
              />
              <RailSectionButton label={t("New calendar")} onClick={() => setEditing("new")}>
                <Plus />
              </RailSectionButton>
            </span>
          }
        >
          <RailList>
            {calendars.map((c) => (
              <RailItem
                key={c.id}
                label={c.name}
                title={
                  c.sync
                    ? c.sync.error
                      ? `${c.name}: ${c.sync.error}`
                      : t("{name}: synced {time}, read-only here", { name: c.name, time: c.sync.at ? new Date(c.sync.at).toLocaleString(appLocale()) : "" })
                    : c.name
                }
                trailing={c.sync?.error ? <span className="bg-destructive size-1.5 shrink-0 rounded-full" aria-label={t("Sync failed")} /> : undefined}
                active={false}
                onClick={() => onToggle(c.id)}
                leading={
                  <span
                    className={cn("grid size-3.5 shrink-0 place-items-center rounded-[4px] border-2")}
                    style={{ borderColor: CALENDAR_COLORS[c.color], background: hidden.has(c.id) ? "transparent" : CALENDAR_COLORS[c.color] }}
                    aria-hidden
                  />
                }
                actions={() => actions(c)}
              />
            ))}
          </RailList>
        </RailSection>
        <RailSection
          title={t("People")}
          action={
            <RailSectionButton label={t("Add a person (/)")} onClick={() => onPickerOpen(true)}>
              <UserPlus />
            </RailSectionButton>
          }
        >
          {people.length ? (
            <RailList>
              {people.map((id) => {
                const p = everyone.find((x) => x.id === id)
                return (
                  <RailItem
                    key={id}
                    label={p?.name || p?.email || "…"}
                    active={false}
                    onClick={() => onPickerOpen(true)}
                    leading={
                      // The ring is the person's overlay colour, matching their blocks in the grid.
                      <span className="inline-flex shrink-0 rounded-full p-px" style={{ boxShadow: `0 0 0 1.5px ${personColor(id, people)}` }}>
                        <UserAvatar seed={p?.email ?? id} size={16} />
                      </span>
                    }
                    actions={[{ label: t("Remove from view"), icon: UserMinus, onSelect: () => onPeople(people.filter((x) => x !== id)) }]}
                  />
                )
              })}
            </RailList>
          ) : (
            <p className="text-muted-foreground px-2 text-xs">{t("See when colleagues are busy: press / or +.")}</p>
          )}
        </RailSection>
      </Rail>

      <CommandPalette
        open={pickerOpen}
        onOpenChange={onPickerOpen}
        size="compact"
        title={t("Show a colleague's calendar")}
        placeholder={t("Search people")}
        emptyLabel={t("Nobody found")}
        groups={[
          {
            heading: t("People"),
            items: everyone
              .filter((p) => !people.includes(p.id))
              .map((p) => ({
                id: p.id,
                label: p.name || p.email,
                description: p.email,
                keywords: [p.email],
                icon: <UserAvatar seed={p.email} size={18} />,
                onSelect: () => {
                  onPeople([...people, p.id].slice(-10))
                  onPickerOpen(false)
                },
              })),
          },
        ]}
      />
      <CalendarDialog calendar={editing} onClose={() => setEditing(null)} onSaved={onCalendars} />
      {sharing ? (
        <ShareDialog
          note={sharing}
          endpoint={`/api/app/calendar/calendars/${sharing.id}/share`}
          title={t("Share \"{name}\"", { name: sharing.name })}
          description={t("People you share with see the events; everyone else sees only when you're busy.")}
          open
          onOpenChange={(o) => !o && setSharing(null)}
          onSaved={() => void onCalendars()}
        />
      ) : null}
    </>
  )
}

function CalendarDialog({ calendar, onClose, onSaved }: { calendar: CalendarView | "new" | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const existing = typeof calendar === "object" ? calendar : null
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState("blue")
  React.useEffect(() => {
    setName(existing?.name ?? "")
    setColor(existing?.color ?? "green")
  }, [calendar, existing])
  async function save(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (existing) await api("PATCH", `/api/app/calendar/calendars/${existing.id}`, { name })
      else await api("POST", "/api/app/calendar/calendars", { name, color })
      await onSaved()
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }
  return (
    <Dialog open={!!calendar} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{existing ? t("Rename calendar") : t("New calendar")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="calendar-name">{t("Name")}</Label>
            <Input id="calendar-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus required />
          </div>
          {!existing ? (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Colour")}>
              {Object.entries(CALENDAR_COLORS).map(([key, hex]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={color === key}
                  aria-label={t(COLOR_NAMES[key] ?? key)}
                  onClick={() => setColor(key)}
                  className={cn("size-6 rounded-full", color === key && "ring-foreground ring-2 ring-offset-2")}
                  style={{ background: hex }}
                />
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              {existing ? t("Save") : t("Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const ZONES = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone")
  } catch {
    return []
  }
})()

/**
 * The calendar app's handle on its settings: opening it opens the calendar section of the settings dialog, and a
 * save there comes back through `onSaved`.
 * shortcut: a stand-in so calendar-app.tsx needn't change while it's being edited elsewhere; inline it there later.
 */
export function CalendarSettingsDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; prefs: Prefs; tz: string; onSaved: (p: Prefs) => void }) {
  React.useEffect(() => {
    if (!open) return
    openSettings("calendar")
    onOpenChange(false)
  }, [open, onOpenChange])
  React.useEffect(() => onSettingsSaved((saved) => saved.kind === "calendar-prefs" && onSaved(saved.prefs as Prefs)), [onSaved])
  return null
}

/** Time zones, time format and week start: the calendar's section of the settings dialog. */
export function CalendarSettingsForm({ prefs, tz, onSaved }: { prefs: Prefs; tz: string; onSaved: (p: Prefs) => void }) {
  const [zones, setZones] = React.useState<string[]>(() => (prefs.timezones.length ? prefs.timezones : [tz]))
  const [weekStart, setWeekStart] = React.useState(prefs.weekStart)
  const [hourCycle, setHourCycle] = React.useState(prefs.hourCycle)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(() => JSON.stringify([prefs.timezones.length ? prefs.timezones : [tz], prefs.weekStart, prefs.hourCycle]))
  const value = JSON.stringify([zones, weekStart, hourCycle])
  const changed = value !== saved
  useSettingsDraft(changed, saving)
  const valid = zones.every((z) => isTimeZone(z))
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      onSaved(await api<Prefs>("PUT", "/api/app/calendar/prefs", { timezones: zones, weekStart, hourCycle }))
      setSaved(value)
      toast.success(t("Saved"))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
        <form onSubmit={save} className="grid gap-6">
          <Field>
            <FieldLabel>{t("Time format")}</FieldLabel>
            <SegmentedControl
              aria-label={t("Time format")}
              value={hourCycle}
              onValueChange={setHourCycle}
              options={[
                { value: "h23", label: t("24-hour · 14:00") },
                { value: "h12", label: t("12-hour · 2:00 PM") },
              ]}
            />
          </Field>
          <div className="grid gap-2">
            <FieldLabel>{t("Time zones")}</FieldLabel>
            <p className="text-muted-foreground -mt-1 text-xs">{t("The first zone is yours; up to two more show next to the hours.")}</p>
            {zones.map((z, i) => (
              <div key={i} className="flex items-center gap-2">
                <Globe className="text-muted-foreground size-4 shrink-0" />
                <TimeZonePicker value={z} label={i ? t("Other time zone") : t("Your time zone")} onChange={zone => setZones(zones.map((x, j) => j === i ? zone : x))} />
                {i ? (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Remove")} onClick={() => setZones(zones.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            ))}
            {zones.length < 3 ? (
              <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setZones([...zones, "UTC"])}>
                <Plus /> {t("Add a time zone")}
              </Button>
            ) : null}
          </div>
          <Field>
            <FieldLabel htmlFor="calendar-week-start">{t("Week starts on")}</FieldLabel>
            <Select value={String(weekStart)} onValueChange={(v) => setWeekStart(Number(v))}>
              <SelectTrigger id="calendar-week-start" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="1">{t("Monday")}</SelectItem>
                  <SelectItem value="0">{t("Sunday")}</SelectItem>
                  <SelectItem value="6">{t("Saturday")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <div>
            <Button type="submit" loading={saving} disabled={!valid || !changed}>
              {t("Save")}
            </Button>
          </div>
        </form>
  )
}

function TimeZonePicker({ value, label, onChange }: { value: string; label: string; onChange: (zone: string) => void }) {
  const [open, setOpen] = React.useState(false)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open} className="min-w-0 flex-1 justify-between"><span className="truncate">{value.replaceAll("_", " ")}</span><ChevronsUpDown data-icon="inline-end" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
      <Command><CommandInput placeholder={t("Search cities or time zones…")} /><CommandList><CommandEmpty>{t("No time zone found.")}</CommandEmpty><CommandGroup>
        {[...new Set([value, "UTC", ...ZONES])].map(zone => <CommandItem key={zone} value={zone.replaceAll("_", " ")} onSelect={() => { onChange(zone); setOpen(false) }}>{zone.replaceAll("_", " ")}{zone === value && <Check className="ml-auto" />}</CommandItem>)}
      </CommandGroup></CommandList></Command>
    </PopoverContent>
  </Popover>
}

/**
 * Settings → Calendar → Google Calendar, both ways: Google calendars synced in (read-only, refreshed every 30 minutes
 * by the server) and the private .ics link Google subscribes to.
 */
export function CalendarFeedSettings() {
  const [url, setUrl] = React.useState<string | null | undefined>(undefined)
  const [synced, setSynced] = React.useState<CalendarView[] | undefined>(undefined)
  const [address, setAddress] = React.useState("")
  const [adding, setAdding] = React.useState(false)
  const loadSynced = React.useCallback(
    () =>
      api<{ calendars: CalendarView[] }>("GET", "/api/app/calendar/calendars")
        .then((r) => setSynced(r.calendars.filter((c) => c.sync)))
        .catch((e) => toast.error((e as Error).message)),
    [],
  )
  React.useEffect(() => {
    api<{ url: string | null }>("GET", "/api/app/calendar/feed")
      .then((r) => setUrl(r.url))
      .catch((e) => (toast.error((e as Error).message), setUrl(null)))
    void loadSynced()
  }, [loadSynced])
  async function make() {
    try {
      setUrl((await api<{ url: string | null }>("POST", "/api/app/calendar/feed")).url)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    try {
      await api("POST", "/api/app/calendar/calendars", { name: "Google Calendar", color: "green", url: address })
      setAddress("")
      await loadSynced()
      notifySaved({ kind: "calendars" })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setAdding(false)
    }
  }
  async function remove(c: CalendarView) {
    try {
      await api("DELETE", `/api/app/calendar/calendars/${c.id}`)
      await loadSynced()
      notifySaved({ kind: "calendars" })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }
  return (
    <div className="grid gap-8">
      <section className="bg-surface grid gap-3 rounded-2xl p-5">
        <PrefHeading>{t("Google Calendar in Work Inbox")}</PrefHeading>
        <Badge variant="secondary">{t("Read-only · Refreshes about every 30 minutes")}</Badge>
        <details><summary className="text-muted-foreground cursor-pointer text-sm">{t("How to connect a Google calendar")}</summary>
        <ol className="text-muted-foreground mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>
            {t("Open")}{" "}
            <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
              {t("Google Calendar settings")}
            </a>{" "}
            {t("on a computer (the phone app doesn't have this).")}
          </li>
          <li>{t("On the left, under \"Settings for my calendars\", click the calendar.")}</li>
          <li>{t("Scroll down to \"Integrate calendar\" and copy \"Secret address in iCal format\", the last field. Not the sharing link: that one has ?cid= in it.")}</li>
          <li>{t("Paste it below. Its events show here read-only, refreshed about every 30 minutes.")}</li>
        </ol>
        </details>
        {synced?.length ? (
          <PrefList>
            {synced.map((c) => (
              <PrefRow
                key={c.id}
                icon={RefreshCw}
                title={c.name}
                description={
                  c.sync?.error ? (
                    <span className="text-destructive">{c.sync.error}</span>
                  ) : c.sync?.at ? (
                    t("Synced {time}", { time: new Date(c.sync.at).toLocaleString(appLocale()) })
                  ) : (
                    t("Waiting for the first sync")
                  )
                }
              >
                {c.manage ? (
                  <ConfirmButton title={t("Remove {name}?", { name: c.name })} description={t("This calendar and its imported events will be removed from Work Inbox for everyone it is shared with. The source calendar in Google stays unchanged.")} confirmLabel={t("Remove")} onConfirm={() => remove(c)}>
                    <Button type="button" variant="ghost" size="sm">
                      {t("Remove")}
                    </Button>
                  </ConfirmButton>
                ) : null}
              </PrefRow>
            ))}
          </PrefList>
        ) : null}
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            aria-label={t("Secret address in iCal format")}
            required
          />
          <Button type="submit" disabled={adding || !address.trim()}>
            {adding ? t("Adding…") : t("Add")}
          </Button>
        </form>
      </section>
      <section className="bg-surface grid gap-3 rounded-2xl p-5">
        <PrefHeading>{t("Work Inbox in Google Calendar")}</PrefHeading>
        <Badge variant="secondary">{t("Private subscription link · Read-only")}</Badge>
        <p className="text-muted-foreground text-sm">
          {t("In Google Calendar choose Other calendars, + and From URL, then paste this link. Apple Calendar and Outlook take it too. It's secret: anyone with it sees your events.")}
        </p>
        {url ? (
          <div className="flex gap-2">
            <Input readOnly value={url} onFocus={(e) => e.target.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(url).then(
                  () => toast.success(t("Copied")),
                  (e) => toast.error((e as Error).message),
                )
              }
            >
              {t("Copy")}
            </Button>
          </div>
        ) : null}
        <div>
          {url === undefined ? null : (
            url ? <ConfirmButton title={t("Replace the calendar link?")} description={t("The old link will stop working. Update any calendar apps that subscribe to it.")} confirmLabel={t("Create new link")} onConfirm={make}><Button type="button" variant="outline">{t("Create new link")}</Button></ConfirmButton> : <Button type="button" onClick={make}>{t("Create link")}</Button>
          )}
        </div>
      </section>
    </div>
  )
}
