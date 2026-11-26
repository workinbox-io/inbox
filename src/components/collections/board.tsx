/**
 * A collection's board, shaped by its view (lib/collections/view-config.ts): one column per choice of a select field
 * (a status mark from the choice's place in the list) or per person, optional swimlanes by another such field, cards in
 * the view's order (manual = the saved `position`, lib/collections/board.ts), the fields the view shows, columns that
 * collapse to a strip. Cards drag physically: the lifted card (or the whole selection) follows the pointer on motion
 * values and tilts with its speed, neighbours glide aside, a release springs it into its slot; touch starts after a
 * short press so swipes still scroll; the board and the column under the pointer scroll near their edges.
 * Selection: ⌘/Ctrl-click toggles, Shift-click adds a range, X toggles the focused card. Right-click or "…" opens the
 * card's actions (record-actions.tsx). "+" in a column (or `compose()` from C) adds a card by its title, in place.
 * Keyboard: one tab stop, arrows move focus, Enter opens, Space lifts (arrows move it, Shift+↑/↓ changes lane, Space
 * or Enter drops, Escape cancels), every step announced. Reduced motion drops tilt and travel.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { animate, LayoutGroup, motion, MotionConfig, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from "motion/react"
import { CalendarDays, ChevronsRightLeft, Plus, UserRound } from "lucide-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { ActionMenu, ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import { dueState, isDueField, NONE, spreadPositions } from "@/lib/collections/board"
import { fieldStyle, isClosed, priorityFieldOf, priorityLevel, type CollectionField, type FieldValue } from "@/lib/collections/fields"
import { compareRecords, type ViewConfig } from "@/lib/collections/view-config"
import { t, tp } from "@/lib/i18n/panel"
import type { Collection, CollectionRecord } from "@/lib/server/collections"
import { cn } from "@/lib/utils"
import { RecordBadges, type RecordIndex } from "./record-meta"
import { LINK_ICON } from "./record-links"
import { Chip, ChoiceView, optionColor, PriorityIcon, shortDate, ValueView, type Person } from "./values"

type Slot = { lane: string; col: string; index: number }
type Drag = { id: string; ids: string[]; slot: Slot; from: Slot; mode: "pointer" | "keyboard"; w: number; h: number }
export type BoardMove = { record: CollectionRecord; values: Record<string, FieldValue | null>; position?: number }
export type BoardHandle = { compose: () => void }
type Group = { key: string; label: string; color: string; step: number; person?: boolean }

const SPRING = { type: "spring", stiffness: 520, damping: 46 } as const
const EDGE = 56
const SEP = "\u0001"
const MUTED = "var(--muted-foreground)"

/** The column (or lane) key of a record for a select or person field; NONE when empty or not a known choice. */
function keyOf(f: CollectionField, r: CollectionRecord) {
  const v = r.values[f.id]
  if (f.type === "select") return f.options?.includes(String(v ?? "")) ? String(v) : NONE
  return typeof v === "string" && v ? v : NONE
}

/** Columns or lanes for a field: every choice (or only used ones), the people who appear, then "No …" if used. */
function groupsOf(f: CollectionField, used: Set<string>, people: Person[], onlyUsed: boolean): Group[] {
  const none = used.has(NONE) ? [{ key: NONE, label: t("No {field}", { field: f.name.toLowerCase() }), color: MUTED, step: -1 }] : []
  if (f.type === "select")
    return [...(f.options ?? []).map((o, i) => ({ key: o, label: o, color: optionColor(f, o), step: i })).filter((g) => !onlyUsed || used.has(g.key)), ...none]
  const known = people.filter((p) => used.has(p.id)).map((p) => ({ key: p.id, label: p.name || p.email, color: MUTED, step: 0, person: true }))
  const gone = [...used].filter((id) => id !== NONE && !people.some((p) => p.id === id)).map((id) => ({ key: id, label: t("Former member"), color: MUTED, step: 0, person: true }))
  return [...known, ...gone, ...none]
}

/** Choice i of n as a ring filling up: empty for the first, a tick for the last, dashed for "no value". */
function StatusMark({ color, step, of }: { color: string; step: number; of: number }) {
  if (step < 0) return <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" aria-hidden><circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" /></svg>
  const done = of > 1 && step === of - 1
  const frac = of > 1 ? step / (of - 1) : 0
  const a = frac * 2 * Math.PI
  const pie = frac > 0 && !done ? `M7 7 L7 3 A4 4 0 ${frac > 0.5 ? 1 : 0} 1 ${7 + 4 * Math.sin(a)} ${7 - 4 * Math.cos(a)} Z` : ""
  return (
    <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" aria-hidden>
      {done ? (
        <><circle cx="7" cy="7" r="6.25" fill={color} /><path d="M4.4 7.2 6.2 9 9.6 5.4" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>
      ) : (
        <><circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5" />{pie ? <path d={pie} fill={color} /> : null}</>
      )}
    </svg>
  )
}

