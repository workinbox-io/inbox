/**
 * The planning part of the collection dialog (lib/collections/settings.ts): cycles (length and the first one's start),
 * triage for requests, an SLA per priority (hours), record templates and repeating records. Settings are saved with
 * the dialog; a repeating record stops at once (its own API).
 */
import * as React from "react"
import { Repeat, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api-client"
import { priorityFieldOf, type CollectionField } from "@/lib/collections/fields"
import type { CollectionSettings } from "@/lib/collections/settings"
import { today } from "@/lib/collections/settings"
import { t, tp } from "@/lib/i18n/panel"
import type { Recurrence } from "@/lib/server/collection-planning"

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function CollectionSettingsSection({ collectionId, fields, value, onChange }: { collectionId: string; fields: CollectionField[]; value: CollectionSettings; onChange: (next: CollectionSettings) => void }) {
  const set = (patch: Partial<CollectionSettings>) => onChange({ ...value, ...patch })
  const choices = fields.filter((f) => f.type === "select")
  const slaField = choices.find((f) => f.id === value.sla?.field)
  const [repeats, setRepeats] = React.useState<Recurrence[]>([])
  React.useEffect(() => {
    api<{ recurrences: Recurrence[] }>("GET", `/api/app/collections/${collectionId}/recurrences`).then((r) => setRepeats(r.recurrences), () => {})
  }, [collectionId])
  const unit = (r: Recurrence) => (r.unit === "day" ? tp(r.every, { one: "every day", other: "every {n} days" }) : r.unit === "week" ? tp(r.every, { one: "every week", other: "every {n} weeks" }) : tp(r.every, { one: "every month", other: "every {n} months" }))

  return (
    <fieldset className="grid gap-4 border-t pt-4">
      <legend className="mb-2 text-sm font-medium">{t("Planning")}</legend>
      <Toggle id="set-cycles" label={t("Cycles")} hint={t("Plan work in sprints. Records not done when a cycle ends move to the next one.")} checked={!!value.cycles}
        onChange={(on) => set({ cycles: on ? { weeks: 2, start: today() } : null })} />
      {value.cycles ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="set-cycle-weeks">{t("Length")}</Label>
            <Select value={String(value.cycles.weeks)} onValueChange={(w) => set({ cycles: { ...value.cycles!, weeks: Number(w) } })}>
              <SelectTrigger id="set-cycle-weeks"><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 6, 8].map((w) => <SelectItem key={w} value={String(w)}>{tp(w, { one: "{n} week", other: "{n} weeks" })}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="set-cycle-start">{t("Cycle 1 starts")}</Label>
            <Input id="set-cycle-start" type="date" value={value.cycles.start} onChange={(e) => e.target.value && set({ cycles: { ...value.cycles!, start: e.target.value } })} />
          </div>
        </div>
      ) : null}
      <Toggle id="set-triage" label={t("Triage")} hint={t("People who can only view this collection, API keys and AI apps send requests; someone accepts or declines them first.")} checked={!!value.triage} onChange={(on) => set({ triage: on })} />
      <Toggle id="set-sla" label={t("SLA")} hint={t("How long a record may stay open, by priority. People in its person fields hear when it's missed.")} checked={!!value.sla}
        onChange={(on) => {
          const f = priorityFieldOf(fields) ?? choices[0]
          if (on && !f) return void toast.error(t("Add a choice field first, like Priority."))
          set({ sla: on && f ? { field: f.id, hours: {} } : null })
        }} />
      {value.sla ? (
        <div className="grid gap-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="set-sla-field" className="text-muted-foreground font-normal">{t("Follows")}</Label>
            <Select value={value.sla.field} onValueChange={(f) => set({ sla: { field: f, hours: {} } })}>
              <SelectTrigger id="set-sla-field" size="sm" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{choices.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {(slaField?.options ?? []).map((o) => (
            <div key={o} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate">{o}</span>
              <Input type="number" min={0} step="any" aria-label={t("Hours for {choice}", { choice: o })} placeholder={t("No SLA")} className="h-8 w-24"
                value={value.sla!.hours[o] ?? ""}
                onChange={(e) => {
                  const hours = { ...value.sla!.hours }
                  const n = Number(e.target.value)
                  if (e.target.value && n > 0) hours[o] = n
                  else delete hours[o]
                  set({ sla: { ...value.sla!, hours } })
                }} />
              <span className="text-muted-foreground text-xs">{t("hours")}</span>
            </div>
          ))}
        </div>
      ) : null}
      {value.templates?.length ? (
        <div className="grid gap-1.5">
          <Label>{t("Record templates")}</Label>
          <ul className="grid gap-1">
            {value.templates.map((tpl) => (
              <li key={tpl.id} className="flex h-8 items-center gap-2 rounded-md border px-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{tpl.name}</span>
                <button type="button" aria-label={t("Remove {name}", { name: tpl.name })} onClick={() => set({ templates: value.templates!.filter((x) => x.id !== tpl.id) })} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{t("Templates: open a record's … menu and pick Save as template.")}</p>
      )}
      {repeats.length ? (
        <div className="grid gap-1.5">
          <Label>{t("Repeating records")}</Label>
          <ul className="grid gap-1">
            {repeats.map((r) => (
              <li key={r.id} className="flex h-8 items-center gap-2 rounded-md border px-2 text-sm">
                <Repeat className="text-muted-foreground size-3.5" />
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="text-muted-foreground shrink-0 text-xs">{unit(r)} · {t("next {date}", { date: r.nextAt })}</span>
                <button type="button" aria-label={t("Stop repeating {title}", { title: r.title })} title={t("Stop repeating")}
                  onClick={() => api("DELETE", `/api/app/collections/${collectionId}/recurrences/${r.id}`).then(() => setRepeats((l) => l.filter((x) => x.id !== r.id)), (e: Error) => void toast.error(e.message))}
                  className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </fieldset>
  )
}
