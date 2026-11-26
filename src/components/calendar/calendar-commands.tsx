import * as React from "react"
import { CalendarCog, CalendarDays, CalendarPlus, CalendarRange, CalendarSearch, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openCommandPalette, useAppCommands } from "@/components/workspace/app-commands"
import { parseQuickEvent } from "@/lib/calendar/quick-event"
import { msg, t } from "@/lib/i18n/panel"
import { fmt, type Draft, type Prefs, type ViewMode } from "./shared"

/**
 * Calendar's part of the shared ⌘K (components/workspace/app-commands.tsx): an event made from the typed text
 * ("Lunch with Ola tomorrow 1pm") and the calendar's actions, above the apps and actions every page has.
 */
export function CalendarCommands({ tz, prefs, writable, onDraft, onNew, onToday, onView, onSettings, onAvailability }: {
  tz: string
  prefs: Prefs
  writable: boolean
  onDraft: (draft: Draft) => void
  onNew: () => void
  onToday: () => void
  onView: (view: ViewMode) => void
  onSettings: () => void
  onAvailability: () => void
}) {
  useAppCommands({
    placeholder: t("Lunch with Ola tomorrow 1pm, or search…"),
    groups: (query) => {
      const draft = query.trim() ? parseQuickEvent(query, tz, Date.now()) : null
      const when = draft
        ? `${fmt(draft.start, tz, { weekday: "short", month: "short", day: "numeric", year: "numeric", ...(!draft.allDay ? { hour: "numeric", minute: "2-digit", hourCycle: prefs.hourCycle } : {}) })}${draft.allDay ? ` · ${t("All day")}` : ` – ${fmt(draft.end, tz, { hour: "numeric", minute: "2-digit", hourCycle: prefs.hourCycle })}`} · ${tz}`
        : ""
      return [
        ...(draft && writable
          ? [{ heading: t("Review new event"), items: [{ id: "quick-event", label: draft.title, description: when, icon: <CalendarPlus />, alwaysShow: true, onSelect: () => onDraft(draft) }] }]
          : []),
        {
          heading: t("Calendar"),
          items: [
            { id: "cal-new", label: t("New event"), icon: <CalendarPlus />, disabled: !writable, onSelect: onNew },
            { id: "cal-today", label: t("Today"), icon: <CalendarDays />, onSelect: onToday },
            ...([ ["day", msg("Day")], ["week", msg("Week")], ["month", msg("Month")], ["year", msg("Year")] ] as const).map(([view, label]) => ({ id: `cal-${view}`, label: t(label), icon: <CalendarRange />, onSelect: () => onView(view) })),
            { id: "cal-availability", label: t("Pick availability"), icon: <CalendarSearch />, onSelect: onAvailability },
            { id: "cal-settings", label: t("Calendar settings"), icon: <CalendarCog />, onSelect: onSettings },
          ],
        },
      ]
    },
  })
  return (
    <Button variant="ghost" size="sm" onClick={openCommandPalette} aria-label={t("Calendar commands (⌘K)")} title={t("Calendar commands (⌘K)")}>
      <Search data-icon="inline-start" /><span className="hidden sm:inline">⌘K</span>
    </Button>
  )
}
