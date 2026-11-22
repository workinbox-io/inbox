/**
 * The collection's filter row: ReUI's `Filters` (components/reui/filters, the same bar as the template's and Tapll's)
 * over our own rules (lib/collections/view-config.ts). Operators are our `FilterOp` ids, so a chip maps one to one onto
 * a `FilterRule` and saved views, the server's `ruleSql` and `matchesView` stay as they were. The bar is flat AND; a
 * chip without a value yet lives here only and reaches the view once it means something.
 */
import * as React from "react"
import { Check } from "lucide-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { Filters } from "@/components/reui/filters/filters"
import { createFilterQuery, createFilterRule, flattenFilterRules } from "@/components/reui/filters/filters-query"
import type { FilterEditorProps, FilterField, FilterLabels, FilterOperator, FilterOption, FilterQuery } from "@/components/reui/filters/filters-types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api-client"
import { NONE } from "@/lib/collections/board"
import { fieldStyle, type CollectionField } from "@/lib/collections/fields"
import type { CollectionRecord } from "@/lib/server/collections"
import { opsFor, type FilterOp, type FilterRule } from "@/lib/collections/view-config"
import { msg, t } from "@/lib/i18n/panel"
import type { RelatedRecord } from "@/lib/server/collection-relations"
import { ChoiceView, FIELD_ICON, optionColor, shortDate, type Person } from "./values"

const OP_LABEL: Record<FilterOp, string> = {
  is: msg("is"), not: msg("is not"), empty: msg("is empty"), filled: msg("is not empty"), before: msg("before"), after: msg("after"),
  overdue: msg("is overdue"), lt: msg("less than"), gt: msg("more than"), contains: msg("contains"), checked: msg("is checked"), unchecked: msg("is not checked"),
}
const ARITY: Record<FilterOp, FilterOperator["arity"]> = {
  is: "many", not: "many", empty: "none", filled: "none", before: "one", after: "one", overdue: "none", lt: "one", gt: "one", contains: "one", checked: "none", unchecked: "none",
}
const INVERSE: Partial<Record<FilterOp, FilterOp>> = { is: "not", not: "is", empty: "filled", filled: "empty", checked: "unchecked", unchecked: "checked" }

/** ReUI ships no date editor on purpose; ours is the browser's date input, Enter applies. */
function DateEditor({ value, onValueChange, commit, cancel, autoFocusProps, labels, field }: FilterEditorProps<unknown, unknown>) {
  return (
    <div className="flex w-60 gap-1 p-1">
      <Input {...autoFocusProps} type="date" aria-label={field.label} value={(value as string) ?? ""} className="h-8 text-[13px]"
        onChange={(e) => onValueChange(e.target.value || undefined)}
        onKeyDown={(e) => (e.key === "Enter" ? (e.preventDefault(), commit()) : e.key === "Escape" ? cancel() : undefined)} />
      <Button type="button" size="icon-sm" variant="outline" aria-label={labels.apply} disabled={!value} onClick={() => commit()}><Check /></Button>
    </div>
  )
}

const emptyOption = (): FilterOption => ({ value: NONE, label: t("Empty"), exclusive: true })
const recordOption = (r: { id: string; title: string; key?: string | null }): FilterOption => ({ value: r.id, label: r.key ? `${r.key} ${r.title}` : r.title })

function filterField(f: CollectionField, people: Person[]): FilterField {
  const Icon = FIELD_ICON[f.type]
  const base = {
    id: f.id,
    label: f.name,
    icon: <Icon className="size-3.5" />,
    operators: opsFor(f).map((op) => ({ value: op, label: t(OP_LABEL[op]), arity: ARITY[op], inverse: INVERSE[op] })),
  }
  switch (f.type) {
    case "select":
    case "multiselect":
      return {
        ...base, type: "multiselect", searchable: (f.options?.length ?? 0) > 8,
        options: [
          ...(f.options ?? []).map((o) => ({
            value: o, label: o,
            icon: f.type === "select" && fieldStyle(f) !== "plain" ? <ChoiceView field={f} value={o} bare /> : <span className="size-2 rounded-full" style={{ background: optionColor(f, o) }} />,
          })),
          emptyOption(),
        ],
      }
    case "person":
      return { ...base, type: "multiselect", options: [...people.map((p) => ({ value: p.id, label: p.name || p.email, keywords: [p.email], icon: <UserAvatar seed={p.email} size={16} /> })), emptyOption()] }
    case "relation":
      return {
        ...base, type: "multiselect",
        loadOptions: async (q: string) => {
          if (!f.target) return [emptyOption()]
          const r = await api<{ records: CollectionRecord[] }>("GET", `/api/app/collections/${f.target}/records?limit=30${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`)
          return [...r.records.map(recordOption), emptyOption()]
        },
        resolveValues: async (ids: string[]) => {
          const real = ids.filter((id) => id !== NONE)
          const r = real.length ? await api<{ records: RelatedRecord[] }>("GET", `/api/app/collections/lookup?ids=${real.join(",")}`) : { records: [] }
          return [...r.records.map(recordOption), ...(ids.includes(NONE) ? [emptyOption()] : [])]
        },
      }
    case "date":
      return { ...base, type: "text", editor: DateEditor, renderValue: ({ value }) => (typeof value === "string" ? shortDate(value) : null), valueText: ({ value }) => (typeof value === "string" ? shortDate(value) : "") }
    case "number":
      return { ...base, type: "number" }
    case "checkbox":
      return { ...base, type: "boolean" }
    default:
      return { ...base, type: "text", placeholder: t("Text") }
  }
}

