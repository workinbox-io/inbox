/**
 * /app/collections[/<id>] on the workspace kit: lists a company defines itself (lib/collections/fields.ts). Rail with
 * the collections, their saved views, triage, cycles and the trash (`?scope=`); the open one as a list (list.tsx),
 * table (views.tsx), board (board.tsx), timeline (timeline.tsx) or calendar (calendar-view.tsx) shaped by its view
 * (use-collection-view.ts, display-menu.tsx), a filter row with operators (filter-menu.tsx; the server filters when
 * not everything is loaded), the open record in a panel beside it (record-panel.tsx), Peek on Space (peek.tsx), and
 * for owners and admins the collection dialog (template, name, fields, cycles, triage, SLA, templates, repeats).
 * Linear-like work on records: one action list (record-actions.tsx) behind right-click, "…", the selection bar and ⌘K;
 * S / A / L / P open the field picker (status, assignee, labels, priority) for the selection, the focused or hovered
 * card or the open record; ⌫ moves to the trash; ⌘Z undoes the last change; ⌘⇧C / ⌘. / ⌘⇧. copy the link, ID and git
 * branch; ⌘A selects all; C adds a record. Switching collections reloads the page's data (lib/server/app-page.ts).
 */
import * as React from "react"
import { CalendarDays, ChevronDown, Database, Download, FileSpreadsheet, Eye, GanttChart, Globe, Inbox, IterationCw, Layers, LayoutGrid, List, Lock, Pencil, Plus, Search, SearchX, Settings2, Table2, Trash2, Upload, Users, X, Zap, type LucideIcon } from "lucide-react"
import { AnimatePresence } from "motion/react"
import { toast } from "@yusufceng1z/ding-react"
import { ConfirmButton, ConfirmDialog } from "@/components/app/confirm-button"
import { UserAvatar } from "@/components/app/user-avatar"
import { ShareDialog } from "@/components/workspace/share-dialog"
import { AutomationsDialog } from "./automations-dialog"
import { RecordPanel, type PanelRecord } from "./record-panel"
import { FIELD_ICON, forgetRecordRefs, type Person } from "./values"
import { Board, type BoardHandle, type BoardMove } from "./board"
import { RecordCalendar } from "./calendar-view"
import { CollectionSettingsSection } from "./collection-settings"
import { DisplayMenu, SaveViewDialog } from "./display-menu"
import { FieldPicker, type PickerRequest } from "./field-picker"
import { AppearancePicker, CollectionIcon } from "./collection-icon"
import { FilterBar } from "./filter-menu"
import { RecordList } from "./list"
import { Peek } from "./peek"
import { branchName, copyText, recordActions, recordLink, type CycleOption } from "./record-actions"
import { useRecordIndex } from "./record-meta"
import { CollectionsMeta, RecordPicker } from "./record-picker"
import { RepeatDialog } from "./repeat-dialog"
import { SelectionBar } from "./selection-bar"
import { RecordTimeline } from "./timeline"
import { useCollectionView } from "./use-collection-view"
import { RecordTable } from "./views"
import { openCommandPalette, useAppCommands } from "@/components/workspace/app-commands"
import { SidePanel } from "@/components/workspace/split-view"
import { useChatSocket } from "@/components/chat/use-chat-socket"
import { appOn } from "@/config/modules"
import { EmptyState } from "@/components/app/empty-state"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ActionMenuButton } from "@/components/workspace/action-menu"
import { AppFrame } from "@/components/workspace/app-frame"
import { ListSearch } from "@/components/workspace/list-pane"
import { Rail, RailAction, RailGroup, RailItem, RailList, RailSection, RailSectionButton } from "@/components/workspace/rail"
import { isTyping, Kbd, shortcutsPaused, useAppLayout, WORKSPACE_COLORS } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import { csvToRows, inferFields, IMPORT_CHUNK, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "@/lib/collections/csv"
import { parseCsv } from "@/lib/csv"
import { COLLECTION_TEMPLATES, defaultValues, FIELD_STYLES, FIELD_TYPES, fieldStyle, hasDefault, isClosed, priorityFieldOf, statusFieldOf, TEMPLATE_IDS, type CollectionField, type FieldStyle, type FieldType, type FieldValue, type TemplateId } from "@/lib/collections/fields"
import { formatId } from "@/lib/collections/ids"
import { cycleDaysLeft, cycleOf, cycleRange, today, type RecordTemplate } from "@/lib/collections/settings"
import { compareRecords, dateFields, groupFields, matchesView, type Layout } from "@/lib/collections/view-config"
import { appLocale, msg, t, tp } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { navigatePanel, replaceUrl } from "@/lib/panel-history"
import type { SavedView } from "@/lib/server/collection-views"
import type { Collection, CollectionRecord } from "@/lib/server/collections"

export interface CollectionsAppProps {
  collections: Collection[]
  collectionId: string | null
  records: CollectionRecord[]
  hasMore: boolean
  /** The open collection's saved views (personal and team). */
  views: SavedView[]
  people: Person[]
  canManage: boolean
  /** The signed-in person, for the account menu at the bottom of the rail. */
  account: MailUser
  /** The viewer, for fields defaulting to "me". */
  userId: string
}

const TYPE_LABELS: Record<FieldType, string> = { text: msg("Text"), number: msg("Number"), date: msg("Date"), select: msg("Choice"), multiselect: msg("Labels"), checkbox: msg("Checkbox"), person: msg("Person"), url: msg("Link"), email: msg("E-mail"), relation: msg("Record in…"), file: msg("File") }
const STYLE_LABELS: Record<FieldStyle, string> = { plain: msg("Chips"), status: msg("Status"), priority: msg("Priority") }
const LAYOUT_TABS: { id: Layout; label: string; icon: typeof List }[] = [
  { id: "list", label: msg("List"), icon: List },
  { id: "table", label: msg("Table"), icon: Table2 },
  { id: "board", label: msg("Board"), icon: LayoutGrid },
  { id: "timeline", label: msg("Timeline"), icon: GanttChart },
  { id: "calendar", label: msg("Calendar"), icon: CalendarDays },
]
/** What the main area shows: every record, those waiting in triage, the trash, or one cycle. */
type Scope = "all" | "triage" | "trash" | `cycle:${number}`
const scopeFromUrl = (): Scope => {
  const s = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("scope")
  return s === "triage" || s === "trash" || /^cycle:\d+$/.test(s ?? "") ? (s as Scope) : "all"
}
const collectionColor = (i: number) => WORKSPACE_COLORS[i % WORKSPACE_COLORS.length]!

/** A CSV file as rows, or null (with a toast) when it's too big or empty. */
async function readTable(file: File) {
  if (file.size > IMPORT_MAX_BYTES) return void toast.error(t("The file is over 2 MB.")), null
  const table = parseCsv(await file.text(), IMPORT_MAX_ROWS + 2)
  if (table.length < 2) return void toast.error(t("No rows in this file.")), null
  if (table.length > IMPORT_MAX_ROWS + 1) return void toast.error(t("Up to {n} rows at a time.", { n: IMPORT_MAX_ROWS })), null
  return table
}

/**
 * Sends a spreadsheet's rows to a collection, IMPORT_CHUNK at a time (columns matched to fields by name). Returns the
 * count and a function showing one summary toast (Ding shows a single pill, so a second toast would replace the first).
 */
async function importRows(collection: { id: string; fields: CollectionField[] }, table: string[][]) {
  const { rows, unknown } = csvToRows(collection.fields, table)
  let created = 0
  const failed: string[] = []
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const res = await api<{ created: number; failed: { row: number; error: string }[] }>("POST", `/api/app/collections/${collection.id}/import`, { rows: rows.slice(i, i + IMPORT_CHUNK) })
    created += res.created
    failed.push(...res.failed.map((f) => `${rows[i + f.row]!.title}: ${f.error}`))
  }
  const text = [
    tp(created, { one: "Imported {n} record.", other: "Imported {n} records." }),
    failed.length ? `${tp(failed.length, { one: "{n} row skipped", other: "{n} rows skipped" })}: ${failed.slice(0, 2).join("; ")}.` : "",
    unknown.length ? t("Left out columns: {columns}.", { columns: unknown.join(", ") }) : "",
  ].filter(Boolean).join(" ")
  return { created, summary: () => (failed.length || !created ? toast.error(text) : toast.success(text)) }
}

function SharingIcon({ sharing, className }: { sharing: Collection["sharing"]; className?: string }) {
  const Icon = sharing === "private" ? Lock : sharing === "people" ? Users : Globe
  return <Icon className={className} aria-label={sharing === "private" ? t("Only you") : sharing === "people" ? t("Chosen people") : t("Everyone")} />
}

