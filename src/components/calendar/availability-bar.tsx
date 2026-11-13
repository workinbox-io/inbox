/** Selected free times and the exact text to paste into a message. */
import * as React from "react"
import { Copy, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { ComposeFooter, ComposeFrame } from "@/components/mail/compose"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { availabilityText, type Slot } from "@/lib/calendar/availability"
import type { HourCycle } from "@/lib/calendar/time"
import { appLocale, t, tp } from "@/lib/i18n/panel"

export function AvailabilityBar({ slots: selection, zones, hourCycle, disabled, onRemove, onClear, onDone }: { slots: Slot[] | null; zones: string[]; hourCycle: HourCycle; disabled: boolean; onRemove: (slot: Slot) => void; onClear: () => void; onDone: () => void }) {
  const [lastSelection, setLastSelection] = React.useState(selection ?? [])
  // Keep the preview intact until the closing animation finishes.
  if (selection && selection !== lastSelection) setLastSelection(selection)
  const slots = selection ?? lastSelection
  const [chosenZone, setZone] = React.useState(zones[0]!)
  const zone = zones.includes(chosenZone) ? chosenZone : zones[0]!
  const text = availabilityText(slots, zone, appLocale(), hourCycle)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("Copied: paste it into your e-mail"))
    } catch {
      toast.error(t("Could not copy. Select the preview text and copy it manually."))
    }
  }
  const count = slots.length ? tp(slots.length, { one: "{n} slot picked", other: "{n} slots picked" }) : ""
  return (
    <ComposeFrame open={selection !== null} title={[t("Availability"), count].filter(Boolean).join(" · ")} closeLabel={t("Leave availability")} dockedOnMobile onClose={onDone}>
      <section aria-label={t("Availability")} className="flex min-h-0 flex-1 flex-col text-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <span className="text-muted-foreground text-xs">{t("Time zone")}</span>
          {zones.length > 1 ? (
            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label={t("Time zone")}><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                {zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          ) : <span className="text-muted-foreground text-xs">{zone}</span>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-muted-foreground text-xs" role="status">
            {disabled ? t("Wait for the calendar to load before picking or copying times.") : t("Click for 30 minutes, or drag to pick free time.")}
          </p>
          {slots.length ? (
            <>
              <div className="flex flex-wrap gap-1" aria-label={t("Selected times")}>
                {slots.map((slot) => (
                  <Button key={`${slot.start}:${slot.end}`} size="sm" variant="outline" onClick={() => onRemove(slot)} aria-label={`${t("Remove slot")}: ${availabilityText([slot], zone, appLocale(), hourCycle)}`}>
                    {new Intl.DateTimeFormat(appLocale(), { timeZone: zone, hourCycle, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(slot.start)}
                    <X data-icon="inline-end" />
                  </Button>
                ))}
              </div>
              <pre className="bg-muted min-h-20 rounded-md p-3 font-sans text-sm whitespace-pre-wrap select-text" aria-label={t("Text to copy")} tabIndex={0}>{text}</pre>
            </>
          ) : null}
          <p className="text-muted-foreground text-xs">{t("Busy events in visible calendars are excluded. These times are not reserved.")}</p>
        </div>
        <ComposeFooter>
          <Button size="sm" variant="ghost" onClick={onClear} disabled={!slots.length}>{t("Clear")}</Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={onDone}>{t("Done")}</Button>
          <Button size="sm" onClick={copy} disabled={disabled || !slots.length}><Copy data-icon="inline-start" />{t("Copy availability")}</Button>
        </ComposeFooter>
      </section>
    </ComposeFrame>
  )
}
