/**
 * The header's "Display" menu, after Linear's: grouping (list and board) and swimlanes (select or person fields),
 * ordering and a second key, the dates of the timeline and calendar, completed records, empty groups, the fields shown
 * on cards, rows and as table columns; at the bottom, saving the view (personal or, for managers, the team's), updating
 * or resetting the one in use. SaveViewDialog names a new view.
 */
import * as React from "react"
import { ArrowDownWideNarrow, ArrowUpNarrowWide, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { CollectionField } from "@/lib/collections/fields"
import { dateFields, groupFields, type ViewConfig } from "@/lib/collections/view-config"
import { msg, t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { FIELD_ICON } from "./values"

const ORDER_LABELS: Record<string, string> = { manual: msg("Manual"), updated: msg("Last changed"), created: msg("Created"), title: msg("Name") }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between gap-3">
      <span className="text-muted-foreground text-[13px]">{label}</span>
      {children}
    </div>
  )
}

const small = "h-7 min-w-36 justify-between text-[13px] shadow-none"

export function DisplayMenu({ config, fields, onChange, saved, dirty, canSave, onSave, onUpdate, onReset }: {
  config: ViewConfig
  fields: CollectionField[]
  onChange: (patch: Partial<ViewConfig>) => void
  /** The saved view in use, if any; `canUpdate`: it's the viewer's own, or a team view they manage. */
  saved: { name: string; canUpdate: boolean } | null
  dirty: boolean
  canSave: boolean
  onSave: () => void
  onUpdate: () => void
  onReset: () => void
}) {
  const groupable = groupFields(fields)
  const board = config.layout === "board"
  const list = config.layout === "list"
  const dated = config.layout === "timeline" || config.layout === "calendar"
  const dates = dateFields(fields)
  const shown = config.props ?? fields.map((f) => f.id)
  const toggleProp = (id: string) => onChange({ props: shown.includes(id) ? shown.filter((x) => x !== id) : fields.map((f) => f.id).filter((x) => x === id || shown.includes(x)) })
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] data-[state=open]:bg-foreground/[0.04] relative flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium">
          <SlidersHorizontal className="size-3.5" />
          {t("Display")}
          {dirty ? <span className="bg-primary absolute top-1 right-1 size-1.5 rounded-full" aria-label={t("Unsaved changes")} /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="grid gap-1">
          {list ? (
            <Row label={t("Grouping")}>
              <Select value={config.group ?? "none"} onValueChange={(g) => onChange({ group: g === "none" ? null : g, collapsed: [] })}>
                <SelectTrigger size="sm" className={small}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("None")}</SelectItem>
                  {groupable.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
          ) : null}
          {dated ? (
            <>
              <Row label={config.layout === "timeline" ? t("Starts") : t("Date")}>
                <Select value={config.start ?? ""} onValueChange={(d) => onChange({ start: d, end: config.end === d ? null : config.end })}>
                  <SelectTrigger size="sm" className={small}><SelectValue /></SelectTrigger>
                  <SelectContent>{dates.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </Row>
              {config.layout === "timeline" ? (
                <Row label={t("Ends")}>
                  <Select value={config.end ?? "none"} onValueChange={(d) => onChange({ end: d === "none" ? null : d })}>
                    <SelectTrigger size="sm" className={small}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("Same day")}</SelectItem>
                      {dates.filter((f) => f.id !== config.start).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Row>
              ) : null}
            </>
          ) : null}
          {board ? (
            <>
              <Row label={t("Columns")}>
                <Select value={config.group ?? ""} onValueChange={(g) => onChange({ group: g, collapsed: [], lanes: config.lanes === g ? null : config.lanes })}>
                  <SelectTrigger size="sm" className={small}><SelectValue /></SelectTrigger>
                  <SelectContent>{groupable.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </Row>
              <Row label={t("Swimlanes")}>
                <Select value={config.lanes ?? "none"} onValueChange={(l) => onChange({ lanes: l === "none" ? null : l })}>
                  <SelectTrigger size="sm" className={small}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("None")}</SelectItem>
                    {groupable.filter((f) => f.id !== config.group).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
            </>
          ) : null}
          <Row label={t("Ordering")}>
            <div className="flex items-center gap-1">
              <Select value={config.order} onValueChange={(o) => onChange({ order: o, dir: 1 })}>
                <SelectTrigger size="sm" className={cn(small, "min-w-32")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{t(v)}</SelectItem>)}
                  {fields.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon-sm" disabled={config.order === "manual"} aria-label={config.dir === 1 ? t("Ascending") : t("Descending")} title={config.dir === 1 ? t("Ascending") : t("Descending")} onClick={() => onChange({ dir: config.dir === 1 ? -1 : 1 })}>
                {config.dir === 1 ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
              </Button>
            </div>
          </Row>
          <Row label={t("Then by")}>
            <div className="flex items-center gap-1">
              <Select value={config.then ?? "none"} onValueChange={(o) => onChange({ then: o === "none" ? null : o, thenDir: 1 })}>
                <SelectTrigger size="sm" className={cn(small, "min-w-32")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("None")}</SelectItem>
                  {Object.entries(ORDER_LABELS).filter(([k]) => k !== "manual" && k !== config.order).map(([k, v]) => <SelectItem key={k} value={k}>{t(v)}</SelectItem>)}
                  {fields.filter((f) => f.id !== config.order).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon-sm" disabled={!config.then} aria-label={config.thenDir === 1 ? t("Ascending") : t("Descending")} title={config.thenDir === 1 ? t("Ascending") : t("Descending")} onClick={() => onChange({ thenDir: config.thenDir === 1 ? -1 : 1 })}>
                {config.thenDir === 1 ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
              </Button>
            </div>
          </Row>
          <Row label={t("Show completed")}>
            <Switch checked={config.closed} onCheckedChange={(c) => onChange({ closed: c })} aria-label={t("Show completed")} />
          </Row>
          {board || list ? (
            <Row label={board ? t("Show empty columns") : t("Show empty groups")}>
              <Switch checked={!config.hideEmpty} onCheckedChange={(c) => onChange({ hideEmpty: !c })} aria-label={board ? t("Show empty columns") : t("Show empty groups")} />
            </Row>
          ) : null}
        </div>
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-xs font-medium">{board ? t("Shown on cards") : list ? t("Shown on rows") : t("Columns")}</p>
          <div className="flex flex-wrap gap-1">
            {fields.filter((f) => !board || (f.id !== config.group && f.id !== config.lanes)).map((f) => {
              const Icon = FIELD_ICON[f.type]
              const on = shown.includes(f.id)
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => toggleProp(f.id)}
                  className={cn("flex h-7 items-center gap-1 rounded-md border px-2 text-xs", on ? "bg-foreground/[0.06] text-foreground" : "text-muted-foreground border-dashed")}>
                  <Icon className="size-3" />{f.name}
                </button>
              )
            })}
          </div>
          {config.props ? <button type="button" onClick={() => onChange({ props: null })} className="text-muted-foreground hover:text-foreground mt-2 text-xs">{t("Back to the default fields")}</button> : null}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          {saved ? <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{saved.name}</span> : <span className="flex-1" />}
          {saved && dirty ? <Button variant="ghost" size="sm" className="h-7" onClick={onReset}>{t("Reset")}</Button> : null}
          {saved && dirty && saved.canUpdate ? <Button variant="outline" size="sm" className="h-7" onClick={onUpdate}>{t("Update view")}</Button> : null}
          {canSave ? <Button size="sm" className="h-7" onClick={onSave}>{saved ? t("Save as new") : t("Save view")}</Button> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function SaveViewDialog({ open, canShare, onClose, onSave }: { open: boolean; canShare: boolean; onClose: () => void; onSave: (name: string, team: boolean) => Promise<unknown> }) {
  const [name, setName] = React.useState("")
  const [team, setTeam] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (open) (setName(""), setTeam(false))
  }, [open])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const ok = await onSave(name.trim(), team)
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader><DialogTitle>{t("Save view")}</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="view-name">{t("Name")}</Label>
            <Input id="view-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. My open tasks")} />
          </div>
          {canShare ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={team} onCheckedChange={(c) => setTeam(c === true)} />
              {t("Share with everyone who can open the collection")}
            </label>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{t("Save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