/** Who can open the collection, at a glance: the people's faces, or a lock, or a globe. Opens the share dialog. */
function SharingButton({ collection, people, onClick }: { collection: Collection; people: Person[]; onClick: () => void }) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const faces = collection.sharing === "people" ? [collection.ownerId, ...collection.people.map((p) => p.userId)].filter((id): id is string => !!id) : []
  const label =
    collection.sharing === "private" ? t("Only you")
    : collection.sharing === "team" ? (collection.teamRole === "edit" ? t("Everyone can edit") : t("Everyone can view"))
    : tp(faces.length, { one: "{n} person", other: "{n} people" })
  return (
    <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-full px-2.5 text-xs" onClick={onClick} title={t("Share")}>
      {faces.length ? (
        <span className="flex -space-x-1.5">
          {faces.slice(0, 3).map((id) => <UserAvatar key={id} seed={byId.get(id)?.email ?? id} size={18} className="ring-background ring-2" />)}
        </span>
      ) : (
        <SharingIcon sharing={collection.sharing} className="size-3.5" />
      )}
      {label}
    </Button>
  )
}

export function CollectionsApp(props: CollectionsAppProps) {
  const { people, canManage } = props
  // Local so sharing changes show at once; a navigation brings fresh props.
  const [collections, setCollections] = React.useState(props.collections)
  React.useEffect(() => setCollections(props.collections), [props.collections])
  const current = collections.find((c) => c.id === props.collectionId) ?? null
  /** Viewers read; editors change records; managers also change fields and sharing. */
  const canEdit = !!current && current.role !== "view"
  /** Viewers of a collection with triage send requests there. */
  const canRequest = !!current && !canEdit && !!current.settings.triage
  const [sharing, setSharing] = React.useState(false)
  const [automations, setAutomations] = React.useState(false)
  const [records, setRecords] = React.useState(props.records)
  const [query, setQuery] = React.useState("")
  const viewState = useCollectionView(current, props.views)
  const { config, setConfig } = viewState
  const groupable = current ? groupFields(current.fields) : []
  const layout: Layout = config.layout
  const board = layout === "board" && !!config.group
  const filtering = config.filters.length > 0 || !config.closed
  const [scope, setScopeState] = React.useState<Scope>(scopeFromUrl)
  /** The open collection folded up in the rail (its chevron). */
  const [railCollapsed, setRailCollapsed] = React.useState(false)
  React.useEffect(() => setScopeState(scopeFromUrl()), [current?.id])
  const setScope = (next: Scope) => {
    setScopeState(next)
    setSelection(new Set())
    const url = new URL(location.href)
    if (next === "all") url.searchParams.delete("scope")
    else url.searchParams.set("scope", next)
    replaceUrl(url)
  }
  const cycles = current?.settings.cycles ?? null
  const day = today()
  const currentCycle = cycles ? cycleOf(cycles, day) : 0
  const cycleOptions: CycleOption[] = cycles
    ? [currentCycle, currentCycle + 1, currentCycle + 2].filter((n) => n > 0).map((n, i) => ({ n, label: `${t("Cycle {n}", { n })}${i === 0 ? ` · ${t("current")}` : i === 1 ? ` · ${t("next")}` : ""}` }))
    : []
  /** Records moved or edited since the filters changed stay visible until they change again. */
  const [pinned, setPinned] = React.useState<Set<string>>(new Set())
  React.useEffect(() => setPinned(new Set()), [current?.id])
  const [selection, setSelection] = React.useState<Set<string>>(new Set())
  React.useEffect(() => setSelection(new Set()), [current?.id, config.layout])
  const [picker, setPicker] = React.useState<PickerRequest | null>(null)
  const [savingView, setSavingView] = React.useState(false)
  const [full, setFull] = React.useState(false)
  const boardRef = React.useRef<BoardHandle>(null)
  const [open, setOpen] = React.useState<PanelRecord | null>(null)
  const openId = open && !("new" in open) ? open.id : null
  const [peek, setPeek] = React.useState<CollectionRecord | null>(null)
  const [parentFor, setParentFor] = React.useState<{ record: CollectionRecord; rect: DOMRect } | null>(null)
  const [repeatFor, setRepeatFor] = React.useState<CollectionRecord | null>(null)
  const [collectionDialog, setCollectionDialog] = React.useState<"new" | "edit" | null>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [importing, setImporting] = React.useState(false)
  const { ref: frameRef, desktop } = useAppLayout()
  const newRecord = (values: Record<string, FieldValue> = {}, from?: RecordTemplate) => {
    const given = { ...(from?.values ?? {}), ...values }
    // The fields' defaults show (and can be changed) before "Create"; "sv-SE" = the local day as YYYY-MM-DD.
    const defaults = current ? defaultValues(current.fields, given, { userId: props.userId, today: new Date().toLocaleDateString("sv-SE") }) : {}
    setOpen({ new: true, values: { ...defaults, ...given }, title: from?.title, description: from?.description ?? null })
  }
  const index = useRecordIndex(records)
  const meta = React.useMemo(() => collections.map((c) => ({ id: c.id, name: c.name, prefix: c.prefix })), [collections])

  const idOf = React.useCallback((r: CollectionRecord) => (current ? formatId(current.prefix, r.number) : null), [current?.prefix])

  // ---- Triage and trash: their own lists from the server ----
  const [scoped, setScoped] = React.useState<CollectionRecord[] | null>(null)
  const loadScoped = React.useCallback(() => {
    if (!current || (scope !== "triage" && scope !== "trash")) return setScoped(null)
    api<{ records: CollectionRecord[] }>("GET", `/api/app/collections/${current.id}/records?limit=500&scope=${scope}`).then((r) => setScoped(r.records), (e: Error) => toast.error(e.message))
  }, [current?.id, scope])
  React.useEffect(() => loadScoped(), [loadScoped])
  const [triageCount, setTriageCount] = React.useState(0)
  React.useEffect(() => {
    if (!current?.settings.triage) return setTriageCount(0)
    api<{ records: CollectionRecord[] }>("GET", `/api/app/collections/${current.id}/records?limit=200&scope=triage`).then((r) => setTriageCount(r.records.length), () => {})
  }, [current?.id, current?.settings.triage, scoped])

  // Up to 500 records are loaded: search and filter them here at once; a bigger collection asks the server too.
  const [found, setFound] = React.useState<CollectionRecord[] | null>(null)
  React.useEffect(() => {
    const q = query.trim()
    if (!props.hasMore || (!q && !filtering) || !current || scope === "triage" || scope === "trash") return setFound(null)
    const timer = setTimeout(() => {
      const view = filtering ? `&view=${encodeURIComponent(JSON.stringify({ filters: config.filters, closed: config.closed }))}` : ""
      api<{ records: CollectionRecord[] }>("GET", `/api/app/collections/${current.id}/records?limit=500${q ? `&q=${encodeURIComponent(q)}` : ""}${view}`).then((r) => setFound(r.records), (e) => toast.error((e as Error).message))
    }, 250)
    return () => clearTimeout(timer)
  }, [query, props.hasMore, current?.id, filtering, config.filters, config.closed, scope])
  const base = scope === "triage" || scope === "trash" ? scoped ?? [] : records
  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = found && scope === "all" ? found : base
    if (scope.startsWith("cycle:")) list = list.filter((r) => r.cycle === Number(scope.slice(6)))
    if (q && !found) list = list.filter((r) => r.title.toLowerCase().includes(q) || idOf(r)?.toLowerCase() === q || Object.values(r.values).some((v) => String(v).toLowerCase().includes(q)))
    if (!current || !filtering || scope === "trash") return list
    return list.filter((r) => pinned.has(r.id) || matchesView(current.fields, config, r.values, day))
  }, [base, query, found, scope, filtering, config, pinned, idOf, current, day])

  // A mention's link (/app/open/record/<id>) lands here with ?record=: open it, loaded or not (or in the trash).
  React.useEffect(() => {
    const id = new URLSearchParams(location.search).get("record")
    if (!id || !current) return
    const url = new URL(location.href)
    url.searchParams.delete("record")
    replaceUrl(url)
    openById(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival
  }, [current?.id])
  function openById(id: string, collectionId = current?.id) {
    if (!current) return
    if (collectionId !== current.id) return void navigatePanel(`/app/open/record/${id}`)
    const loaded = records.find((r) => r.id === id) ?? scoped?.find((r) => r.id === id)
    if (loaded) return setOpen(loaded)
    api<CollectionRecord>("GET", `/api/app/collections/${current.id}/records/${id}?deleted=1`).then(setOpen, () => toast.error(t("This record was deleted or moved.")))
  }

  const path = current ? `/api/app/collections/${current.id}/records` : ""
  const keep = (saved: CollectionRecord) => {
    // A saved record doesn't carry its links' kinds or blockers (lists do): keep the card's.
    const merged = (r: CollectionRecord) => ({ ...saved, linkKinds: saved.linkKinds ?? r.linkKinds, linkStates: saved.linkStates ?? r.linkStates, blockedBy: saved.blockedBy ?? r.blockedBy })
    if (!saved.triage && !saved.deletedAt) setRecords((list) => (list.some((r) => r.id === saved.id) ? list.map((r) => (r.id === saved.id ? merged(r) : r)) : [saved, ...list]))
    setScoped((list) => list && list.map((r) => (r.id === saved.id ? merged(r) : r)).filter((r) => (scope === "triage" ? r.triage : true)))
    setOpen((o) => (o && !("new" in o) && o.id === saved.id ? saved : o))
    forgetRecordRefs([saved.id])
    return saved
  }

  // ---- Undo (⌘Z, toasts): the last changes, each with a way back ----
  const history = React.useRef<{ label: string; run: () => Promise<unknown> }[]>([])
  const remember = (label: string, run: () => Promise<unknown>) => {
    history.current.push({ label, run })
    if (history.current.length > 50) history.current.shift()
  }
  async function undo() {
    const last = history.current.pop()
    if (!last) return void toast.info(t("Nothing to undo."))
    try {
      await last.run()
      toast.success(t("Undone: {what}", { what: last.label }))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  /** The values a record had for the keys a patch changes, to put back. */
  const before = (r: CollectionRecord, values: Record<string, unknown>) => Object.fromEntries(Object.keys(values).map((k) => [k, r.values[k] ?? null])) as Record<string, FieldValue | null>

  async function createRecord(input: { title: string; values: Record<string, FieldValue | null>; parentId?: string | null; description?: unknown; cycle?: number }) {
    const saved = await api<CollectionRecord>("POST", path, input)
    if (saved.triage) {
      toast.success(t("Sent to triage. Someone will pick it up."))
      setOpen(null)
      return saved
    }
    keep(saved)
    if (!input.parentId) setOpen(saved)
    remember(t("create {title}", { title: saved.title }), () => trash([saved], false))
    return saved
  }
  const patchRecord = async (id: string, patch: { title?: string; values?: Record<string, FieldValue | null>; position?: number; description?: unknown; parentId?: string | null; cycle?: number | null; triage?: false }) => {
    const was = records.find((r) => r.id === id) ?? (open && !("new" in open) && open.id === id ? open : undefined)
    setPinned((p) => new Set(p).add(id))
    const saved = keep(await api<CollectionRecord>("PATCH", `${path}/${id}`, patch))
    if (was && (patch.values || patch.title !== undefined || patch.cycle !== undefined || patch.parentId !== undefined)) {
      const back = { ...(patch.values ? { values: before(was, patch.values) } : {}), ...(patch.title !== undefined ? { title: was.title } : {}), ...(patch.cycle !== undefined ? { cycle: was.cycle } : {}), ...(patch.parentId !== undefined ? { parentId: was.parentId } : {}) }
      remember(t("change {title}", { title: was.title }), () => api<CollectionRecord>("PATCH", `${path}/${id}`, back).then(keep))
    }
    return saved
  }
  /** Records gone (ours or someone else's): out of the list, server search results, selection and panel. */
  const drop = (ids: Iterable<string>, closed?: () => void) => {
    const gone = new Set(ids)
    setRecords((list) => list.filter((r) => !gone.has(r.id)))
    setFound((list) => list && list.filter((r) => !gone.has(r.id)))
    setScoped((list) => list && list.filter((r) => !gone.has(r.id)))
    setSelection((sel) => new Set([...sel].filter((id) => !gone.has(id))))
    setOpen((o) => (o && !("new" in o) && gone.has(o.id) ? (closed?.(), null) : o))
  }
  /** To the trash (with Undo in the toast and on ⌘Z), or back out of it. */
  async function trash(targets: CollectionRecord[], announce = true) {
    if (!targets.length) return
    const ids = targets.map((r) => r.id)
    drop(ids)
    try {
      await track(ids, () => api("POST", `${path}/batch`, { ids, delete: true }))
    } catch (e) {
      setRecords((list) => [...targets.filter((r) => !list.some((x) => x.id === r.id)), ...list])
      return void toast.error((e as Error).message)
    }
    const restore = () => restoreRecords(targets)
    remember(t("delete"), restore)
    if (announce)
      toast.success(targets.length === 1 ? t("{title} moved to the trash.", { title: targets[0]!.title }) : tp(targets.length, { one: "{n} record moved to the trash.", other: "{n} records moved to the trash." }), {
        action: { label: t("Undo"), onClick: () => (void restore().then(() => history.current.pop()), { type: "success", title: t("Restored."), duration: 2000 }) },
      })
  }
  async function restoreRecords(targets: CollectionRecord[]) {
    const res = await api<{ records: CollectionRecord[] }>("POST", `${path}/batch`, { ids: targets.map((r) => r.id), restore: true })
    for (const r of res.records) keep(r)
    drop(res.records.filter(() => scope === "trash").map((r) => r.id))
  }
  async function purge(targets: CollectionRecord[]) {
    try {
      await api("POST", `${path}/batch`, { ids: targets.map((r) => r.id), purge: true })
      drop(targets.map((r) => r.id))
      toast.success(tp(targets.length, { one: "{n} record deleted for good.", other: "{n} records deleted for good." }))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  async function accept(targets: CollectionRecord[]) {
    try {
      const res = await api<{ records: CollectionRecord[] }>("POST", `${path}/batch`, { ids: targets.map((r) => r.id), accept: true })
      drop(targets.map((r) => r.id))
      for (const r of res.records) keep(r)
      toast.success(tp(targets.length, { one: "Accepted {n} record.", other: "Accepted {n} records." }))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  async function markDuplicate(r: CollectionRecord, of: string) {
    try {
      await api("POST", `${path}/${r.id}/related`, { to: of, kind: "duplicate" })
      await trash([r], false)
      toast.success(t("Marked as a duplicate and moved to the trash."))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // ---- Live: other people's changes (ChatRoom events from lib/server/collections.ts `publishRecords`) ----
  /** Records with a change of ours in flight: a live refetch mustn't put their old values back. */
  const inFlight = React.useRef(new Set<string>())
  const track = async <T,>(ids: string[], work: () => Promise<T>) => {
    for (const id of ids) inFlight.current.add(id)
    try {
      return await work()
    } finally {
      for (const id of ids) inFlight.current.delete(id)
    }
  }
  const merge = (fresh: CollectionRecord[]) => {
    const ok = fresh.filter((r) => !inFlight.current.has(r.id))
    if (!ok.length) return
    const byId = new Map(ok.map((r) => [r.id, r]))
    setRecords((list) => [...ok.filter((r) => !list.some((x) => x.id === r.id)), ...list.map((r) => byId.get(r.id) ?? r)])
    setOpen((o) => (o && !("new" in o) && byId.has(o.id) ? byId.get(o.id)! : o))
    forgetRecordRefs(ok.map((r) => r.id))
  }
  const reloadAll = React.useCallback(() => {
    if (!current) return
    api<{ records: CollectionRecord[] }>("GET", `/api/app/collections/${current.id}/records?limit=500`).then(
      (r) => setRecords((list) => r.records.map((x) => (inFlight.current.has(x.id) ? list.find((y) => y.id === x.id) ?? x : x))),
      () => {},
    )
    loadScoped()
  }, [current?.id, loadScoped])
  const live = appOn("chat")
  useChatSocket(
    (e) => {
      if (e.type !== "collection" || e.collectionId !== current?.id) return
      if (e.reload) return reloadAll()
      if (e.deleted) return drop(e.recordIds, () => toast.info(t("This record was moved to the trash.")))
      const ids = e.recordIds.filter((id) => !inFlight.current.has(id))
      if (ids.length) api<{ records: CollectionRecord[] }>("GET", `/api/app/collections/${current.id}/records?limit=200&ids=${ids.join(",")}`).then((r) => merge(r.records), () => {})
      if (current.settings.triage) loadScoped()
    },
    reloadAll,
    live && !!current,
  )
  // shortcut: with chat turned off there's no socket; the board reloads every 30 s while visible. A collections socket would end this.
  React.useEffect(() => {
    if (live || !current) return
    const timer = setInterval(() => document.visibilityState === "visible" && reloadAll(), 30_000)
    return () => clearInterval(timer)
  }, [live, current?.id, reloadAll])

  /** Several records at once (the selection, a dragged group): shown at once, rolled back if the server refuses. */
  async function batch(targets: CollectionRecord[], body: { values?: Record<string, FieldValue | null>; positions?: Record<string, number>; cycle?: number | null }) {
    const was = records
    const ids = new Set(targets.map((r) => r.id))
    setRecords((list) =>
      list.map((r) => {
        if (!ids.has(r.id)) return r
        const values = { ...r.values }
        for (const [k, v] of Object.entries(body.values ?? {})) if (v === null) delete values[k]; else values[k] = v
        return { ...r, values, position: body.positions?.[r.id] ?? r.position, cycle: body.cycle !== undefined ? body.cycle : r.cycle }
      }),
    )
    setPinned((p) => new Set([...p, ...ids]))
    try {
      const res = await track([...ids], () => api<{ records: CollectionRecord[] }>("POST", `${path}/batch`, { ids: [...ids], ...body }))
      for (const r of res.records) keep(r)
      remember(tp(targets.length, { one: "change {n} record", other: "change {n} records" }), () =>
        Promise.all(targets.map((r) => api<CollectionRecord>("PATCH", `${path}/${r.id}`, { ...(body.values ? { values: before(r, body.values) } : {}), ...(body.positions ? { position: r.position } : {}), ...(body.cycle !== undefined ? { cycle: r.cycle } : {}) }).then(keep))),
      )
    } catch (e) {
      setRecords(was)
      toast.error((e as Error).message)
    }
  }
  const patchMany = (targets: CollectionRecord[], values: Record<string, FieldValue | null>) =>
    targets.length === 1 ? void quickPatch(targets[0]!, values) : void batch(targets, { values })
  /** A label on every target, or off all of them when they all have it. */
  function toggleLabel(targets: CollectionRecord[], field: CollectionField, label: string) {
    const list = (r: CollectionRecord) => (Array.isArray(r.values[field.id]) ? (r.values[field.id] as string[]) : [])
    const off = targets.every((r) => list(r).includes(label))
    for (const r of targets) {
      const next = (field.options ?? []).filter((o) => (o === label ? !off : list(r).includes(o)))
      void quickPatch(r, { [field.id]: next.length ? next : null })
    }
  }
  const setCycle = (targets: CollectionRecord[], n: number | null) => (targets.length === 1 ? void patchRecord(targets[0]!.id, { cycle: n }).catch((e: Error) => toast.error(e.message)) : void batch(targets, { cycle: n }))
  function moveCards(moves: BoardMove[]) {
    if (moves.length === 1) return void quickPatch(moves[0]!.record, moves[0]!.values, moves[0]!.position)
    // One batch per set of new values: the dragged cards change fields, their renumbered neighbours only move.
    const groups = Map.groupBy(moves, (m) => JSON.stringify(m.values))
    for (const group of groups.values()) {
      const values = group[0]!.values
      const positions = Object.fromEntries(group.filter((m) => m.position !== undefined).map((m) => [m.record.id, m.position!]))
      void batch(group.map((m) => m.record), { ...(Object.keys(values).length ? { values } : {}), positions })
    }
  }
  async function quickCreate(title: string, values: Record<string, FieldValue>) {
    try {
      const saved = keep(await api<CollectionRecord>("POST", path, { title, values, ...(scope.startsWith("cycle:") ? { cycle: Number(scope.slice(6)) } : {}) }))
      remember(t("create {title}", { title }), () => trash([saved], false))
      return saved
    } catch (e) {
      toast.error((e as Error).message)
      throw e
    }
  }
  /** "Save as template": its title, values and description, named by the manager. */
  async function saveTemplate(r: CollectionRecord) {
    if (!current) return
    const name = prompt(t("Template name"), r.title)?.trim()
    if (!name) return
    try {
      const full = await api<CollectionRecord>("GET", `${path}/${r.id}`)
      const templates = [...(current.settings.templates ?? []), { name, title: r.title, values: r.values, description: (full.description as unknown[] | null) ?? null }]
      const saved = await api<Collection>("PATCH", `/api/app/collections/${current.id}`, { settings: { templates } })
      setCollections((list) => list.map((c) => (c.id === saved.id ? saved : c)))
      toast.success(t("Template saved. Pick it under New."))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  /** A card's (or row's) actions: on the whole selection when the record is in it. */
  const actionsFor = (r: CollectionRecord) => {
    const targets = selection.has(r.id) ? shown.filter((x) => selection.has(x.id)) : [r]
    if (scope === "trash")
      return [
        { label: t("Restore"), icon: Upload, onSelect: () => void restoreRecords(targets).catch((e: Error) => toast.error(e.message)) },
        { label: t("Delete for good"), icon: Trash2, destructive: true, confirm: { title: t("Delete for good?"), description: t("Its comments, links and history go with it. This can't be undone."), confirmLabel: t("Delete") }, onSelect: () => void purge(targets) },
      ]
    const own = recordActions({
      targets, fields: current?.fields ?? [], people, canEdit, idOf, onOpen: setOpen, onPeek: setPeek, onPatch: patchMany, onToggleLabel: toggleLabel, onDelete: (x) => trash(x),
      cycles: cycleOptions, onCycle: setCycle,
      onParent: (x) => setParentFor({ record: x, rect: document.querySelector(`[data-card-id="${CSS.escape(x.id)}"]`)?.getBoundingClientRect() ?? new DOMRect(innerWidth / 2 - 160, innerHeight / 3, 0, 0) }),
      onRepeat: setRepeatFor,
      onTemplate: current?.canManage ? (x) => void saveTemplate(x) : undefined,
    })
    return scope === "triage" ? [{ label: t("Accept"), icon: Inbox, onSelect: () => void accept(targets) }, { separator: true as const }, ...own] : own
  }

  /** What S / A / L / P / ⌫ act on: the selection, else the focused or hovered card, else the open record. */
  function shortcutTargets(): CollectionRecord[] {
    if (selection.size) return shown.filter((r) => selection.has(r.id))
    const el = (document.activeElement?.closest("[data-card-id]") ?? document.querySelector("[data-card-id]:hover")) as HTMLElement | null
    const id = el?.dataset.cardId ?? openId
    const r = shown.find((x) => x.id === id) ?? (open && !("new" in open) && open.id === id ? open : undefined)
    return r ? [r] : []
  }
  function openPicker(field: CollectionField | undefined, targets: CollectionRecord[], anchor?: DOMRect) {
    if (!field || !targets.length) return
    const el = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(targets[0]!.id)}"]`)
    const rect = anchor ?? el?.getBoundingClientRect() ?? new DOMRect(innerWidth / 2 - 120, innerHeight / 3, 0, 0)
    if (field.type === "multiselect") {
      const has = (field.options ?? []).filter((o) => targets.every((r) => Array.isArray(r.values[field.id]) && (r.values[field.id] as string[]).includes(o)))
      return setPicker({ field, anchor: rect, count: targets.length, current: has, onPick: (v) => {
        if (v === null) return patchMany(targets, { [field.id]: null })
        toggleLabel(targets, field, String(v))
        // The list stays open: show the new ticks.
        setPicker((p) => p && { ...p, current: Array.isArray(p.current) ? (p.current.includes(String(v)) ? p.current.filter((x) => x !== v) : [...p.current, String(v)]) : [String(v)] })
      } })
    }
    const values = new Set(targets.map((r) => JSON.stringify(r.values[field.id])))
    setPicker({ field, anchor: rect, count: targets.length, current: values.size === 1 ? targets[0]!.values[field.id] : undefined, onPick: (v) => patchMany(targets, { [field.id]: v }) })
  }
  const statusField = current ? statusFieldOf(current.fields) ?? current.fields.find((f) => f.id === config.group) : undefined
  const personField = current?.fields.find((f) => f.type === "person")
  const priorityField = current ? priorityFieldOf(current.fields) : undefined
  const labelField = current?.fields.find((f) => f.type === "multiselect") ?? current?.fields.find((f) => f.type === "select" && f.id !== statusField?.id && f.id !== priorityField?.id)
  const ordered = () => [...shown].sort(compareRecords(config.order, config.dir, current?.fields ?? [], people, { order: config.then, dir: config.thenDir }))

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current || picker) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && !isTyping(e.target) && !document.querySelector("[role=dialog][data-state=open], [role=menu]")) {
        if (e.key === "a" && layout !== "table") {
          e.preventDefault()
          return setSelection(new Set(shown.map((r) => r.id)))
        }
        if (e.key.toLowerCase() === "z" && !e.shiftKey && canEdit) return void (e.preventDefault(), undo())
        if (e.shiftKey && e.key.toLowerCase() === "c") {
          const [r] = shortcutTargets()
          if (r) (e.preventDefault(), void copyText(recordLink(r), t("Link copied.")))
          return
        }
        if (e.key === "." || e.key === ">") {
          const [r] = shortcutTargets()
          if (!r) return
          e.preventDefault()
          return void (e.shiftKey ? copyText(branchName(idOf(r), r.title), t("Branch name copied.")) : copyText(idOf(r) ?? r.title, t("ID copied.")))
        }
      }
      if (shortcutsPaused(e)) return
      if (e.key === "Escape") {
        if (selection.size) return void setSelection(new Set())
        if (open) return void setOpen(null)
        return
      }
      if (e.key === "/") return void (e.preventDefault(), searchRef.current?.focus())
      if (e.key === " " && !e.defaultPrevented) {
        const el = (document.activeElement?.closest("[data-card-id]") ?? document.querySelector("[data-card-id]:hover")) as HTMLElement | null
        const r = shown.find((x) => x.id === el?.dataset.cardId)
        if (r) return void (e.preventDefault(), setPeek((p) => (p?.id === r.id ? null : r)))
      }
      if ((e.key === "j" || e.key === "k") && openId) {
        // The next or previous record in the list as shown.
        const order = ordered()
        const i = order.findIndex((r) => r.id === openId)
        const next = order[i + (e.key === "j" ? 1 : -1)]
        if (next) (e.preventDefault(), setOpen(next))
        return
      }
      if (!canEdit) return
      if (e.key === "c" && scope !== "trash") {
        e.preventDefault()
        return board ? boardRef.current?.compose() : newRecord()
      }
      const field = e.key === "s" ? statusField : e.key === "a" ? personField : e.key === "l" ? labelField : e.key === "p" ? priorityField : undefined
      if (field) return void (e.preventDefault(), openPicker(field, shortcutTargets()))
      if (e.key === "Backspace" || e.key === "Delete") {
        const targets = shortcutTargets()
        if (targets.length && scope !== "trash") (e.preventDefault(), void trash(targets))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  /** In place (a checkbox in the table, a card dropped on the board): shown at once, rolled back if the server refuses. */
  async function quickPatch(record: CollectionRecord, values: Record<string, FieldValue | null>, position?: number) {
    const was = records
    const next = { ...record.values }
    for (const [k, v] of Object.entries(values)) if (v === null) delete next[k]; else next[k] = v
    setRecords((list) => list.map((r) => (r.id === record.id ? { ...r, values: next, position: position ?? r.position } : r)))
    setPinned((p) => new Set(p).add(record.id))
    try {
      await track([record.id], () => patchRecord(record.id, { values, position }))
    } catch (e) {
      setRecords(was)
      toast.error((e as Error).message)
    }
  }

  /** A spreadsheet in: columns matched to fields by name, sent IMPORT_CHUNK rows at a time, then the list reloads. */
  async function importFile(file: File) {
    const table = await readTable(file)
    if (!table) return
    setImporting(true)
    try {
      const { created, summary } = await importRows(current!, table)
      if (created) setRecords((await api<{ records: CollectionRecord[] }>("GET", `${path}?limit=500`)).records)
      summary()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  // ---- ⌘K: records of this collection, and actions on the open, selected or hovered ones ----
  useAppCommands({
    placeholder: current ? t("Search {collection} or run a command…", { collection: current.name }) : undefined,
    groups: (q) => {
      if (!current) return []
      const query = q.trim().toLowerCase()
      const targets = shortcutTargets()
      const one = targets.length === 1 ? targets[0]! : null
      const recordItems = (query ? records.filter((r) => r.title.toLowerCase().includes(query) || idOf(r)?.toLowerCase().startsWith(query)) : []).slice(0, 8).map((r) => ({
        id: `rec:${r.id}`, label: r.title, description: idOf(r) ?? undefined, keywords: [idOf(r) ?? ""], icon: <Database />, alwaysShow: true, onSelect: () => setOpen(r),
      }))
      const on = targets.length ? (one ? one.title : tp(targets.length, { one: "{n} record", other: "{n} records" })) : null
      const fieldItems = on && canEdit
        ? [statusField, priorityField].filter((f): f is CollectionField => !!f).flatMap((f) => (f.options ?? []).map((o) => ({ id: `set:${f.id}:${o}`, label: `${f.name}: ${o}`, description: on, icon: React.createElement(FIELD_ICON[f.type]), onSelect: () => patchMany(targets, { [f.id]: o }) })))
        : []
      const me = people.find((p) => p.email === props.account.email)
      return [
        ...(recordItems.length ? [{ heading: current.name, items: recordItems }] : []),
        {
          heading: t("Records"),
          items: [
            ...(canEdit ? [{ id: "col-new", label: t("New record"), icon: <Plus />, shortcut: "C", onSelect: () => newRecord() }] : []),
            ...(on && canEdit && personField && me ? [{ id: "col-me", label: t("Assign to me"), description: on, icon: <Users />, onSelect: () => patchMany(targets, { [personField.id]: me.id }) }] : []),
            ...fieldItems,
            ...(on && canEdit && cycleOptions.length ? cycleOptions.map((c) => ({ id: `cyc:${c.n}`, label: t("Move to {cycle}", { cycle: c.label }), description: on, icon: <IterationCw />, onSelect: () => setCycle(targets, c.n) })) : []),
            ...(one ? [
              { id: "col-copy-id", label: t("Copy ID"), description: on!, icon: <Database />, shortcut: "⌘.", onSelect: () => void copyText(idOf(one) ?? one.title, t("ID copied.")) },
              { id: "col-copy-branch", label: t("Copy git branch name"), description: on!, icon: <Database />, shortcut: "⌘⇧.", onSelect: () => void copyText(branchName(idOf(one), one.title), t("Branch name copied.")) },
              { id: "col-copy-link", label: t("Copy link"), description: on!, icon: <Database />, shortcut: "⌘⇧C", onSelect: () => void copyText(recordLink(one), t("Link copied.")) },
            ] : []),
            ...(on && canEdit ? [{ id: "col-trash", label: t("Move to trash"), description: on, icon: <Trash2 />, onSelect: () => void trash(targets) }] : []),
            ...(canEdit ? [{ id: "col-undo", label: t("Undo"), icon: <Database />, shortcut: "⌘Z", onSelect: () => void undo() }] : []),
          ],
        },
        {
          heading: t("View"),
          items: [
            ...LAYOUT_TABS.filter((l) => layoutAvailable(l.id)).map((l) => ({ id: `lay:${l.id}`, label: t("Show as {layout}", { layout: t(l.label).toLowerCase() }), icon: React.createElement(l.icon), onSelect: () => (setConfig({ layout: l.id }), setScope(scope === "trash" || scope === "triage" ? "all" : scope)) })),
            { id: "col-closed", label: config.closed ? t("Hide completed") : t("Show completed"), icon: <Eye />, onSelect: () => setConfig({ closed: !config.closed }) },
            ...(cycles ? [{ id: "col-cycle", label: t("Current cycle"), icon: <IterationCw />, onSelect: () => setScope(`cycle:${currentCycle}`) }] : []),
            ...(current.settings.triage ? [{ id: "col-triage", label: t("Triage"), icon: <Inbox />, onSelect: () => setScope("triage") }] : []),
            { id: "col-trash-view", label: t("Trash"), icon: <Trash2 />, onSelect: () => setScope("trash") },
          ],
        },
      ]
    },
  })
  const layoutAvailable = (l: Layout) => (l === "board" ? groupable.length > 0 : l === "timeline" || l === "calendar" ? !!current && dateFields(current.fields).length > 0 : true)

  const scopeItem = (key: Scope, label: string, icon: LucideIcon, count?: number) => (
    <RailItem key={key} icon={icon} label={label} count={count} active={scope === key} onClick={() => setScope(scope === key ? "all" : key)} />
  )
  // Like Mail's mailboxes: the open collection unfolds into its records, triage, cycles, views and trash.
  const currentItems = (c: (typeof collections)[number]) => [
    <RailItem key="all" icon={List} label={t("All records")} count={records.length || undefined} active={scope === "all" && !viewState.active} onClick={() => (setScope("all"), viewState.select(null))} />,
    ...(c.settings.triage && (canEdit || triageCount) ? [scopeItem("triage", t("Triage"), Inbox, triageCount || undefined)] : []),
    ...(cycles && currentCycle > 0 ? [scopeItem(`cycle:${currentCycle}`, t("Current cycle"), IterationCw), scopeItem(`cycle:${currentCycle + 1}`, t("Next cycle"), IterationCw)] : []),
    ...viewState.views.map((v) => (
      <RailItem
        key={v.id}
        icon={v.team ? Users : Layers}
        label={v.name}
        title={v.team ? t("{name} (team view)", { name: v.name }) : v.name}
        active={viewState.active?.id === v.id}
        onClick={() => (setScope("all"), viewState.select(viewState.active?.id === v.id ? null : v.id))}
        actions={(v.team ? c.canManage : v.mine) ? [
          { label: t("Rename"), icon: Pencil, onSelect: () => { const name = prompt(t("New name"), v.name)?.trim(); if (name) void viewState.rename(v.id, name) } },
          { label: t("Copy link"), icon: Layers, onSelect: () => copyText(`${location.origin}/app/collections/${c.id}?v=${v.id}`, t("Link copied.")) },
          { separator: true },
          { label: t("Delete view"), icon: Trash2, destructive: true, confirm: { title: t("Delete this view?"), description: t("The records stay; only this way of showing them goes."), confirmLabel: t("Delete") }, onSelect: () => void viewState.remove(v.id) },
        ] : undefined}
      />
    )),
    ...(canEdit ? [scopeItem("trash", t("Trash"), Trash2)] : []),
  ]
  const rail = (
    <Rail
      label={t("Collections")}
      hint={current ? <><Kbd>C</Kbd> {t("New record")} <Kbd>/</Kbd> {t("Search")}</> : undefined}
      footer={<AccountMenu user={props.account} canManage={canManage} />}
    >
      {canEdit ? <RailAction icon={Plus} label={t("New record")} shortcut="C" onClick={() => newRecord()} />
        : canRequest ? <RailAction icon={Inbox} label={t("New request")} onClick={() => newRecord()} />
        : !current && canManage ? <RailAction icon={Plus} label={t("New collection")} onClick={() => setCollectionDialog("new")} /> : null}
      <RailSection
        title={t("Collections")}
        action={canManage ? <RailSectionButton label={t("New collection")} onClick={() => setCollectionDialog("new")}><Plus /></RailSectionButton> : undefined}
      >
        {collections.length ? (
          <RailList>
            {collections.map((c, i) => {
              const isCurrent = c.id === current?.id
              const open = isCurrent && !railCollapsed
              return (
                <RailGroup
                  key={c.id}
                  label={<span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{c.name}</span>{c.sharing !== "team" ? <SharingIcon sharing={c.sharing} className="text-muted-foreground size-3 shrink-0" /> : null}</span>}
                  title={c.name}
                  color={c.color || collectionColor(i)}
                  icon={c.icon ? <CollectionIcon icon={c.icon} color={c.color || collectionColor(i)} /> : undefined}
                  current={isCurrent}
                  open={open}
                  count={open ? undefined : isCurrent ? records.length : c.count}
                  onToggle={() => (isCurrent ? setRailCollapsed(!railCollapsed) : (setRailCollapsed(false), navigatePanel(`/app/collections/${c.id}`)))}
                  onClick={() => (isCurrent ? (setRailCollapsed(false), setScope("all"), viewState.select(null)) : navigatePanel(`/app/collections/${c.id}`))}
                  actions={c.canManage && isCurrent ? [{ label: t("Edit collection"), icon: Pencil, onSelect: () => setCollectionDialog("edit") }, { label: t("Share"), icon: Users, onSelect: () => setSharing(true) }, { label: t("Automations"), icon: Zap, onSelect: () => setAutomations(true) }] : undefined}
                >
                  {open ? currentItems(c) : null}
                </RailGroup>
              )
            })}
          </RailList>
        ) : (
          <p className="text-muted-foreground px-2 text-xs">
            {canManage ? t("No collections yet. Start one from a template or a spreadsheet.") : t("No collections yet. An owner or admin can add them.")}
          </p>
        )}
      </RailSection>
    </Rail>
  )

  const templates = current?.settings.templates ?? []
  const tab = "text-muted-foreground hover:text-foreground aria-selected:text-foreground relative flex h-10 items-center gap-1.5 px-2 text-[13px] font-medium after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full aria-selected:after:bg-foreground"
  const cycleNumber = scope.startsWith("cycle:") ? Number(scope.slice(6)) : 0
  const cycleDone = cycleNumber && current ? shown.filter((r) => isClosed(current.fields, r.values)).length : 0
  const header = current ? (
    <div className="shrink-0 border-b">
      <div className="flex min-h-14 flex-wrap items-center gap-2 px-4 pt-3 pb-1">
        {!desktop && collections.length > 1 ? (
          <Select value={current.id} onValueChange={(id) => navigatePanel(`/app/collections/${id}`)}>
            <SelectTrigger size="sm" className="max-w-56 font-semibold"><SelectValue /></SelectTrigger>
            <SelectContent>{collections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold tracking-tight">
            {current.icon ? <CollectionIcon icon={current.icon} color={current.color || collectionColor(collections.findIndex((c) => c.id === current.id))} className="size-5" /> : null}
            <span className="truncate">{current.name}</span>
          </h2>
        )}
        {scope !== "all" ? (
          <span className="bg-muted flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-medium">
            {scope === "trash" ? t("Trash") : scope === "triage" ? t("Triage") : t("Cycle {n}", { n: cycleNumber })}
            <button type="button" aria-label={t("Back to all records")} onClick={() => setScope("all")} className="hover:bg-foreground/10 grid size-4 place-items-center rounded-full"><X className="size-3" /></button>
          </span>
        ) : null}
        <span className="text-muted-foreground text-[13px] tabular-nums">{scope === "all" ? records.length : shown.length}</span>
        <div className="ml-auto flex items-center gap-1">
          {current.canManage ? <SharingButton collection={current} people={people} onClick={() => setSharing(true)} /> : current.role === "view" ? (
            <span className="text-muted-foreground bg-muted flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"><Eye className="size-3" />{t("View only")}</span>
          ) : null}
          <Button variant="ghost" size="icon-sm" aria-label={t("Commands (⌘K)")} title={t("Commands (⌘K)")} onClick={openCommandPalette}><Search /></Button>
          {current.canManage ? (
            <>
              <Button variant="ghost" size="icon-sm" aria-label={t("Automations")} title={t("Automations")} onClick={() => setAutomations(true)}><Zap /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={t("Edit collection")} title={t("Edit collection")} onClick={() => setCollectionDialog("edit")}><Settings2 /></Button>
            </>
          ) : null}
          <ActionMenuButton
            label={t("Import and export")}
            actions={[
              { label: t("Import CSV"), icon: Upload, disabled: importing || !canEdit, onSelect: () => fileRef.current?.click() },
              { label: t("Export CSV"), icon: Download, onSelect: () => void location.assign(`/api/app/collections/${current.id}/export`) },
            ]}
          />
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) void importFile(file)
          }} />
          {!desktop ? <AccountMenu user={props.account} canManage={canManage} compact /> : null}
        </div>
      </div>
      {cycleNumber && cycles ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 text-xs">
          <span>{(() => { const r = cycleRange(cycles, cycleNumber); return `${shortDay(r.start)} – ${shortDay(r.end)}` })()}</span>
          {cycleNumber === currentCycle ? <span>{tp(cycleDaysLeft(cycles, day), { one: "{n} day left", other: "{n} days left" })}</span> : null}
          <span className="flex items-center gap-2">
            <span className="bg-muted h-1.5 w-28 overflow-hidden rounded-full"><span className="bg-primary block h-full rounded-full" style={{ width: `${shown.length ? (cycleDone / shown.length) * 100 : 0}%` }} /></span>
            {t("{done} of {n} done", { done: cycleDone, n: shown.length })}
          </span>
        </div>
      ) : null}
      {scope === "trash" ? (
        <div className="text-muted-foreground flex items-center gap-3 px-4 pb-2 text-xs">
          {t("Records stay here for 30 days, then they're deleted for good.")}
          {shown.length && canEdit ? (
            <ConfirmButton title={t("Empty the trash?")} description={tp(shown.length, { one: "{n} record is deleted for good.", other: "{n} records are deleted for good." })} confirmLabel={t("Delete")} onConfirm={() => purge(shown)}>
              <button type="button" className="text-destructive hover:underline">{t("Empty trash")}</button>
            </ConfirmButton>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1 px-2.5">
        {scope === "trash" || scope === "triage" ? null : (
          <>
            <div role="tablist" aria-label={t("View")} className="flex items-center">
              {LAYOUT_TABS.filter((l) => layoutAvailable(l.id)).map((l) => {
                const Icon = l.icon
                return <button key={l.id} type="button" role="tab" aria-selected={layout === l.id} className={tab} onClick={() => setConfig({ layout: l.id })}><Icon className="size-3.5" /><span className="max-md:sr-only">{t(l.label)}</span></button>
              })}
            </div>
            <DisplayMenu
              config={config}
              fields={current.fields}
              onChange={setConfig}
              saved={viewState.active ? { name: viewState.active.name, canUpdate: viewState.active.team ? current.canManage : viewState.active.mine } : null}
              dirty={viewState.dirty}
              canSave
              onSave={() => setSavingView(true)}
              onUpdate={() => void viewState.update()}
              onReset={viewState.reset}
            />
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto py-1 max-sm:order-last max-sm:w-full">
              <FilterBar fields={current.fields} people={people} filters={config.filters} onChange={(filters) => (setConfig({ filters }), setPinned(new Set()))} />
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2 py-1.5">
          <div className="w-44 sm:w-56"><ListSearch ref={searchRef} value={query} onChange={setQuery} placeholder={t("Search")} /></div>
          {canEdit && scope !== "trash" ? (
            <div className="flex">
              <Button size="sm" className={cn("h-8", templates.length && "rounded-r-none")} onClick={() => newRecord()} disabled={importing}><Plus /> {t("New")}</Button>
              {templates.length ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-8 w-7 rounded-l-none border-l border-white/20 px-0" aria-label={t("New from a template")} title={t("New from a template")}><ChevronDown /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">{t("Templates")}</DropdownMenuLabel>
                    {templates.map((tpl) => <DropdownMenuItem key={tpl.id} onSelect={() => newRecord({}, tpl)}><Plus />{tpl.name}</DropdownMenuItem>)}
                    {current.canManage ? <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setCollectionDialog("edit")}><Settings2 />{t("Manage templates")}</DropdownMenuItem></> : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          ) : canRequest ? <Button size="sm" className="h-8" onClick={() => newRecord()}><Inbox /> {t("New request")}</Button> : null}
        </div>
      </div>
    </div>
  ) : null

  let body: React.ReactNode
  if (!current) {
    body = (
      <EmptyState
        variant="plain"
        icon={<Database />}
        title={t("No collections yet")}
        description={canManage ? t("Keep your own lists here: equipment, inventory, deals, tasks. Start from a template, a spreadsheet or your own fields.") : t("An owner or admin can add collections for the team.")}
        action={canManage ? <Button onClick={() => setCollectionDialog("new")}><Plus /> {t("New collection")}</Button> : undefined}
      />
    )
  } else if (scope === "trash" || scope === "triage") {
    body = !shown.length
      ? <EmptyState variant="plain" icon={scope === "trash" ? <Trash2 /> : <Inbox />} title={scope === "trash" ? t("The trash is empty") : t("Nothing waiting in triage")} description={scope === "triage" ? t("Requests from people who can only view this collection, API keys and AI apps wait here until someone accepts them.") : undefined} />
      : <RecordList collection={current} records={shown} index={index} config={{ ...config, group: null, order: "updated", dir: 1, then: null }} people={people} openId={openId} idOf={idOf} selection={selection} onSelection={setSelection} actions={actionsFor} onOpen={setOpen} />
  } else if (!shown.length && (query || filtering)) {
    body = <EmptyState variant="plain" icon={<SearchX />} title={t("Nothing matches")} description={t("Try another word.")} />
  } else if (!shown.length && !board) {
    body = <EmptyState variant="plain" icon={<Database />} title={cycleNumber ? t("Nothing planned in this cycle") : t("No records yet")} description={cycleNumber ? t("Move records here with the Cycle field or their … menu.") : canEdit ? t("Add the first one, or import a CSV from the … menu.") : undefined} action={canEdit && !cycleNumber ? <Button onClick={() => newRecord()}><Plus /> {t("New record")}</Button> : undefined} />
  } else if (board) {
    body = <Board ref={boardRef} config={config} collection={current} records={shown} index={index} people={people} openId={openId} idOf={idOf} selection={selection} onSelection={setSelection}
      actions={actionsFor} onOpen={setOpen} onConfig={setConfig} onMove={canEdit ? moveCards : undefined} onCreate={canEdit ? quickCreate : undefined} />
  } else if (layout === "timeline" && config.start) {
    body = <RecordTimeline collection={current} records={shown} config={config} people={people} openId={openId} idOf={idOf} onOpen={setOpen} actions={actionsFor} onPatch={canEdit ? (r, v) => void quickPatch(r, v) : undefined} />
  } else if (layout === "calendar" && config.start) {
    body = <RecordCalendar collection={current} records={shown} config={config} people={people} openId={openId} idOf={idOf} onOpen={setOpen} actions={actionsFor} onPatch={canEdit ? (r, v) => void quickPatch(r, v) : undefined} onNew={canEdit ? (v) => newRecord(v) : undefined} />
  } else if (layout === "table") {
    body = <RecordTable collection={current} records={shown} people={people} openId={openId} order={config.order} dir={config.dir} props={config.props} idOf={idOf} actions={actionsFor}
      onSort={(order, dir) => setConfig({ order, dir })} onOpen={setOpen} onNew={canEdit ? () => newRecord() : undefined} onPatch={canEdit ? (r, v) => void quickPatch(r, v) : undefined} />
  } else {
    body = <RecordList collection={current} records={shown} index={index} config={config} people={people} openId={openId} idOf={idOf} selection={selection} onSelection={setSelection}
      actions={actionsFor} onOpen={setOpen} onConfig={setConfig} onCreate={canEdit ? quickCreate : undefined} />
  }

  const openRecord = open && !("new" in open) ? open : null
  const panel = current && open ? (
    <RecordPanel
      key={"new" in open ? "new" : open.id}
      collection={current}
      record={open}
      people={people}
      readOnly={!canEdit && !("new" in open && canRequest)}
      full={full && desktop}
      onToggleFull={desktop ? () => setFull((f) => !f) : undefined}
      onClose={() => setOpen(null)}
      onCreate={(input) => createRecord(cycleNumber && !input.parentId ? { ...input, cycle: cycleNumber } : input)}
      onPatch={patchRecord}
      menu={openRecord ? actionsFor(openRecord) : []}
      cycles={cycleOptions}
      triageActions={openRecord?.triage && canEdit ? { accept: () => void accept([openRecord]), decline: () => void trash([openRecord]), duplicate: (of) => void markDuplicate(openRecord, of) } : undefined}
      trashActions={openRecord?.deletedAt && canEdit ? { restore: () => void restoreRecords([openRecord]).then(() => setOpen(null)).catch((e: Error) => toast.error(e.message)), purge: () => void purge([openRecord]) } : undefined}
      onOpenRecord={(id, collectionId) => openById(id, collectionId)}
      parentTitle={(id) => index.byId.get(id)?.title}
    />
  ) : null

  return (
    <CollectionsMeta.Provider value={meta}>
    <AppFrame ref={frameRef}>
      {desktop ? rail : null}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {header}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-auto">
          {body}
          <AnimatePresence>
            {selection.size && scope !== "trash" ? (
              <SelectionBar
                count={selection.size}
                fields={[...groupable, ...(current?.fields.filter((f) => f.type === "multiselect") ?? [])]}
                canEdit={canEdit}
                onField={(f, anchor) => openPicker(f, shown.filter((r) => selection.has(r.id)), anchor)}
                onDelete={() => void trash(shown.filter((r) => selection.has(r.id)))}
                onClear={() => setSelection(new Set())}
              />
            ) : null}
          </AnimatePresence>
        </div>
        {props.hasMore && scope === "all" ? <p className="text-muted-foreground border-t p-2 text-center text-xs">{t("Showing the 500 most recently changed records.")}</p> : null}
        {desktop && full && panel ? <div className="bg-background absolute inset-0 z-30">{panel}</div> : null}
      </div>
      {desktop ? <SidePanel open={!!panel && !full} width={440}>{full ? null : panel}</SidePanel> : panel ? <div className="bg-background fixed inset-0 z-40">{panel}</div> : null}
      <FieldPicker request={picker} people={people} onClose={() => setPicker(null)} />
      {current && peek ? <Peek collection={current} record={peek} people={people} idOf={idOf} onClose={() => setPeek(null)} onOpen={(r) => (setPeek(null), setOpen(r))} /> : null}
      {current && parentFor ? (
        <RecordPicker collectionId={current.id} exclude={[parentFor.record.id]} open onOpenChange={(o) => !o && setParentFor(null)} placeholder={t("Parent record…")}
          onPick={(p) => void patchRecord(parentFor.record.id, { parentId: p.id }).then(() => toast.success(t("{title} is now a sub-record of {parent}.", { title: parentFor.record.title, parent: p.title })), (e: Error) => toast.error(e.message))}>
          <span aria-hidden className="pointer-events-none fixed size-0" style={{ left: parentFor.rect.left, top: parentFor.rect.bottom }} />
        </RecordPicker>
      ) : null}
      {current && repeatFor ? <RepeatDialog collection={current} record={repeatFor} onClose={() => setRepeatFor(null)} /> : null}
      {current ? <SaveViewDialog open={savingView} canShare={current.canManage} onClose={() => setSavingView(false)} onSave={viewState.saveAs} /> : null}
      {current?.canManage ? <AutomationsDialog collection={current} people={people} open={automations} onOpenChange={setAutomations} /> : null}
      {current?.canManage ? (
        <ShareDialog
          note={current}
          endpoint={`/api/app/collections/${current.id}/share`}
          title={t("Share {name}", { name: current.name })}
          description={t("Who can open this collection. People with view access read records; edit access adds and changes them.")}
          open={sharing}
          onOpenChange={setSharing}
          onSaved={(saved) => setCollections((list) => list.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)))}
        />
      ) : null}
      {collectionDialog ? <CollectionDialog collection={collectionDialog === "edit" ? current : null} collections={collections} people={people} onClose={() => setCollectionDialog(null)} onDeleted={(id) => {
        // Not a reload through the router: it skips same-screen address changes (/app/collections?v=… → /app/collections).
        const next = collections.find((c) => c.id !== id)
        setCollections((list) => list.filter((c) => c.id !== id))
        setCollectionDialog(null)
        if (next) navigatePanel(`/app/collections/${next.id}`, { replace: true })
        else replaceUrl("/app/collections")
      }} /> : null}
    </AppFrame>
    </CollectionsMeta.Provider>
  )
}

/** "16 Nov". */
const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(appLocale(), { day: "numeric", month: "short" })

type DraftField = { key: string; id?: string; name: string; type: FieldType; options: string; style?: FieldStyle; target?: string; default?: FieldValue }

const choicesOf = (f: DraftField) => f.options.split(",").map((o) => o.trim()).filter(Boolean)

/** A field's default in the collection dialog: a choice, "me", "today", yes, or typed text/number/link/e-mail. */
function DefaultInput({ field, onChange }: { field: DraftField; onChange: (v: FieldValue | undefined) => void }) {
  const NONE = "__none__"
  const pick = (items: { value: string; label: string }[]) => {
    const value = items.some((i) => i.value === field.default) ? String(field.default) : NONE
    return (
      <Select value={value} onValueChange={(v) => onChange(v === NONE ? undefined : v === "true" ? true : v)}>
        <SelectTrigger aria-label={t("Default")} className="h-8 w-full text-[13px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}><span className="text-muted-foreground">{field.type === "select" && field.style === "status" ? t("The first choice") : t("No default")}</span></SelectItem>
          {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
  if (field.type === "select") return pick(choicesOf(field).map((o) => ({ value: o, label: o })))
  if (field.type === "person") return pick([{ value: "me", label: t("Whoever creates the record") }])
  if (field.type === "date") return pick([{ value: "today", label: t("The day it's created") }])
  if (field.type === "checkbox") return pick([{ value: "true", label: t("Checked") }])
  return (
    <Input aria-label={t("Default")} value={field.default == null ? "" : String(field.default)} onChange={(e) => onChange(e.target.value || undefined)} maxLength={500}
      type={field.type === "number" ? "number" : field.type === "url" ? "url" : field.type === "email" ? "email" : "text"} step="any" placeholder={t("No default")} className="h-8 text-[13px]" />
  )
}

function CollectionDialog({ collection, collections, people, onClose, onDeleted }: { collection: Collection | null; collections: Collection[]; people: Person[]; onClose: () => void; onDeleted: (id: string) => void }) {
  const [template, setTemplate] = React.useState<TemplateId | "blank" | "csv">("blank")
  /** "From a spreadsheet": the parsed file, its name, and the fields guessed from it (editable below). */
  const [sheet, setSheet] = React.useState<{ table: string[][]; file: string } | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  async function pickSheet(file: File) {
    const table = await readTable(file)
    if (!table) return
    const { fields: guessed, skipped } = inferFields(table, people)
    setSheet({ table, file: file.name })
    setTemplate("csv")
    setFields(guessed.map((f) => ({ key: crypto.randomUUID(), name: f.name, type: f.type, options: (f.options ?? []).join(", ") })))
    setName((n) => n || file.name.replace(/\.[^.]+$/, "").slice(0, 80))
    if (skipped.length) toast.error(t("Up to 30 fields: left out {columns}.", { columns: skipped.join(", ") }))
  }
  const [name, setName] = React.useState(collection?.name ?? "")
  const [prefix, setPrefix] = React.useState(collection?.prefix ?? "")
  // The colour a collection shows without its own: its place in the list (a new one goes last).
  const collectionIndex = collection ? collections.findIndex((c) => c.id === collection.id) : collections.length
  const [look, setLook] = React.useState({ icon: collection?.icon ?? "", color: collection?.color ?? "" })
  const [fields, setFields] = React.useState<DraftField[]>(() =>
    (collection?.fields ?? []).map((f) => ({ key: f.id, id: f.id, name: f.name, type: f.type, options: (f.options ?? []).join(", "), style: f.type === "select" ? fieldStyle(f) : undefined, target: f.target, default: f.default })),
  )
  const [settings, setSettings] = React.useState(collection?.settings ?? {})
  const [busy, setBusy] = React.useState(false)
  const update = (key: string, patch: Partial<DraftField>) => setFields((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  const removed = collection?.fields.filter((f) => !fields.some((d) => d.id === f.id)) ?? []

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const body = {
      name: name.trim() || undefined,
      ...(collection && prefix !== collection.prefix ? { prefix } : {}),
      ...look,
      fields: fields.map((f) => ({
        id: f.id, name: f.name, type: f.type,
        options: f.type === "select" || f.type === "multiselect" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
        style: f.type === "select" ? f.style ?? "plain" : undefined,
        target: f.type === "relation" ? f.target : undefined,
        // A choice no longer among the choices, or a value left from another type, isn't sent.
        default: !hasDefault(f.type) || f.default === undefined || (f.type === "select" && !choicesOf(f).includes(String(f.default))) ? null : f.default,
      })),
      ...(collection ? { settings } : {}),
    }
    try {
      const saved = collection
        ? await api<Collection>("PATCH", `/api/app/collections/${collection.id}`, body)
        : await api<Collection>("POST", "/api/app/collections", template === "blank" || template === "csv" ? body : { name: body.name, template, ...look })
      if (template === "csv" && sheet) (await importRows(saved, sheet.table)).summary()
      onClose()
      // The same address reloads the page's data (new fields); another collection is another screen.
      navigatePanel(collection ? location.href : `/app/collections/${saved.id}`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{collection ? t("Edit collection") : t("New collection")}</DialogTitle></DialogHeader>
        <form id="collection-form" onSubmit={submit} className="grid gap-4">
          {!collection ? (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("Start from")}>
              <button
                type="button"
                role="radio"
                aria-checked={template === "csv"}
                onClick={() => fileRef.current?.click()}
                className="aria-checked:border-primary aria-checked:bg-primary/5 hover:bg-accent/40 grid gap-0.5 rounded-md border border-dashed p-3 text-left sm:col-span-2"
              >
                <span className="flex items-center gap-2 text-sm font-medium"><FileSpreadsheet className="text-muted-foreground size-4" />{sheet ? sheet.file : t("From a spreadsheet")}</span>
                <span className="text-muted-foreground text-xs">
                  {sheet ? tp(sheet.table.length - 1, { one: "{n} row; fields guessed from the columns, check them below.", other: "{n} rows; fields guessed from the columns, check them below." }) : t("A CSV from Excel or Google Sheets: the fields are guessed from its columns, then its rows come in.")}
                </span>
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (file) void pickSheet(file)
              }} />
              {(["blank", ...TEMPLATE_IDS] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={template === id}
                  onClick={() => { if (template === "csv") (setSheet(null), setFields([])); setTemplate(id) }}
                  className="aria-checked:border-primary aria-checked:bg-primary/5 grid gap-0.5 rounded-md border p-3 text-left"
                >
                  <span className="text-sm font-medium">{id === "blank" ? t("Blank") : t(COLLECTION_TEMPLATES[id].name)}</span>
                  <span className="text-muted-foreground text-xs">{id === "blank" ? t("Your own fields.") : t(COLLECTION_TEMPLATES[id].description)}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="collection-name">{t("Name")}</Label>
            <Input id="collection-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required={template === "blank" || template === "csv" || !!collection}
              placeholder={template !== "blank" && template !== "csv" && !collection ? t(COLLECTION_TEMPLATES[template].name) : t("e.g. Equipment")} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("Icon and colour")}</Label>
            <AppearancePicker icon={look.icon} color={look.color} fallback={collectionColor(collectionIndex)} onChange={(next) => setLook((l) => ({ ...l, ...next }))} />
          </div>
          {collection ? (
            <div className="grid gap-1.5">
              <Label htmlFor="collection-prefix">{t("ID prefix")}</Label>
              <Input id="collection-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} pattern="[A-Z][A-Z0-9]{0,4}" required className="w-32 font-mono" />
              <p className="text-muted-foreground text-xs">{t("Records are numbered {example}, {example2}…", { example: `${prefix || "TSK"}-1`, example2: `${prefix || "TSK"}-2` })}</p>
            </div>
          ) : null}
          {collection || template === "blank" || template === "csv" ? (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("Fields")}</legend>
              <p className="text-muted-foreground -mt-1 text-xs">{t("Every record has a name. A choice field can be shown as a board.")}</p>
              {fields.map((f) => (
                <div key={f.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_8rem_auto]">
                  <Input aria-label={t("Field name")} value={f.name} onChange={(e) => update(f.key, { name: e.target.value })} required maxLength={60} placeholder={t("Field name")} />
                  <Select value={f.type} onValueChange={(type) => update(f.key, { type: type as FieldType, default: undefined })} disabled={!!f.id}>
                    <SelectTrigger aria-label={t("Type")} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{FIELD_TYPES.map((type) => { const Icon = FIELD_ICON[type]; return <SelectItem key={type} value={type}><Icon className="text-muted-foreground" />{t(TYPE_LABELS[type])}</SelectItem> })}</SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Remove {name}", { name: f.name || t("field") })} onClick={() => setFields((list) => list.filter((x) => x.key !== f.key))}><X /></Button>
                  {f.type === "select" || f.type === "multiselect" ? (
                    <div className={cn("grid gap-2 sm:col-span-3", f.type === "select" && "sm:grid-cols-[1fr_9rem]")}>
                      <Input aria-label={f.type === "select" ? t("Choices") : t("Labels")} value={f.options} onChange={(e) => update(f.key, { options: e.target.value })} required placeholder={f.type === "select" ? t("Choices, separated by commas") : t("Labels, separated by commas")} />
                      {f.type === "select" ? (
                        <Select value={f.style ?? "plain"} onValueChange={(style) => update(f.key, { style: style as FieldStyle })}>
                          <SelectTrigger aria-label={t("Shown as")} className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>{FIELD_STYLES.map((st) => <SelectItem key={st} value={st}>{t(STYLE_LABELS[st])}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  ) : null}
                  {hasDefault(f.type) ? (
                    <div className="grid items-center gap-2 sm:col-span-3 sm:grid-cols-[auto_1fr]">
                      <Label className="text-muted-foreground text-xs font-normal">{t("Default")}</Label>
                      <DefaultInput field={f} onChange={(v) => update(f.key, { default: v })} />
                    </div>
                  ) : null}
                  {f.type === "relation" ? (
                    <Select value={f.target ?? ""} onValueChange={(target) => update(f.key, { target })} disabled={!!f.id}>
                      <SelectTrigger aria-label={t("Records from")} className="w-full sm:col-span-3"><SelectValue placeholder={t("Records from which collection?")} /></SelectTrigger>
                      <SelectContent>{collections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : null}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setFields((list) => [...list, { key: crypto.randomUUID(), name: "", type: "text", options: "" }])}>
                <Plus /> {t("Add field")}
              </Button>
              {removed.length ? <p className="text-destructive text-xs">{t("Saving removes {fields} and their values from every record.", { fields: removed.map((f) => f.name).join(", ") })}</p> : null}
            </fieldset>
          ) : null}
          {collection ? <CollectionSettingsSection collectionId={collection.id} fields={collection.fields} value={settings} onChange={setSettings} /> : null}
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          {collection ? (
            <ConfirmButton title={t("Delete {name}?", { name: collection.name })} description={tp(collection.count, { one: "Its {count} record is deleted for everyone.", other: "Its {count} records are deleted for everyone." }, { count: collection.count })} confirmLabel={t("Delete")}
              onConfirm={async () => {
                try {
                  await api("DELETE", `/api/app/collections/${collection.id}`)
                  onDeleted(collection.id)
                } catch (err) {
                  toast.error((err as Error).message)
                }
              }}>
              <Button type="button" variant="ghost" className="text-destructive"><Trash2 /> {t("Delete collection")}</Button>
            </ConfirmButton>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
            <Button type="submit" form="collection-form" disabled={busy}>{collection ? t("Save") : t("Create")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
