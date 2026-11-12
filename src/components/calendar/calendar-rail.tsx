/**
 * The calendar's rail: "New event", a mini month, the calendars (click to show or hide, "…" to share, rename,
 * recolour, delete), colleagues overlaid on the grid, and the settings (time zones, week start, subscription link,
 * .ics import).
 */
import * as React from "react"
import { CalendarPlus, Download, Globe, Link as LinkIcon, Palette, Pencil, Plus, Settings2, Share2, Trash2, UserMinus, UserPlus } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { useNotePeople } from "@/components/notes/editor/people"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { CommandPalette } from "@/components/ui/command-palette"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { MenuAction } from "@/components/workspace/action-menu"
import { Rail, RailAction, RailItem, RailList, RailSection, RailSectionButton } from "@/components/workspace/rail"
import { ShareDialog } from "@/components/workspace/share-dialog"
import { Kbd } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import { isTimeZone, wallTime } from "@/lib/calendar/time"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { CALENDAR_COLORS, parseDayKey, personColor, type CalendarView, type Prefs } from "./shared"

const pad = (n: number) => String(n).padStart(2, "0")

export function CalendarRail({
  date,
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
  onPrefs,
  onImport,
}: {
  date: number
  tz: string
  prefs: Prefs
  calendars: CalendarView[]
  hidden: Set<string>
  people: string[]
  pickerOpen: boolean
  account?: MailUser
  canManage: boolean
  onDate: (ms: number) => void
  onNew: () => void
  onToggle: (id: string) => void
  onCalendars: () => Promise<void>
  onPeople: (ids: string[]) => void
  onPickerOpen: (open: boolean) => void
  onPrefs: (p: Prefs) => void
  onImport: () => void
}) {
  const everyone = useNotePeople()
  const [editing, setEditing] = React.useState<CalendarView | "new" | null>(null)
  const [sharing, setSharing] = React.useState<CalendarView | null>(null)
  const [settings, setSettings] = React.useState(false)
  const [feed, setFeed] = React.useState(false)
  const w = wallTime(date, tz)
  const selected = new Date(w.year, w.month - 1, w.day)
  const [month, setMonth] = React.useState(selected)
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
            items: Object.keys(CALENDAR_COLORS).map((color) => ({ label: (c.color === color ? "✓ " : "") + t(color), onSelect: () => recolor(c, color) })),
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
        footer={account ? <AccountMenu user={account} canManage={canManage} /> : undefined}
      >
        <RailAction icon={CalendarPlus} label={t("New event")} shortcut="C" onClick={onNew} />
        <Calendar
          mode="single"
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          weekStartsOn={prefs.weekStart as 0 | 1 | 6}
          onSelect={(d) => d && onDate(parseDayKey(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, tz)!)}
          // Spans the (resizable) rail: columns stretch, days stay round cells centred in them.
          classNames={{ root: "w-full" }}
          className="-mx-2 p-0 [--cell-size:--spacing(7)] [&_[data-day]]:mx-auto [&_[data-day]]:w-(--cell-size) [&_[role=gridcell]]:aspect-auto [&_[role=gridcell]]:h-(--cell-size)"
        />
        <RailSection
          title={t("Calendars")}
          action={
            <RailSectionButton label={t("New calendar")} onClick={() => setEditing("new")}>
              <Plus />
            </RailSectionButton>
          }
        >
          <RailList>
            {calendars.map((c) => (
              <RailItem
                key={c.id}
                label={c.name}
                title={c.name}
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
        <RailList>
          <RailItem icon={Settings2} label={t("Time zones and week")} active={false} onClick={() => setSettings(true)} />
          <RailItem icon={LinkIcon} label={t("Subscribe (.ics)")} active={false} onClick={() => setFeed(true)} />
          <RailItem icon={Download} label={t("Import .ics")} active={false} onClick={onImport} />
        </RailList>
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
      <SettingsDialog open={settings} onOpenChange={setSettings} prefs={prefs} tz={tz} onSaved={onPrefs} />
      <FeedDialog open={feed} onOpenChange={setFeed} />
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
                  aria-label={t(key)}
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

function SettingsDialog({ open, onOpenChange, prefs, tz, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; prefs: Prefs; tz: string; onSaved: (p: Prefs) => void }) {
  const [zones, setZones] = React.useState<string[]>([])
  const [weekStart, setWeekStart] = React.useState(prefs.weekStart)
  React.useEffect(() => {
    if (!open) return
    setZones(prefs.timezones.length ? prefs.timezones : [tz])
    setWeekStart(prefs.weekStart)
  }, [open, prefs, tz])
  const valid = zones.every((z) => isTimeZone(z))
  async function save(e: React.FormEvent) {
    e.preventDefault()
    try {
      onSaved(await api<Prefs>("PUT", "/api/app/calendar/prefs", { timezones: zones, weekStart }))
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("Time zones and week")}</DialogTitle>
            <DialogDescription>{t("The first zone is yours; up to two more show next to the hours.")}</DialogDescription>
          </DialogHeader>
          <datalist id="calendar-zones">
            {ZONES.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <div className="grid gap-2">
            {zones.map((z, i) => (
              <div key={i} className="flex items-center gap-2">
                <Globe className="text-muted-foreground size-4 shrink-0" />
                <Input
                  list="calendar-zones"
                  value={z}
                  aria-label={i ? t("Other time zone") : t("Your time zone")}
                  aria-invalid={!isTimeZone(z)}
                  onChange={(e) => setZones(zones.map((x, j) => (j === i ? e.target.value : x)))}
                />
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
          <div className="grid gap-2">
            <Label>{t("Week starts on")}</Label>
            <Select value={String(weekStart)} onValueChange={(v) => setWeekStart(Number(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("Monday")}</SelectItem>
                <SelectItem value="0">{t("Sunday")}</SelectItem>
                <SelectItem value="6">{t("Saturday")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!valid}>
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FeedDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = React.useState<string | null | undefined>(undefined)
  React.useEffect(() => {
    if (!open) return
    setUrl(undefined)
    api<{ url: string | null }>("GET", "/api/app/calendar/feed")
      .then((r) => setUrl(r.url))
      .catch((e) => (toast.error((e as Error).message), setUrl(null)))
  }, [open])
  async function make() {
    try {
      setUrl((await api<{ url: string | null }>("POST", "/api/app/calendar/feed")).url)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Subscribe in another calendar")}</DialogTitle>
          <DialogDescription>
            {t("Add this link in Google Calendar, Apple Calendar or Outlook (\"From URL\"). It's read-only and secret: anyone with it sees your events.")}
          </DialogDescription>
        </DialogHeader>
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
        <DialogFooter>
          {url === undefined ? null : (
            <Button type="button" variant={url ? "outline" : "default"} onClick={make}>
              {url ? t("New link (the old one stops working)") : t("Create link")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
