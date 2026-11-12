/** Selected free times and the exact text to paste into a message. */
import * as React from "react"
import { Copy, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { availabilityText, type Slot } from "@/lib/calendar/availability"
import type { HourCycle } from "@/lib/calendar/time"
import { appLocale, t, tp } from "@/lib/i18n/panel"

export function AvailabilityBar({ slots, zones, hourCycle, disabled, onRemove, onClear, onDone }: { slots: Slot[]; zones: string[]; hourCycle: HourCycle; disabled: boolean; onRemove: (slot: Slot) => void; onClear: () => void; onDone: () => void }) {
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
  return (
    <section aria-label={t("Availability")} className="bg-background flex shrink-0 flex-col gap-2 border-t px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t("Availability")}</span>
        <span className="text-muted-foreground" role="status">
          {slots.length ? tp(slots.length, { one: "{n} slot picked", other: "{n} slots picked" }) : t("Click for 30 minutes, or drag to pick free time.")}
        </span>
        <span className="flex-1" />
        {zones.length > 1 ? (
          <Select value={zone} onValueChange={setZone}>
            <SelectTrigger size="sm" className="w-44" aria-label={t("Time zone")}><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              {zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        ) : <span className="text-muted-foreground text-xs">{zone}</span>}
        <Button size="sm" variant="ghost" onClick={onClear} disabled={!slots.length}>{t("Clear")}</Button>
        <Button size="sm" onClick={copy} disabled={disabled || !slots.length}><Copy data-icon="inline-start" />{t("Copy availability")}</Button>
        <Button size="sm" variant="outline" onClick={onDone}>{t("Done")}</Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {disabled ? t("Wait for the calendar to load before picking or copying times.") : t("Busy events in visible calendars are excluded. These times are not reserved.")}
      </p>
      {slots.length ? (
        <div className="flex max-h-36 flex-col gap-2 overflow-y-auto">
          <div className="flex flex-wrap gap-1" aria-label={t("Selected times")}>
            {slots.map((slot) => (
              <Button key={`${slot.start}:${slot.end}`} size="sm" variant="outline" onClick={() => onRemove(slot)} aria-label={`${t("Remove slot")}: ${availabilityText([slot], zone, appLocale(), hourCycle)}`}>
                {new Intl.DateTimeFormat(appLocale(), { timeZone: zone, hourCycle, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(slot.start)}
                <X data-icon="inline-end" />
              </Button>
            ))}
          </div>
          <pre className="bg-muted rounded-md p-2 font-sans text-xs whitespace-pre-wrap select-text" aria-label={t("Text to copy")} tabIndex={0}>{text}</pre>
        </div>
      ) : null}
    </section>
  )
}
