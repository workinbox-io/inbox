/** Availability mode's bar: how many slots are picked, the zone to write them in, and "Copy" (text for an e-mail). */
import * as React from "react"
import { Copy } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { availabilityText, mergeSlots, type Slot } from "@/lib/calendar/availability"
import { appLocale, t, tp } from "@/lib/i18n/panel"

export function AvailabilityBar({ slots, zones, onClear, onDone }: { slots: Slot[]; zones: string[]; onClear: () => void; onDone: () => void }) {
  const [zone, setZone] = React.useState(zones[0]!)
  const count = mergeSlots(slots).length
  async function copy() {
    try {
      await navigator.clipboard.writeText(availabilityText(slots, zone, appLocale()))
      toast.success(t("Copied: paste it into your e-mail"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="bg-background flex flex-wrap items-center gap-2 border-t px-3 py-2 text-sm">
      <span className="font-medium">{t("Availability")}</span>
      <span className="text-muted-foreground">
        {count ? tp(count, { one: "{n} slot picked", other: "{n} slots picked" }) : t("Drag over free time to pick slots.")}
      </span>
      <span className="flex-1" />
      {zones.length > 1 ? (
        <Select value={zone} onValueChange={setZone}>
          <SelectTrigger size="sm" className="w-44" aria-label={t("Time zone")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onClear} disabled={!count}>
        {t("Clear")}
      </Button>
      <Button size="sm" onClick={copy} disabled={!count}>
        <Copy /> {t("Copy")}
      </Button>
      <Button size="sm" variant="outline" onClick={onDone}>
        {t("Done")}
      </Button>
    </div>
  )
}
