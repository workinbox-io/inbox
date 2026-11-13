import * as React from "react"
import { CalendarPlus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { USER_APPS } from "@/components/workspace/app-search"
import { APP_ACTIONS, APP_HELP, APP_NAV } from "@/config/nav"
import { parseQuickEvent } from "@/lib/calendar/quick-event"
import { t } from "@/lib/i18n/panel"
import { fmt, type Draft, type Prefs, type ViewMode } from "./shared"

export function CalendarCommands({ tz, prefs, writable, userView, onDraft, onNew, onToday, onView, onSettings, onAvailability }: {
  tz: string
  prefs: Prefs
  writable: boolean
  userView: boolean
  onDraft: (draft: Draft) => void
  onNew: () => void
  onToday: () => void
  onView: (view: ViewMode) => void
  onSettings: () => void
  onAvailability: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [now, setNow] = React.useState(0)
  const show = React.useCallback(() => {
    setQuery("")
    setNow(Date.now())
    setOpen(true)
  }, [])
  React.useEffect(() => {
    const openCommands = (e: Event) => { e.preventDefault(); show() }
    window.addEventListener("app:search-commands", openCommands)
    return () => window.removeEventListener("app:search-commands", openCommands)
  }, [show])
  const draft = parseQuickEvent(query, tz, now)
  const actions = [
    { label: t("New event"), run: onNew, disabled: !writable },
    { label: t("Today"), run: onToday },
    ...([ ["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"] ] as const).map(([view, label]) => ({ label: t(label), run: () => onView(view) })),
    { label: t("Pick availability"), run: onAvailability },
    { label: t("Calendar settings"), run: onSettings },
  ]
  const run = (action: () => void) => { setOpen(false); action() }
  const matches = (label: string) => label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  return <>
    <Button variant="ghost" size="sm" onClick={show} aria-label={t("Calendar commands (⌘K)")} title={t("Calendar commands (⌘K)")}>
      <Search data-icon="inline-start" /><span className="hidden sm:inline">⌘K</span>
    </Button>
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} title={t("Calendar commands")} description={t("Type an event or choose a calendar action.")}>
      <CommandInput value={query} onValueChange={setQuery} maxLength={500} placeholder={t("Lunch with Ola tomorrow 1pm…")} />
      <CommandList>
        <CommandEmpty>{t("Try: Lunch tomorrow at 13:00, or Lunch jutro o 13. Names stay in the title; add guests in the event form.")}</CommandEmpty>
        {draft && writable ? <CommandGroup heading={t("Review new event")}>
          <CommandItem value="quick-event" onSelect={() => run(() => onDraft(draft))}>
            <CalendarPlus />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{draft.title}</span>
              <span className="text-muted-foreground text-xs">{fmt(draft.start, tz, { weekday: "short", month: "short", day: "numeric", year: "numeric", ...(!draft.allDay ? { hour: "numeric", minute: "2-digit", hourCycle: prefs.hourCycle } : {}) })}{draft.allDay ? ` · ${t("All day")}` : ` – ${fmt(draft.end, tz, { hour: "numeric", minute: "2-digit", hourCycle: prefs.hourCycle })}`} · {tz}</span>
            </span>
          </CommandItem>
        </CommandGroup> : null}
        <CommandGroup heading={t("Calendar")}>
          {actions.filter((a) => matches(a.label)).map((a) => <CommandItem key={a.label} value={a.label} disabled={a.disabled} onSelect={() => run(a.run)}>{a.label}</CommandItem>)}
        </CommandGroup>
        <CommandGroup heading={t("Navigate")}>
          {[...APP_NAV.filter((n) => !userView || USER_APPS.has(n.href)), ...APP_HELP, ...APP_ACTIONS].filter((n) => matches(t(n.label))).map((n) => <CommandItem key={n.href} value={n.href} onSelect={() => run(() => { window.location.href = n.href })}><n.icon />{t(n.label)}</CommandItem>)}
        </CommandGroup>
      </CommandList>
      <p className="text-muted-foreground border-t px-3 py-2 text-xs">{t("Enter to review, then save. Try: Lunch tomorrow at 13:00, or Lunch jutro o 13. Add guests in the event form.")}</p>
    </CommandDialog>
  </>
}
