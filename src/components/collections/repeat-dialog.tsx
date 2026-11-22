/**
 * "Repeat…" on a record: a copy of it (title, values, description) is made every N days, weeks or months from a start
 * date (collection_recurrences, run hourly by lib/server/collection-planning.ts). Stopping one is in the collection's
 * settings (collection-settings.tsx).
 */
import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api-client"
import { isDueField } from "@/lib/collections/board"
import { isoDay, today, type RepeatUnit } from "@/lib/collections/settings"
import { msg, t } from "@/lib/i18n/panel"
import type { Collection, CollectionRecord } from "@/lib/server/collections"

const UNITS: Record<RepeatUnit, string> = { day: msg("days"), week: msg("weeks"), month: msg("months") }

export function RepeatDialog({ collection, record, onClose }: { collection: Collection; record: CollectionRecord; onClose: () => void }) {
  const [every, setEvery] = React.useState(1)
  const [unit, setUnit] = React.useState<RepeatUnit>("week")
  const [start, setStart] = React.useState(() => isoDay(Date.parse(`${today()}T00:00:00Z`) + 86_400_000))
  const [busy, setBusy] = React.useState(false)
  const deadline = collection.fields.find((f) => isDueField(f))
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api("POST", `/api/app/collections/${collection.id}/recurrences`, { recordId: record.id, every, unit, start })
      toast.success(t("{title} repeats from {date}.", { title: record.title, date: start }))
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("Repeat {title}", { title: record.title })}</DialogTitle>
            <DialogDescription>
              {deadline ? t("A copy is added on each date, with {field} set to that day.", { field: deadline.name }) : t("A copy is added on each date.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="repeat-every">{t("Every")}</Label>
            <div className="flex gap-2">
              <Input id="repeat-every" type="number" min={1} max={365} value={every} onChange={(e) => setEvery(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} className="w-20" />
              <Select value={unit} onValueChange={(u) => setUnit(u as RepeatUnit)}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(UNITS) as RepeatUnit[]).map((u) => <SelectItem key={u} value={u}>{t(UNITS[u])}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="repeat-start">{t("First copy on")}</Label>
            <Input id="repeat-start" type="date" min={today()} value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
            <Button type="submit" disabled={busy}>{t("Repeat")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
