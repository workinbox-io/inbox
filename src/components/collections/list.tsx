/**
 * A collection as a list, like Linear's: rows grouped by a select or person field (sticky headers that collapse, "+" to
 * add in place), or one flat list. Each row reads priority, ID, status, title and parent, then the record's badges
 * (record-meta.tsx), labels, the view's fields and when it last changed. Selection like the board: ⌘/Ctrl-click
 * toggles, Shift-click adds a range, X toggles the focused row; arrows move focus, Enter opens. Rows carry
 * `data-card-id`, so the app's shortcuts (S/A/L, ⌫, Space) work on the focused or hovered one.
 */
import * as React from "react"
import { ChevronRight, Plus } from "lucide-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { ActionMenu, ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import { dueState, isDueField, NONE } from "@/lib/collections/board"
import { isClosed, priorityFieldOf, priorityLevel, statusFieldOf, type CollectionField, type FieldValue } from "@/lib/collections/fields"
import { today } from "@/lib/collections/settings"
import { compareRecords, type ViewConfig } from "@/lib/collections/view-config"
import { t } from "@/lib/i18n/panel"
import type { Collection, CollectionRecord } from "@/lib/server/collections"
import { cn } from "@/lib/utils"
import { RecordBadges, type RecordIndex } from "./record-meta"
import { ChoiceView, Chip, optionColor, PriorityIcon, shortDate, StatusIcon, ValueView, type Person } from "./values"

type Group = { key: string; label: string; person?: boolean }

/** The group key of a record; NONE when empty or not a known choice. */
function keyOf(f: CollectionField, r: CollectionRecord) {
  const v = r.values[f.id]
  if (f.type === "select") return f.options?.includes(String(v ?? "")) ? String(v) : NONE
  return typeof v === "string" && v ? v : NONE
}

function groupsOf(f: CollectionField, used: Set<string>, people: Person[], onlyUsed: boolean): Group[] {
  const none = used.has(NONE) ? [{ key: NONE, label: t("No {field}", { field: f.name.toLowerCase() }) }] : []
  if (f.type === "select") return [...(f.options ?? []).filter((o) => !onlyUsed || used.has(o)).map((o) => ({ key: o, label: o })), ...none]
  const known = people.filter((p) => used.has(p.id)).map((p) => ({ key: p.id, label: p.name || p.email, person: true }))
  const gone = [...used].filter((id) => id !== NONE && !people.some((p) => p.id === id)).map((id) => ({ key: id, label: t("Former member"), person: true }))
  return [...known, ...gone, ...none]
}