function GroupMark({ g, field, people }: { g: Group; field: CollectionField; people: Person[] }) {
  if (g.person) return <UserAvatar seed={people.find((p) => p.id === g.key)?.email ?? g.key} size={16} />
  // Status and priority fields draw their own marks; a plain choice gets a ring filling with its place.
  if (g.key !== NONE && fieldStyle(field) !== "plain") return <ChoiceView field={field} value={g.key} bare />
  return <StatusMark color={g.color} step={g.step} of={field.options?.length ?? 0} />
}

/** A count that rolls when it changes. */
function Count({ n }: { n: number }) {
  return (
    <span className="text-muted-foreground relative inline-flex overflow-hidden text-xs tabular-nums">
      <motion.span key={n} initial={{ y: "-70%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }}>{n}</motion.span>
    </span>
  )
}

type CardInfo = { chips: CollectionField[]; extra: CollectionField[]; person?: CollectionField; date?: CollectionField; priority?: CollectionField; today: string }

/** What a card shows; the same for the card in its column and the one riding the pointer. `done`: dates aren't due. */
const CardBody = React.memo(function CardBody({ r, info, people, done, id, collection, index }: { r: CollectionRecord; info: CardInfo; people: Person[]; done: boolean; id: string | null; collection: Collection; index: RecordIndex }) {
  const who = info.person ? r.values[info.person.id] : undefined
  const when = info.date ? r.values[info.date.id] : undefined
  const due = info.date && when && !done && isDueField(info.date) ? dueState(String(when), info.today) : null
  const person = typeof who === "string" ? people.find((p) => p.id === who) : undefined
  const chips = info.chips.filter((f) => r.values[f.id] !== undefined)
  const kinds = [...new Set(r.linkKinds ?? [])]
  const level = info.priority ? priorityLevel(info.priority, r.values[info.priority.id] as string | undefined) : 0
  const parent = r.parentId ? index.byId.get(r.parentId) : undefined
  // Called, not rendered: its null tells whether the bottom row has anything (it uses no hooks).
  const badges = RecordBadges({ record: r, collection, index, now: Date.parse(`${info.today}T12:00:00`) })
  const meta = chips.length || when || kinds.length || info.extra.some((f) => r.values[f.id] !== undefined)
  // One fixed-height line per row and flex everywhere, so icons sit on the text's centre, not its baseline.
  return (
    <>
      <span className="text-muted-foreground -mb-0.5 flex h-5 min-w-0 items-center gap-1.5 font-mono text-[11px] leading-none">
        {info.priority ? <PriorityIcon level={level} className="size-3" /> : null}
        {id ? <span className="trim-caps shrink-0">{id}</span> : null}
        {parent ? <span className="min-w-0 trim-caps truncate font-sans">› {parent.title}</span> : null}
        {typeof who === "string" ? <span title={person ? person.name || person.email : t("Former member")} className="ml-auto flex shrink-0"><UserAvatar seed={person?.email ?? who} size={20} /></span>
          : info.person ? <span title={t("Nobody")} className="border-muted-foreground/40 text-muted-foreground/60 ml-auto grid size-5 shrink-0 place-items-center rounded-full border border-dashed"><UserRound className="size-3" aria-label={t("Nobody")} /></span> : null}
      </span>
      <span className="leading-snug font-medium">{r.title}</span>
      {meta || badges ? (
        <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs [&>*]:min-h-5">
          {chips.flatMap((f) => {
            const v = r.values[f.id]!
            if (Array.isArray(v)) return v.map((x) => <span key={`${f.id}:${x}`} className="flex items-center"><Chip color={optionColor(f, x)}>{x}</Chip></span>)
            return [<span key={f.id} className="flex min-w-0 items-center text-foreground"><ChoiceView field={f} value={String(v)} /></span>]
          })}
          {when ? (
            <span className={cn("flex shrink-0 items-center gap-1 rounded tabular-nums", due && "px-1", due === "overdue" && "bg-red-500/10 text-red-600 dark:text-red-400", due === "soon" && "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
              <CalendarDays className="size-3 shrink-0" />{shortDate(String(when))}
              {due ? <span className="sr-only">{due === "overdue" ? t("Overdue") : t("Due soon")}</span> : null}
            </span>
          ) : null}
          {badges}
          {kinds.length ? (
            <span className="flex items-center gap-1" title={t("Links")}>
              {kinds.slice(0, 3).map((k) => { const Icon = LINK_ICON[k]; return <Icon key={k} className="size-3 shrink-0" aria-hidden /> })}
              <span className="tabular-nums">{r.linkKinds!.length}</span>
              <span className="sr-only">{t("links")}</span>
            </span>
          ) : null}
          {info.extra.map((f) => (r.values[f.id] !== undefined ? <span key={f.id} className="flex min-w-0 items-center truncate"><ValueView field={f} value={r.values[f.id]} people={people} /></span> : null))}
        </span>
      ) : null}
    </>
  )
})

/** The fields on cards: the view's list, or a default (priority by the ID, two choices, labels, a person, a date, one more). */
function cardInfo(fields: CollectionField[], props: string[] | null, skip: (string | undefined)[]): CardInfo {
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const others = fields.filter((f) => !skip.includes(f.id))
  const pf = priorityFieldOf(others)
  const choice = (f: CollectionField) => (f.type === "select" && f !== pf) || f.type === "multiselect"
  if (props) {
    const shown = props.map((id) => others.find((f) => f.id === id)).filter((f): f is CollectionField => !!f)
    const person = shown.find((f) => f.type === "person")
    const date = shown.find((f) => f.type === "date")
    const priority = shown.includes(pf!) ? pf : undefined
    return { today, person, date, priority, chips: shown.filter(choice), extra: shown.filter((f) => f !== person && f !== date && f !== priority && !choice(f)) }
  }
  const date = others.find((f) => f.type === "date" && isDueField(f)) ?? others.find((f) => f.type === "date")
  const person = others.find((f) => f.type === "person")
  return { date, person, today, priority: pf, chips: [...others.filter((f) => f.type === "select" && f !== pf).slice(0, 2), ...others.filter((f) => f.type === "multiselect").slice(0, 1)], extra: others.filter((f) => f !== person && f !== date && !choice(f) && f !== pf && !["checkbox", "person", "relation", "file"].includes(f.type)).slice(0, 1) }
}

const cardClass = "bg-background grid w-full gap-2 rounded-lg border border-border/80 p-3 text-left text-[13px] shadow-[0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-colors select-none hover:border-foreground/20 focus-visible:ring-ring/50 focus-visible:ring-[3px]"

export function Board({ ref, config, collection, records, index, people, openId, idOf, selection, onSelection, actions, onOpen, onConfig, onMove, onCreate }: {
  ref?: React.Ref<BoardHandle>
  config: ViewConfig
  collection: Collection
  records: CollectionRecord[]
  /** Sub-records and blockers from every loaded record (record-meta.tsx). */
  index: RecordIndex
  people: Person[]
  openId: string | null
  idOf?: (r: CollectionRecord) => string | null
  selection: Set<string>
  onSelection: (next: Set<string>) => void
  /** A card's menu; the app makes it act on the selection when the card is in it. */
  actions?: (r: CollectionRecord) => MenuAction[]
  onOpen: (r: CollectionRecord) => void
  /** Collapsing a column changes the view. */
  onConfig?: (patch: Partial<ViewConfig>) => void
  /** Absent for viewers: cards don't move and columns have no "+". */
  onMove?: (moves: BoardMove[]) => void
  onCreate?: (title: string, values: Record<string, FieldValue>) => Promise<unknown>
}) {
  const field = collection.fields.find((f) => f.id === config.group)!
  const laneField = collection.fields.find((f) => f.id === config.lanes) ?? null
  const manual = config.order === "manual"
  const reduced = useReducedMotion()
  const scroller = React.useRef<HTMLDivElement>(null)
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const dragRef = React.useRef(drag)
  dragRef.current = drag
  const [focusId, setFocusId] = React.useState<string | null>(null)
  const [composer, setComposer] = React.useState<{ lane: string; col: string } | null>(null)
  const anchor = React.useRef<string | null>(null)
  const [said, say] = React.useState("")
  const [fade, setFade] = React.useState(false)
  const clicked = React.useRef(false)

  const colOf = (r: CollectionRecord) => keyOf(field, r)
  const laneOf = (r: CollectionRecord) => (laneField ? keyOf(laneField, r) : NONE)
  const sorted = React.useMemo(() => [...records].sort(compareRecords(config.order, config.dir, collection.fields, people, { order: config.then, dir: config.thenDir })), [records, config.order, config.dir, config.then, config.thenDir, collection.fields, people])
  const columns = groupsOf(field, new Set(sorted.map(colOf)), people, config.hideEmpty || field.type === "person")
  const lanes = laneField ? groupsOf(laneField, new Set(sorted.map(laneOf)), people, true) : [{ key: NONE, label: "", color: MUTED, step: -1 }]
  const collapsed = new Set(config.collapsed)
  const laneLabel = (key: string) => lanes.find((l) => l.key === key)?.label ?? ""
  const colLabel = (key: string) => columns.find((c) => c.key === key)?.label ?? key
  const moving = new Set(drag?.ids ?? [])
  const inCell = (r: CollectionRecord, ln: string, col: string) => colOf(r) === col && (!laneField || laneOf(r) === ln)
  /** The records of one cell in order, without the ones being moved. */
  const cell = (ln: string, col: string) => sorted.filter((r) => !moving.has(r.id) && inCell(r, ln, col))

  const info = React.useMemo(() => cardInfo(collection.fields, config.props, [field.id, laneField?.id]), [collection.fields, config.props, field.id, laneField?.id])

  // The right edge fades while more columns wait there.
  const measure = React.useCallback(() => {
    const el = scroller.current
    if (el) setFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])
  React.useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (scroller.current) ro.observe(scroller.current)
    return () => ro.disconnect()
  }, [measure, columns.length])

  /** Writes a finished move: the new column/lane values and, in manual order, positions between the new neighbours. */
  function commit(d: Drag) {
    const list = d.ids.map((id) => records.find((x) => x.id === id)).filter((r): r is CollectionRecord => !!r)
    const main = list.find((r) => r.id === d.id)
    if (!main || !onMove) return
    const { lane: ln, col, index } = d.slot
    const same = ln === d.from.lane && col === d.from.col && index === d.from.index
    if (same && list.length === 1) return say(t("{title} stays in {column}.", { title: main.title, column: colLabel(col) }))
    const rest = sorted.filter((x) => !d.ids.includes(x.id) && inCell(x, ln, col))
    const valuesOf = (record: CollectionRecord) => {
      const values: Record<string, FieldValue | null> = {}
      if (colOf(record) !== col) values[field.id] = col === NONE ? null : col
      if (laneField && ln !== d.from.lane && laneOf(record) !== ln) values[laneField.id] = ln === NONE ? null : ln
      return values
    }
    if (!manual) {
      // Sorted by something else, the sort would undo the drop ("updated" puts it on top): the view turns manual and
      // the column keeps what's on screen, renumbered with the cards where they were dropped.
      // shortcut: a column over 200 cards exceeds one batch call; chunk in moveCards if columns get that long.
      const order = [...rest.slice(0, index), ...list, ...rest.slice(index)]
      onMove(order.map((record, i) => ({ record, values: d.ids.includes(record.id) ? valuesOf(record) : {}, position: i })))
      onConfig?.({ order: "manual", dir: 1, then: null })
    } else {
      // Descending manual order shows higher positions first, so the neighbours swap.
      const [above, below] = [rest[index - 1]?.position, rest[index]?.position]
      const positions = config.dir === 1 ? spreadPositions(above, below, list.length) : spreadPositions(below, above, list.length).reverse()
      onMove(list.map((record, i) => ({ record, values: valuesOf(record), position: positions[i] })))
    }
    say(list.length > 1
      ? tp(list.length, { one: "Moved {n} record to {column}.", other: "Moved {n} records to {column}." }, { column: colLabel(col) })
      : t("Dropped {title} in {column}, position {n}.", { title: main.title, column: colLabel(col), n: index + 1 }))
  }
  // The pointer's listeners outlive the render that added them: they call the latest commit.
  const commitRef = React.useRef(commit)
  commitRef.current = commit

  const slotOf = (r: CollectionRecord): Slot => {
    const ln = laneOf(r)
    const col = colOf(r)
    return { lane: ln, col, index: sorted.filter((x) => inCell(x, ln, col)).findIndex((x) => x.id === r.id) }
  }

  // ---- Pointer dragging ----
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const tilt = useSpring(useTransform(useVelocity(x), [-1500, 0, 1500], [-7, 0, 7]), { stiffness: 380, damping: 38 })
  const pointer = React.useRef({ x: 0, y: 0, dx: 0, dy: 0 })

  /** The cell and index under the pointer: the cell element from the point, the index from the cards' middles. */
  const hitTest = React.useCallback((cx: number, cy: number) => {
    const d = dragRef.current
    const el = document.elementFromPoint(cx, cy)?.closest<HTMLElement>("[data-cell]")
    if (!d || !el) return
    const [ln, col] = el.dataset.cell!.split(SEP) as [string, string]
    let index = 0
    for (const c of el.querySelectorAll<HTMLElement>("[data-card]")) {
      const b = c.getBoundingClientRect()
      if (b.top + b.height / 2 < cy) index++
    }
    if (d.slot.lane !== ln || d.slot.col !== col || d.slot.index !== index) setDrag({ ...d, slot: { lane: ln, col, index } })
  }, [])

  // Auto scroll near the edges of the board and of the column under the pointer.
  React.useEffect(() => {
    if (drag?.mode !== "pointer") return
    let frame = 0
    const tick = () => {
      const board = scroller.current
      const { x: cx, y: cy } = pointer.current
      if (board) {
        const b = board.getBoundingClientRect()
        const sx = cx < b.left + EDGE ? -1 : cx > b.right - EDGE ? 1 : 0
        if (sx) board.scrollLeft += sx * 14
        const list = laneField ? board : document.elementFromPoint(cx, cy)?.closest<HTMLElement>("[data-cell]")
        let sy = 0
        if (list) {
          const l = list.getBoundingClientRect()
          sy = cy < l.top + EDGE ? -1 : cy > l.bottom - EDGE ? 1 : 0
          if (sy) list.scrollTop += sy * 12
        }
        if (sx || sy) hitTest(cx, cy)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [drag?.mode, laneField, hitTest])

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, r: CollectionRecord) {
    if (!onMove || e.button !== 0 || dragRef.current || e.metaKey || e.ctrlKey || e.shiftKey) return
    const card = e.currentTarget
    const start = { x: e.clientX, y: e.clientY }
    const touch = e.pointerType !== "mouse"
    let started = false
    let timer = 0
    const begin = () => {
      started = true
      const b = card.getBoundingClientRect()
      pointer.current = { x: start.x, y: start.y, dx: start.x - b.left, dy: start.y - b.top }
      x.jump(b.left)
      y.jump(b.top)
      const from = slotOf(r)
      // A selected card takes the whole selection along, in board order.
      const ids = selection.has(r.id) && selection.size > 1 ? sorted.filter((x) => selection.has(x.id)).map((x) => x.id) : [r.id]
      setDrag({ id: r.id, ids, from, slot: from, mode: "pointer", w: b.width, h: b.height })
      say(ids.length > 1 ? tp(ids.length, { one: "Picked up {n} record.", other: "Picked up {n} records." }) : t("Picked up {title}.", { title: r.title }))
      if (touch) navigator.vibrate?.(10)
    }
    const blockScroll = (ev: TouchEvent) => started && ev.preventDefault()
    const move = (ev: PointerEvent) => {
      if (!started) {
        const far = Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > (touch ? 8 : 4)
        if (touch && far) return end() // a swipe: let it scroll
        if (!touch && far) begin()
        if (!started) return
      }
      pointer.current.x = ev.clientX
      pointer.current.y = ev.clientY
      x.set(ev.clientX - pointer.current.dx)
      y.set(ev.clientY - pointer.current.dy)
      hitTest(ev.clientX, ev.clientY)
    }
    const up = (ev: PointerEvent) => {
      end()
      if (!started) return
      clicked.current = true
      setTimeout(() => (clicked.current = false))
      const d = dragRef.current
      if (!d) return
      if (ev.type === "pointercancel") return cancel()
      const slot = scroller.current?.querySelector<HTMLElement>("[data-slot]")?.getBoundingClientRect()
      const land = () => (commitRef.current(d), setDrag(null))
      if (!slot || reduced) return land()
      void Promise.all([animate(x, slot.left, SPRING), animate(y, slot.top, SPRING)]).then(land)
    }
    function end() {
      clearTimeout(timer)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      window.removeEventListener("touchmove", blockScroll)
    }
    if (touch) timer = window.setTimeout(begin, 220)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    window.addEventListener("touchmove", blockScroll, { passive: false })
  }

  function cancel() {
    setDrag(null)
    say(t("Move cancelled."))
  }
  React.useEffect(() => {
    if (drag?.mode !== "pointer") return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), cancel())
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [drag?.mode])

  // ---- Selection ----
  /** Cards in reading order (lane, column, place), skipping collapsed columns. */
  const grid = () => lanes.map((l) => columns.map((c) => (collapsed.has(c.key) ? [] : sorted.filter((r) => inCell(r, l.key, c.key)))))
  const flat = () => grid().flat(2)
  function select(r: CollectionRecord, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) {
    if (e.shiftKey && anchor.current) {
      const order = flat().map((x) => x.id)
      const [a, b] = [order.indexOf(anchor.current), order.indexOf(r.id)].sort((m, n) => m - n)
      if (a! >= 0) return onSelection(new Set([...selection, ...order.slice(a, b! + 1)]))
    }
    const next = new Set(selection)
    if (next.has(r.id)) next.delete(r.id)
    else next.add(r.id)
    anchor.current = r.id
    onSelection(next)
  }

  // ---- Keyboard ----
  const focusCard = (id: string) => {
    setFocusId(id)
    requestAnimationFrame(() => scroller.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)?.focus())
  }

  function onKeyDown(e: React.KeyboardEvent, r: CollectionRecord) {
    const d = dragRef.current
    const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
    if (d?.mode === "keyboard") {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === "Escape") return cancel(), focusCard(d.id)
      if (e.key === " " || e.key === "Enter") return setDrag(null), commit(d), focusCard(d.id)
      if (!arrows.includes(e.key)) return
      let { lane: ln, col, index } = d.slot
      const li = lanes.findIndex((l) => l.key === ln)
      const open = columns.filter((c) => !collapsed.has(c.key))
      const ci = open.findIndex((c) => c.key === col)
      if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) ln = lanes[Math.max(0, Math.min(lanes.length - 1, li + (e.key === "ArrowUp" ? -1 : 1)))]!.key
      else if (e.key === "ArrowUp") index--
      else if (e.key === "ArrowDown") index++
      else col = open[Math.max(0, Math.min(open.length - 1, ci + (e.key === "ArrowLeft" ? -1 : 1)))]!.key
      const size = sorted.filter((x) => x.id !== d.id && inCell(x, ln, col)).length
      index = Math.max(0, Math.min(size, index))
      setDrag({ ...d, slot: { lane: ln, col, index } })
      say(t("{column}, position {n} of {count}.", { column: laneField ? `${colLabel(col)}, ${laneLabel(ln)}` : colLabel(col), n: index + 1, count: size + 1 }))
      focusCard(d.id)
      return
    }
    if (e.key === " " && onMove) {
      e.preventDefault()
      const from = slotOf(r)
      setDrag({ id: r.id, ids: [r.id], from, slot: from, mode: "keyboard", w: 0, h: 0 })
      return say(t("Picked up {title}. Arrows move it, Space drops it, Escape cancels.", { title: r.title }))
    }
    if (e.key === "x" && !e.metaKey && !e.ctrlKey) return e.preventDefault(), select(r, { metaKey: true, ctrlKey: false, shiftKey: false })
    if (!arrows.includes(e.key)) return
    e.preventDefault()
    const g = grid()
    const s = slotOf(r)
    const li = lanes.findIndex((l) => l.key === s.lane)
    const ci = columns.findIndex((c) => c.key === s.col)
    let next: CollectionRecord | undefined
    if (e.key === "ArrowDown") next = g[li]![ci]![s.index + 1] ?? g.slice(li + 1).find((row) => row[ci]!.length)?.[ci]![0]
    else if (e.key === "ArrowUp") next = s.index > 0 ? g[li]![ci]![s.index - 1] : g.slice(0, li).reverse().find((row) => row[ci]!.length)?.[ci]!.at(-1)
    else {
      const step = e.key === "ArrowLeft" ? -1 : 1
      for (let c = ci + step; c >= 0 && c < columns.length && !next; c += step) {
        const list = g[li]![c]!
        next = list[Math.min(s.index, list.length - 1)]
      }
    }
    if (next) {
      focusCard(next.id)
      if (e.shiftKey) select(next, { metaKey: false, ctrlKey: false, shiftKey: true })
    }
  }

  // ---- Quick create ----
  React.useImperativeHandle(ref, () => ({
    compose: () => {
      const r = sorted.find((x) => x.id === document.activeElement?.getAttribute("data-card-id"))
      const col = r ? colOf(r) : columns.find((c) => !collapsed.has(c.key))?.key
      if (col !== undefined) setComposer({ lane: r ? laneOf(r) : lanes[0]!.key, col })
    },
  }))

  const tabStop = focusId && sorted.some((r) => r.id === focusId) ? focusId : sorted[0]?.id
  const dragged = drag ? records.find((r) => r.id === drag.id) : undefined

  const card = (r: CollectionRecord, lifted = false) => {
    const selected = selection.has(r.id)
    const button = (
      <button
        type="button"
        data-card-id={r.id}
        tabIndex={r.id === tabStop ? 0 : -1}
        aria-roledescription={onMove ? t("draggable card") : undefined}
        aria-label={[idOf?.(r), r.title, colLabel(colOf(r)), laneField && laneOf(r) !== NONE ? laneLabel(laneOf(r)) : ""].filter(Boolean).join(", ")}
        aria-pressed={lifted || undefined}
        aria-selected={selected}
        draggable={false}
        onPointerDown={(e) => onPointerDown(e, r)}
        onFocus={() => setFocusId(r.id)}
        onKeyDown={(e) => onKeyDown(e, r)}
        onKeyUp={(e) => e.key === " " && e.preventDefault()}
        onClick={(e) => {
          if (clicked.current) return void (clicked.current = false)
          if (e.metaKey || e.ctrlKey || e.shiftKey) return select(r, e)
          anchor.current = r.id
          if (selection.size) onSelection(new Set())
          onOpen(r)
        }}
        className={cn(
          cardClass,
          r.id === openId && "border-primary/50 ring-primary/20 ring-2",
          selected && "border-primary/50 bg-[color-mix(in_oklab,var(--primary)_6%,var(--background))]",
          lifted && "ring-primary/40 scale-[1.02] shadow-lg ring-2",
          onMove && "touch-manipulation [-webkit-touch-callout:none]",
        )}
      >
        <CardBody r={r} info={info} people={people} done={isClosed(collection.fields, r.values)} id={idOf?.(r) ?? null} collection={collection} index={index} />
      </button>
    )
    return (
      <motion.li key={r.id} layout={reduced ? false : "position"} layoutId={reduced ? undefined : `card-${r.id}`} transition={SPRING} data-card className="group/card relative">
        {actions ? <ActionMenu actions={() => actions(r)}>{button}</ActionMenu> : button}
        {actions ? <ActionMenuButton actions={() => actions(r)} label={t("Record actions")} className="bg-background absolute top-1.5 right-1.5 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100" /> : null}
      </motion.li>
    )
  }

  const quickCard = (ln: string, col: string) => (
    <li key="composer">
      <QuickCreate
        placeholder={t("Title, then Enter")}
        onClose={() => setComposer(null)}
        onSubmit={(title) => {
          const values: Record<string, FieldValue> = {}
          if (col !== NONE) values[field.id] = col
          if (laneField && ln !== NONE) values[laneField.id] = ln
          return onCreate!(title, values)
        }}
      />
    </li>
  )

  const renderCell = (ln: string, g: Group) => {
    const col = g.key
    const over = drag?.slot.lane === ln && drag.slot.col === col
    if (collapsed.has(col))
      return (
        <div data-cell={`${ln}${SEP}${col}`} className={cn("flex min-h-14 flex-1 justify-center rounded-xl pt-2 transition-colors", over ? "bg-foreground/[0.06]" : "bg-foreground/[0.025]")}>
          <span className="text-muted-foreground text-xs tabular-nums">{sorted.filter((r) => inCell(r, ln, col)).length}</span>
        </div>
      )
    const items = cell(ln, col)
    const nodes: React.ReactNode[] = items.map((r) => card(r))
    if (drag && dragged && over) {
      const at = Math.min(drag.slot.index, nodes.length)
      nodes.splice(at, 0, drag.mode === "keyboard" ? card(dragged, true) : (
        <motion.li key="slot" data-slot layout={reduced ? false : "position"} transition={SPRING} style={{ height: drag.h }} className="rounded-lg border-2 border-dashed" aria-hidden />
      ))
    }
    if (composer?.lane === ln && composer.col === col && onCreate) nodes.unshift(quickCard(ln, col))
    return (
      <motion.ul
        layoutScroll
        data-cell={`${ln}${SEP}${col}`}
        aria-label={laneField ? `${colLabel(col)}, ${laneLabel(ln)}` : colLabel(col)}
        // Neutral columns (Linear); the status colour stays on the column's icon.
        className={cn("grid content-start gap-2 rounded-xl p-2 transition-colors", over ? "bg-foreground/[0.05]" : "bg-foreground/[0.025]", laneField ? "min-h-14" : "min-h-0 flex-1 overflow-y-auto overscroll-y-contain")}
      >
        {nodes}
      </motion.ul>
    )
  }

  const width = (key: string) => (collapsed.has(key) ? "w-11 shrink-0" : "w-[85vw] shrink-0 snap-start scroll-ml-4 sm:w-72")
  const toggleCollapse = (key: string) => onConfig?.({ collapsed: collapsed.has(key) ? config.collapsed.filter((k) => k !== key) : [...config.collapsed, key] })
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={`board-${collection.id}`}>
        <motion.div
          ref={scroller}
          layoutScroll
          onScroll={measure}
          className={cn("flex min-h-0 flex-1 flex-col overflow-x-auto", laneField ? "overflow-y-auto" : "overflow-y-hidden", !drag && "snap-x snap-mandatory sm:snap-none")}
          style={fade ? { maskImage: "linear-gradient(to right, #000 calc(100% - 48px), transparent)", WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 48px), transparent)" } : undefined}
        >
          <div className="bg-background sticky top-0 z-10 flex w-max gap-3 px-4 pt-3 pb-1">
            {columns.map((c) => {
              const n = sorted.filter((r) => colOf(r) === c.key).length
              if (collapsed.has(c.key))
                return (
                  <button key={c.key} type="button" onClick={() => toggleCollapse(c.key)} title={t("Expand {column}", { column: c.label })} aria-label={t("Expand {column}", { column: c.label })}
                    className={cn(width(c.key), "hover:bg-foreground/[0.04] flex h-8 items-center justify-center rounded-md")}>
                    <GroupMark g={c} field={field} people={people} />
                  </button>
                )
              return (
                <div key={c.key} className={cn(width(c.key), "group flex h-8 items-center gap-2 px-1")}>
                  <GroupMark g={c} field={field} people={people} />
                  <h3 className={cn("truncate text-[13px] font-medium", c.key === NONE && "text-muted-foreground")}>{c.label}</h3>
                  <Count n={n} />
                  <span className="ml-auto flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
                    {onConfig ? (
                      <button type="button" onClick={() => toggleCollapse(c.key)} aria-label={t("Collapse {column}", { column: c.label })} title={t("Collapse {column}", { column: c.label })}
                        className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground grid size-6 place-items-center rounded-md max-sm:hidden">
                        <ChevronsRightLeft className="size-3.5" />
                      </button>
                    ) : null}
                    {onCreate ? (
                      <button type="button" onClick={() => setComposer({ lane: lanes[0]!.key, col: c.key })} aria-label={t("New in {column}", { column: c.label })} title={t("New in {column}", { column: c.label })}
                        className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground grid size-6 place-items-center rounded-md">
                        <Plus className="size-3.5" />
                      </button>
                    ) : null}
                  </span>
                </div>
              )
            })}
          </div>
          {lanes.map((l) => (
            <section key={l.key} aria-label={laneField ? l.label : undefined} className={cn("flex w-max flex-col", !laneField && "min-h-0 flex-1")}>
              {laneField ? (
                <h4 className="bg-background sticky left-0 flex w-fit items-center gap-2 px-5 pt-3 pb-1.5 text-[13px] font-medium">
                  {l.key === NONE ? <span className="text-muted-foreground">{l.label}</span> : <><GroupMark g={l} field={laneField} people={people} />{l.label}</>}
                  <Count n={sorted.filter((r) => laneOf(r) === l.key).length} />
                </h4>
              ) : null}
              <div className={cn("flex gap-3 px-4 pb-3", !laneField && "min-h-0 flex-1")}>
                {columns.map((c) => <div key={c.key} className={cn(width(c.key), "flex min-h-0 flex-col")}>{renderCell(l.key, c)}</div>)}
              </div>
            </section>
          ))}
        </motion.div>
      </LayoutGroup>
      <div aria-live="assertive" className="sr-only">{said}</div>
      {drag?.mode === "pointer" && dragged
        ? createPortal(
            <motion.div
              className="pointer-events-none fixed top-0 left-0 z-50"
              style={{ x, y, width: drag.w, rotate: reduced ? 0 : tilt }}
              initial={{ scale: 1 }}
              animate={{ scale: reduced ? 1 : 1.02 }}
              aria-hidden
            >
              {drag.ids.length > 1 ? <div className={cn(cardClass, "absolute inset-0 translate-x-1.5 translate-y-1.5 rotate-2")} /> : null}
              <div className={cn(cardClass, "relative cursor-grabbing shadow-[0_12px_32px_rgba(0,0,0,0.18)]")}>
                <CardBody r={dragged} info={info} people={people} done={isClosed(collection.fields, dragged.values)} id={idOf?.(dragged) ?? null} collection={collection} index={index} />
              </div>
              {drag.ids.length > 1 ? <span className="bg-primary text-primary-foreground absolute -top-2 -right-2 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-medium tabular-nums">{drag.ids.length}</span> : null}
            </motion.div>,
            document.body,
          )
        : null}
    </MotionConfig>
  )
}

/** A title field in the column: Enter adds the record and stays for the next one, Escape (or leaving it empty) closes. */
function QuickCreate({ placeholder, onSubmit, onClose }: { placeholder: string; onSubmit: (title: string) => Promise<unknown>; onClose: () => void }) {
  const [title, setTitle] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const input = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => input.current?.focus(), [])
  return (
    <div className={cn(cardClass, "ring-primary/30 ring-2")}>
      <textarea
        ref={input}
        rows={2}
        value={title}
        disabled={busy}
        placeholder={placeholder}
        aria-label={t("New record title")}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && onClose()}
        onKeyDown={async (e) => {
          e.stopPropagation()
          if (e.key === "Escape") return onClose()
          if (e.key !== "Enter" || e.shiftKey || !title.trim()) return
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
        className="placeholder:text-muted-foreground/70 w-full resize-none bg-transparent leading-snug font-medium outline-none"
      />
    </div>
  )
}
