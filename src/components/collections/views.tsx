/**
 * A collection's table: a type icon on every column, click a header to sort (again to reverse, a third time to clear),
 * the open record highlighted, checkboxes ticked in place, "+ New" under the rows. The board is board.tsx.
 */
import * as React from "react"
import { ArrowDown, ArrowUp, Plus } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import type { CollectionField, FieldValue } from "@/lib/collections/fields"
import { t } from "@/lib/i18n/panel"
import type { Collection, CollectionRecord } from "@/lib/server/collections"
import { cn } from "@/lib/utils"
import { ActionMenu, type MenuAction } from "@/components/workspace/action-menu"
import { compareRecords } from "@/lib/collections/view-config"
import { FIELD_ICON, ValueView, type Person } from "./values"

export function RecordTable({ collection, records, people, openId, order, dir, props, idOf, actions, onSort, onOpen, onNew, onPatch }: {
  collection: Collection
  records: CollectionRecord[]
  people: Person[]
  openId: string | null
  /** The view's ordering; a header click sorts by that column (again to reverse, a third time back to the default). */
  order: string
  dir: 1 | -1
  onSort: (order: string, dir: 1 | -1) => void
  /** The view's columns; null = every field. */
  props: string[] | null
  idOf?: (r: CollectionRecord) => string | null
  actions?: (r: CollectionRecord) => MenuAction[]
  onOpen: (r: CollectionRecord) => void
  /** Absent for viewers. */
  onNew?: () => void
  onPatch?: (r: CollectionRecord, values: Record<string, FieldValue | null>) => void
}) {
  const sorted = React.useMemo(() => [...records].sort(compareRecords(order, dir, collection.fields, people)), [records, order, dir, collection.fields, people])
  const cycle = (key: string) => (order !== key ? onSort(key, 1) : dir === 1 ? onSort(key, -1) : onSort("manual", 1))
  const fields = props ? props.map((id) => collection.fields.find((f) => f.id === id)).filter((f): f is CollectionField => !!f) : collection.fields
  const columns = [{ key: "title", name: t("Name"), type: "title" as const }, ...fields.map((f) => ({ key: f.id, name: f.name, type: f.type }))]

  return (
    <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
      <thead className="bg-background sticky top-0 z-10">
        <tr>
          {columns.map((c, i) => {
            const Icon = FIELD_ICON[c.type]
            const active = order === c.key
            return (
              <th key={c.key} scope="col" aria-sort={active ? (dir === 1 ? "ascending" : "descending") : undefined}
                className={cn("border-b p-0 text-left font-normal", i > 0 && "border-l", i === 0 ? "bg-background sticky left-0 z-10 min-w-64" : c.type === "number" ? "min-w-28" : "min-w-40")}>
                <button type="button" onClick={() => cycle(c.key)} className="text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground flex h-9 w-full items-center gap-1.5 px-3 text-xs font-medium whitespace-nowrap">
                  <Icon className="size-3.5 shrink-0 opacity-70" />
                  {c.name}
                  {active ? (dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null}
                </button>
              </th>
            )
          })}
          <th className="w-full border-b" aria-hidden />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const open = r.id === openId
          const id = idOf?.(r)
          const row = (
            <tr key={r.id} onClick={() => onOpen(r)} className={cn("group cursor-pointer", open ? "bg-primary/[0.06]" : "hover:bg-foreground/[0.025]")}>
              <td className={cn("sticky left-0 z-[1] border-b px-3 py-0", open ? "bg-[color-mix(in_oklab,var(--primary)_6%,var(--background))]" : "bg-background group-hover:bg-[color-mix(in_oklab,var(--foreground)_2.5%,var(--background))]")}>
                <button type="button" className="flex h-9 max-w-80 items-center gap-2 truncate text-left font-medium outline-none focus-visible:underline" onClick={(e) => (e.stopPropagation(), onOpen(r))}>
                  {id ? <span className="text-muted-foreground trim-caps shrink-0 font-mono text-[11px] font-normal">{id}</span> : null}
                  <span className="truncate">{r.title}</span>
                </button>
              </td>
              {fields.map((f) => (
                <td key={f.id} className={cn("max-w-64 border-b border-l px-3 py-0 whitespace-nowrap", f.type === "number" && "text-right")}>
                  <div className={cn("flex h-9 min-w-0 items-center", f.type === "number" && "justify-end")}>
                    {f.type === "checkbox" && onPatch ? (
                      <Checkbox checked={r.values[f.id] === true} aria-label={`${f.name}: ${r.title}`} onClick={(e) => e.stopPropagation()} onCheckedChange={(c) => onPatch(r, { [f.id]: c === true })} />
                    ) : (
                      <ValueView field={f} value={r.values[f.id]} people={people} />
                    )}
                  </div>
                </td>
              ))}
              <td className="border-b" />
            </tr>
          )
          return actions ? <ActionMenu key={r.id} actions={() => actions(r)}>{row}</ActionMenu> : row
        })}
        {onNew ? (
          <tr>
            <td colSpan={columns.length + 1} className="sticky left-0 p-0">
              <button type="button" onClick={onNew} className="text-muted-foreground hover:bg-foreground/[0.025] hover:text-foreground flex h-9 w-full items-center gap-1.5 px-3 text-[13px]">
                <Plus className="size-3.5" /> {t("New")}
              </button>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}