export function RecordList({ collection, records, index, config, people, openId, idOf, selection, onSelection, actions, onOpen, onConfig, onCreate }: {
  collection: Collection
  records: CollectionRecord[]
  index: RecordIndex
  config: ViewConfig
  people: Person[]
  openId: string | null
  idOf: (r: CollectionRecord) => string | null
  selection: Set<string>
  onSelection: (next: Set<string>) => void
  actions?: (r: CollectionRecord) => MenuAction[]
  onOpen: (r: CollectionRecord) => void
  onConfig?: (patch: Partial<ViewConfig>) => void
  onCreate?: (title: string, values: Record<string, FieldValue>) => Promise<unknown>
}) {
  const fields = collection.fields
  const group = fields.find((f) => f.id === config.group && (f.type === "select" || f.type === "person")) ?? null
  const status = statusFieldOf(fields)
  const priority = priorityFieldOf(fields)
  const sorted = React.useMemo(
    () => [...records].sort(compareRecords(config.order, config.dir, fields, people, { order: config.then, dir: config.thenDir })),
    [records, config.order, config.dir, config.then, config.thenDir, fields, people],
  )
  const collapsed = new Set(config.collapsed)
  const groups: Group[] = group ? groupsOf(group, new Set(sorted.map((r) => keyOf(group, r))), people, config.hideEmpty || group.type === "person") : [{ key: NONE, label: "" }]
  const inGroup = (g: Group) => (group ? sorted.filter((r) => keyOf(group, r) === g.key) : sorted)
  /** Rows in display order, skipping collapsed groups. */
  const visible = groups.flatMap((g) => (collapsed.has(g.key) && group ? [] : inGroup(g)))

  const [focusId, setFocusId] = React.useState<string | null>(null)
  const [composer, setComposer] = React.useState<string | null>(null)
  const anchor = React.useRef<string | null>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const tabStop = focusId && visible.some((r) => r.id === focusId) ? focusId : visible[0]?.id
  const now = Date.now()
  const day = today()

  const label = fields.find((f) => f.type === "multiselect")
  const shown = config.props
    ? config.props.map((id) => fields.find((f) => f.id === id)).filter((f): f is CollectionField => !!f && f.id !== group?.id && f.id !== status?.id && f.id !== priority?.id && f.id !== label?.id)
    : null
  const due = fields.find((f) => isDueField(f)) ?? fields.find((f) => f.type === "date")
  const person = fields.find((f) => f.type === "person" && f.id !== group?.id)

  function toggle(r: CollectionRecord) {
    const next = new Set(selection)
    if (next.has(r.id)) next.delete(r.id)
    else next.add(r.id)
    anchor.current = r.id
    onSelection(next)
  }
  function range(r: CollectionRecord) {
    const order = visible.map((x) => x.id)
    const [a, b] = [order.indexOf(anchor.current ?? r.id), order.indexOf(r.id)].sort((m, n) => m - n)
    onSelection(new Set([...selection, ...order.slice(Math.max(0, a!), b! + 1)]))
  }
  const focusRow = (id: string) => {
    setFocusId(id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)?.focus())
  }
  function onKeyDown(e: React.KeyboardEvent, r: CollectionRecord) {
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter") return e.preventDefault(), onOpen(r)
    if (e.key === "x" && !e.metaKey && !e.ctrlKey) return e.preventDefault(), toggle(r)
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const next = visible[visible.findIndex((x) => x.id === r.id) + (e.key === "ArrowDown" ? 1 : -1)]
    if (!next) return
    if (e.shiftKey) {
      if (!anchor.current) anchor.current = r.id
      range(next)
    }
    focusRow(next.id)
  }

  const fieldValue = (f: CollectionField, r: CollectionRecord) => {
    const v = r.values[f.id]
    if (v === undefined || v === "") return null
    if (f.type === "person") {
      const p = people.find((x) => x.id === v)
      return <span key={f.id} title={p ? p.name || p.email : t("Former member")}><UserAvatar seed={p?.email ?? String(v)} size={20} /></span>
    }
    if (f.type === "date") {
      const state = isDueField(f) && !isClosed(fields, r.values) ? dueState(String(v), day) : null
      return (
        <span key={f.id} className={cn("-mx-1 rounded px-1 tabular-nums", state === "overdue" && "bg-red-500/10 text-red-600 dark:text-red-400", state === "soon" && "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
          {shortDate(String(v))}
          {state ? <span className="sr-only">{state === "overdue" ? t("Overdue") : t("Due soon")}</span> : null}
        </span>
      )
    }
    return <span key={f.id} className="flex max-w-40 min-w-0 truncate"><ValueView field={f} value={v} people={people} /></span>
  }

  const row = (r: CollectionRecord) => {
    const selected = selection.has(r.id)
    const parent = r.parentId ? index.byId.get(r.parentId) : undefined
    const labels = label && Array.isArray(r.values[label.id]) ? (r.values[label.id] as string[]) : []
    const tail = shown ? shown.map((f) => fieldValue(f, r)) : [due ? fieldValue(due, r) : null]
    const avatar = !shown && person ? fieldValue(person, r) : null
    const el = (
      <div
        role="row"
        data-card-id={r.id}
        tabIndex={r.id === tabStop ? 0 : -1}
        aria-selected={selected}
        onFocus={() => setFocusId(r.id)}
        onKeyDown={(e) => onKeyDown(e, r)}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return toggle(r)
          if (e.shiftKey) return range(r)
          anchor.current = r.id
          if (selection.size) onSelection(new Set())
          onOpen(r)
        }}
        className={cn(
          "group/row relative flex h-10 cursor-pointer items-center gap-2.5 border-b px-3 text-[13px] outline-none focus-visible:bg-foreground/[0.04]",
          r.id === openId ? "bg-primary/[0.06]" : selected ? "bg-[color-mix(in_oklab,var(--primary)_6%,var(--background))]" : "hover:bg-foreground/[0.025]",
        )}
      >
        <span className={cn("flex w-4 shrink-0 items-center", !selection.size && "opacity-0 group-hover/row:opacity-100")} onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} aria-label={t("Select {title}", { title: r.title })} onCheckedChange={() => toggle(r)} />
        </span>
        {priority ? <PriorityIcon level={priorityLevel(priority, typeof r.values[priority.id] === "string" ? String(r.values[priority.id]) : undefined)} /> : null}
        <span className="text-muted-foreground trim-caps w-16 shrink-0 truncate font-mono text-[11px]">{idOf(r)}</span>
        {status ? <StatusIcon field={status} option={typeof r.values[status.id] === "string" ? String(r.values[status.id]) : undefined} /> : null}
        <span className="min-w-0 truncate font-medium">{r.title}</span>
        {parent ? <span className="text-muted-foreground hidden min-w-0 shrink truncate text-xs sm:inline">› {parent.title}</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span className="text-muted-foreground hidden items-center gap-3 text-xs md:flex">
            <RecordBadges record={r} collection={collection} index={index} now={now} />
            {labels.length ? (
              <span className="flex items-center gap-1">
                {labels.slice(0, 3).map((l) => <Chip key={l} color={optionColor(label!, l)}>{l}</Chip>)}
                {labels.length > 3 ? <span>+{labels.length - 3}</span> : null}
              </span>
            ) : null}
            {tail}
          </span>
          {avatar}
          <span className="text-muted-foreground hidden w-14 text-right text-xs tabular-nums lg:inline">{shortDate(r.updatedAt.slice(0, 10))}</span>
          {actions ? <span className="w-7" /> : null}
        </span>
        {actions ? <ActionMenuButton actions={() => actions(r)} label={t("Record actions")} className="bg-background absolute top-1/2 right-2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100" /> : null}
      </div>
    )
    return actions ? <ActionMenu key={r.id} actions={() => actions(r)}>{el}</ActionMenu> : <React.Fragment key={r.id}>{el}</React.Fragment>
  }

  const toggleGroup = (key: string) => onConfig?.({ collapsed: collapsed.has(key) ? config.collapsed.filter((k) => k !== key) : [...config.collapsed, key] })

  return (
    <div ref={listRef} role="grid" aria-label={collection.name} className="min-w-0">
      {groups.map((g) => {
        const items = inGroup(g)
        const closed = collapsed.has(g.key)
        return (
          <section key={g.key} aria-label={group ? g.label : undefined}>
            {group ? (
              <div className="bg-muted/40 group/head sticky top-0 z-10 flex h-9 items-center gap-2 border-b px-3 text-[13px] backdrop-blur">
                <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={!closed} aria-label={closed ? t("Expand {group}", { group: g.label }) : t("Collapse {group}", { group: g.label })} className="text-muted-foreground hover:text-foreground grid size-5 place-items-center rounded">
                  <ChevronRight className={cn("size-3.5 transition-transform", !closed && "rotate-90")} />
                </button>
                {g.person ? <UserAvatar seed={people.find((p) => p.id === g.key)?.email ?? g.key} size={16} /> : g.key !== NONE ? <ChoiceView field={group} value={g.key} bare /> : null}
                <span className={cn("font-medium", g.key === NONE && "text-muted-foreground")}>{g.label}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{items.length}</span>
                {onCreate ? (
                  <button type="button" onClick={() => (closed && toggleGroup(g.key), setComposer(g.key))} aria-label={t("New in {column}", { column: g.label })} title={t("New in {column}", { column: g.label })}
                    className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground ml-auto grid size-6 place-items-center rounded-md opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100 max-sm:opacity-100">
                    <Plus className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ) : null}
            {composer === g.key && onCreate ? (
              <QuickRow
                onClose={() => setComposer(null)}
                onSubmit={(title) => onCreate(title, group && g.key !== NONE ? { [group.id]: g.key } : {})}
              />
            ) : null}
            {closed && group ? null : items.map(row)}
          </section>
        )
      })}
    </div>
  )
}

/** An inline title input under a group header: Enter adds the record (and stays for the next), Escape closes. */
function QuickRow({ onSubmit, onClose }: { onSubmit: (title: string) => Promise<unknown>; onClose: () => void }) {
  const [title, setTitle] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => input.current?.focus(), [])
  return (
    <div className="bg-primary/[0.03] flex h-10 items-center border-b px-3 pl-10">
      <input
        ref={input}
        value={title}
        disabled={busy}
        placeholder={t("Title, then Enter")}
        aria-label={t("New record title")}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && onClose()}
        onKeyDown={async (e) => {
          e.stopPropagation()
          if (e.key === "Escape") return onClose()
          if (e.key !== "Enter" || !title.trim()) return
          e.preventDefault()
          setBusy(true)
          try {
            await onSubmit(title.trim())
            setTitle("")
          } finally {
            setBusy(false)
            requestAnimationFrame(() => input.current?.focus())
          }
        }}
        className="placeholder:text-muted-foreground/70 w-full bg-transparent text-[13px] font-medium outline-none"
      />
    </div>
  )
}