/** Rules → the bar's query (one AND group). */
const toQuery = (rules: FilterRule[]): FilterQuery =>
  createFilterQuery(rules.map((r, i) => createFilterRule({ id: `r${i}-${r.field}`, path: [r.field], operator: r.op, value: r.value })))

/** The bar's query → the rules that are complete (a field, an operator and, when it takes one, a value). */
export function toRules(query: FilterQuery): FilterRule[] {
  return flattenFilterRules(query).flatMap((r): FilterRule[] => {
    const field = r.path[0]
    const op = r.operator as FilterOp
    if (!field || !(op in ARITY)) return []
    if (ARITY[op] === "none") return [{ field, op }]
    const v = r.value
    if (ARITY[op] === "many") return Array.isArray(v) && v.length ? [{ field, op, value: v.map(String) }] : []
    if (op === "lt" || op === "gt") return typeof v === "number" && Number.isFinite(v) ? [{ field, op, value: v }] : []
    return typeof v === "string" && v.trim() ? [{ field, op, value: v.trim() }] : []
  })
}

const LABELS = (): Partial<FilterLabels> => ({
  addFilter: t("Filter"), clearAll: t("Clear filters"), searchFields: t("Search fields…"), searchOperators: t("Search…"), searchOptions: t("Search…"),
  back: t("Back"), clear: t("Clear"), apply: t("Apply"), discard: t("Discard changes"), empty: t("No results"), loading: t("Loading…"),
  loadingMore: t("Loading…"), loadMore: t("Load more"), error: t("Could not load"), retry: t("Try again"), duplicate: t("Duplicate"),
  negate: t("Negate"), remove: t("Remove filter"), filtersLabel: t("Filters"), valuePlaceholder: t("Text"), selectPlaceholder: t("Select…"),
  noValue: t("no value"), selectCondition: t("Select condition"), fieldsLabel: t("Fields"),
  valueCount: (n) => t("{n} selected").replace("{n}", String(n)),
  chipMenu: (label) => t("{field} filter options").replace("{field}", label),
})

export function FilterBar({ fields, people, filters, onChange }: { fields: CollectionField[]; people: Person[]; filters: FilterRule[]; onChange: (next: FilterRule[]) => void }) {
  const schema = React.useMemo(() => fields.map((f) => filterField(f, people)), [fields, people])
  const [query, setQuery] = React.useState(() => toQuery(filters))
  // A view switch or "Reset" changes the rules from outside: start over from them. Our own echo doesn't, so a chip
  // still waiting for its value stays.
  const incoming = JSON.stringify(filters)
  const [seen, setSeen] = React.useState(incoming)
  if (seen !== incoming) (setSeen(incoming), setQuery(toQuery(filters)))
  const labels = React.useMemo(LABELS, [])
  return (
    <Filters
      fields={schema}
      query={query}
      // Our rules have no "negated": Negate only works where the operator has an opposite.
      onBeforeQueryChange={(_, d) => !(d.reason === "negate" && d.rule && !INVERSE[d.rule.operator as FilterOp])}
      onQueryChange={(next) => {
        setQuery(next)
        const rules = toRules(next)
        const key = JSON.stringify(rules)
        if (key !== incoming) (setSeen(key), onChange(rules))
      }}
      labels={labels}
      showClear={filters.length > 0}
      className="flex-nowrap [&_[role=toolbar]]:flex-nowrap"
      size="sm"
    />
  )
}
