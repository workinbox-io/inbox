/**
 * The open record, like Linear's issue view: the collection, its parent and the record's ID in the header (follow,
 * copy link, expand to the full width of the board and back, actions, close), a large title, the fields plus its
 * cycle and parent (a column on the right when expanded, rows under the title beside the board), the rich-text
 * description (the mail editor: lists, links, "@" for people and anything else; autosaved), sub-records with their
 * progress, relations (blocks, blocked by, related, duplicate), the records of other collections linking here, links
 * (record-links.tsx), and activity: history and comments (record-comments.tsx). A record waiting in triage or lying in
 * the trash says so on top with its actions. An existing record saves each change as it's made and follows other
 * people's changes live (not a field being typed in); a new one keeps the values until "Create" (or Enter in the
 * title). J / K step through the list (the app's shortcut). On phones it covers the screen.
 */
import * as React from "react"
import { Bell, BellOff, CircleSlash, Inbox, IterationCw, Link2, Loader2, Maximize2, Minimize2, Network, Plus, RotateCcw, Trash2, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import type { Value } from "platejs"
import { MailEditor } from "@/components/mailbox/mail-editor"
import { Button } from "@/components/ui/button"
import { ActionMenuButton, type MenuAction } from "@/components/workspace/action-menu"
import { Kbd } from "@/components/workspace/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api-client"
import { isClosed, type FieldValue } from "@/lib/collections/fields"
import { formatId } from "@/lib/collections/ids"
import { shortSpan, slaHours, slaState } from "@/lib/collections/settings"
import { appLocale, msg, t, tp } from "@/lib/i18n/panel"
import type { Related, RelatedRecord, RelationKind } from "@/lib/server/collection-relations"
import type { Collection, CollectionRecord } from "@/lib/server/collections"
import { cn } from "@/lib/utils"
import { copyText, recordLink, type CycleOption } from "./record-actions"
import { RecordComments } from "./record-comments"
import { ProgressRing } from "./record-meta"
import { RecordLinks } from "./record-links"
import { RecordPicker } from "./record-picker"
import { FIELD_ICON, PropertyEditor, StatusIcon, type Person } from "./values"

export type PanelRecord = CollectionRecord | { new: true; values: Record<string, FieldValue>; parentId?: string | null; title?: string; description?: unknown[] | null }

const RELATION_LABEL: Record<RelationKind, string> = { blocks: msg("Blocks"), blockedBy: msg("Blocked by"), related: msg("Related to"), duplicate: msg("Duplicate of"), duplicatedBy: msg("Duplicated by") }
type Patch = { title?: string; values?: Record<string, FieldValue | null>; description?: Value | null; parentId?: string | null; cycle?: number | null }

const stamp = (iso: string) => new Date(iso).toLocaleString(appLocale(), { dateStyle: "medium", timeStyle: "short" })

/** The description: loaded with the record (lists don't carry it), autosaved 800 ms after typing stops. */
function Description({ path, record, readOnly, onSave }: { path: string; record: CollectionRecord; readOnly: boolean; onSave: (doc: Value | null) => Promise<unknown> }) {
  const [doc, setDoc] = React.useState<Value | null | undefined>(record.description === undefined ? undefined : (record.description as Value | null))
  React.useEffect(() => {
    if (doc !== undefined) return
    api<CollectionRecord>("GET", path).then((r) => setDoc((r.description as Value | null) ?? null), () => setDoc(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per record
  }, [path])
  const pending = React.useRef<{ doc: Value | null; timer: number } | null>(null)
  const flush = React.useCallback(() => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    void onSave(p.doc).catch((e: Error) => toast.error(e.message))
  }, [onSave])
  React.useEffect(() => flush, [flush])
  if (doc === undefined) return <div className="mt-4 h-24" />
  if (readOnly && !doc) return null
  return (
    <div className="-mx-1.5 mt-4">
      <MailEditor
        initial={doc ?? undefined}
        initialText=""
        label={t("Description")}
        readOnly={readOnly}
        placeholder={t("Add a description… (@ to mention)")}
        className="min-h-24 rounded-md px-1.5 py-1 text-[14px] leading-6"
        onChange={(value, text) => {
          if (pending.current) clearTimeout(pending.current.timer)
          pending.current = { doc: text.trim() ? value : null, timer: window.setTimeout(flush, 800) }
        }}
      />
    </div>
  )
}

/** A related record in a list: status, ID, title; opens it (in place when it's in this collection). */
function RelatedRow({ r, onOpen, onRemove, label }: { r: RelatedRecord; onOpen: (r: RelatedRecord) => void; onRemove?: () => void; label?: string }) {
  return (
    <li className="group/rel hover:bg-foreground/[0.03] flex h-8 items-center gap-2 rounded-md px-1.5 text-[13px]">
      {label ? <span className="text-muted-foreground w-24 shrink-0 truncate text-xs">{label}</span> : null}
      <button type="button" onClick={() => onOpen(r)} className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", r.closed && "text-muted-foreground")}>
        <StatusDot r={r} />
        {r.key ? <span className="text-muted-foreground trim-caps shrink-0 font-mono text-[11px]">{r.key}</span> : null}
        <span className={cn("truncate", r.kind === "canceled" && "line-through")}>{r.title}</span>
      </button>
      {onRemove ? <button type="button" aria-label={t("Remove")} onClick={onRemove} className="text-muted-foreground hover:text-foreground hidden size-6 place-items-center rounded group-hover/rel:grid"><X className="size-3.5" /></button> : null}
    </li>
  )
}

/** A related record's status by its kind alone (its collection's field isn't loaded here). */
const KIND_FIELD = { id: "s", name: "Status", type: "select" as const, style: "status" as const, options: ["Backlog", "To do", "Doing", "Done"] }
const KIND_OPTION = { backlog: "Backlog", unstarted: "To do", started: "Doing", done: "Done" } as const
function StatusDot({ r }: { r: RelatedRecord }) {
  if (r.kind === "canceled") return <CircleSlash className="text-muted-foreground size-3.5 shrink-0" />
  return <StatusIcon field={KIND_FIELD} option={r.kind ? KIND_OPTION[r.kind] : undefined} />
}

/** Sub-records, relations and records linking here, with adding and removing; reloads with the record. */
function Relations({ collection, record, readOnly, version, onOpenRecord, onCreateChild }: {
  collection: Collection
  record: CollectionRecord
  readOnly: boolean
  version: string
  onOpenRecord: (id: string, collectionId: string) => void
  onCreateChild: (title: string) => Promise<unknown>
}) {
  const path = `/api/app/collections/${collection.id}/records/${record.id}/related`
  const [data, setData] = React.useState<Related | null>(null)
  React.useEffect(() => {
    api<Related>("GET", path).then(setData, () => {})
  }, [path, version])
  const [adding, setAdding] = React.useState<"blocks" | "blockedBy" | "related" | "duplicate" | null>(null)
  const [child, setChild] = React.useState<string | null>(null)
  const open = (r: RelatedRecord) => onOpenRecord(r.id, r.collectionId)
  const run = async (work: Promise<Related>) => {
    try {
      setData(await work)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  if (!data) return null
  const done = data.children.filter((c) => c.closed).length
  return (
    <div className="mt-6 space-y-5">
      {data.children.length || child !== null ? (
        <section aria-label={t("Sub-records")}>
          <h3 className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-medium">
            {t("Sub-records")}
            {data.children.length ? <span className="flex items-center gap-1 tabular-nums"><ProgressRing done={done} total={data.children.length} />{done}/{data.children.length}</span> : null}
          </h3>
          <ul>{data.children.map((c) => <RelatedRow key={c.id} r={c} onOpen={open} />)}</ul>
          {child !== null ? (
            <input
              autoFocus
              value={child}
              placeholder={t("Sub-record title, then Enter")}
              onChange={(e) => setChild(e.target.value)}
              onBlur={() => !child.trim() && setChild(null)}
              onKeyDown={async (e) => {
                if (e.key === "Escape") return void (e.stopPropagation(), setChild(null))
                if (e.key !== "Enter" || !child.trim()) return
                e.preventDefault()
                const title = child.trim()
                setChild("")
                try {
                  await onCreateChild(title)
                  setData(await api<Related>("GET", path))
                } catch (err) {
                  toast.error((err as Error).message)
                }
              }}
              className="placeholder:text-muted-foreground/60 h-8 w-full rounded-md border px-2 text-[13px] outline-none focus:border-ring"
            />
          ) : null}
        </section>
      ) : null}
      {data.relations.length ? (
        <section aria-label={t("Relations")}>
          <h3 className="text-muted-foreground mb-1 text-xs font-medium">{t("Relations")}</h3>
          <ul>
            {data.relations.map((r) => (
              <RelatedRow key={r.id} r={r.record} label={t(RELATION_LABEL[r.kind])} onOpen={open} onRemove={readOnly ? undefined : () => void run(api<Related>("DELETE", `${path}?relation=${r.id}`))} />
            ))}
          </ul>
        </section>
      ) : null}
      {data.linkedFrom.map((g) => {
        const closed = g.records.filter((r) => r.closed).length
        return (
          <section key={`${g.collectionId}:${g.field}`} aria-label={g.collection}>
            <h3 className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-medium">
              {t("{collection} with this {field}", { collection: g.collection, field: g.field.toLowerCase() })}
              <span className="flex items-center gap-1 tabular-nums"><ProgressRing done={closed} total={g.records.length} />{closed}/{g.records.length}</span>
            </h3>
            <ul>{g.records.map((r) => <RelatedRow key={r.id} r={r} onOpen={open} />)}</ul>
          </section>
        )
      })}
      {!readOnly ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-0.5 gap-y-1 text-xs">
          <Button variant="ghost" size="sm" className="text-muted-foreground h-7 px-2 text-xs" onClick={() => setChild("")}><Plus /> {t("Sub-record")}</Button>
          <span aria-hidden className="bg-border mx-1 h-4 w-px" />
          {(["blockedBy", "blocks", "related", "duplicate"] as const).map((kind) => (
            <RecordPicker key={kind} collectionId={collection.id} exclude={[record.id]} open={adding === kind} onOpenChange={(o) => setAdding(o ? kind : null)}
              onPick={(r) => void run(api<Related>("POST", path, { to: r.id, kind }))}>
              <Button variant="ghost" size="sm" className="text-muted-foreground h-7 px-1.5 text-xs">{t(RELATION_LABEL[kind])}</Button>
            </RecordPicker>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Follow (bell): hear about comments and status changes; muting stops the notices assignees and commenters get. */
function FollowButton({ path }: { path: string }) {
  const [on, setOn] = React.useState<boolean | null | undefined>(undefined)
  React.useEffect(() => {
    api<{ on: boolean | null }>("GET", `${path}/follow`).then((r) => setOn(r.on), () => {})
  }, [path])
  if (on === undefined) return null
  const following = on === true
  return (
    <Button variant="ghost" size="icon-sm" aria-pressed={following} aria-label={following ? t("Unfollow") : t("Follow")} title={following ? t("Following: you hear about comments and status changes. Click to stop.") : on === false ? t("Muted. Click to follow.") : t("Follow")}
      onClick={async () => {
        try {
          setOn((await api<{ on: boolean }>("PUT", `${path}/follow`, { on: !following })).on)
          toast.success(following ? t("You won't hear about this record.") : t("You'll hear about comments and status changes."))
        } catch (e) {
          toast.error((e as Error).message)
        }
      }}>
      {following ? <Bell className="fill-current" /> : on === false ? <BellOff /> : <Bell />}
    </Button>
  )
}

export function RecordPanel({ collection, record, people, readOnly, full, onToggleFull, onClose, onCreate, onPatch, menu = [], cycles, triageActions, trashActions, onOpenRecord, parentTitle }: {
  collection: Collection
  record: PanelRecord
  people: Person[]
  readOnly: boolean
  /** Expanded over the whole board (desktop). */
  full?: boolean
  onToggleFull?: () => void
  onClose: () => void
  onCreate: (input: { title: string; values: Record<string, FieldValue | null>; parentId?: string | null; description?: unknown }) => Promise<CollectionRecord>
  onPatch: (id: string, patch: Patch) => Promise<CollectionRecord>
  /** The record's actions (record-actions.tsx) for the "…" menu. */
  menu?: MenuAction[]
  cycles?: CycleOption[]
  /** A record waiting in triage: accept, decline, mark as duplicate. */
  triageActions?: { accept: () => void; decline: () => void; duplicate: (of: string) => void }
  /** A record in the trash: restore, delete for good. */
  trashActions?: { restore: () => void; purge: () => void }
  /** Opens another record: in place when it's in this collection, else through its link. */
  onOpenRecord: (id: string, collectionId: string) => void
  parentTitle?: (id: string) => string | undefined
}) {
  const isNew = "new" in record
  const [title, setTitle] = React.useState(isNew ? record.title ?? "" : record.title)
  const [values, setValues] = React.useState<Record<string, FieldValue | null>>(record.values)
  const [saving, setSaving] = React.useState(false)
  const draftDoc = React.useRef<unknown[] | null>(isNew ? record.description ?? null : null)
  const titleRef = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    if (isNew) titleRef.current?.focus()
  }, [isNew])
  // Other people's changes (live) and the board's (drag, S/A/L) show here; a title being typed stays.
  const version = isNew ? "" : record.updatedAt
  React.useEffect(() => {
    if (isNew) return
    setValues(record.values)
    if (document.activeElement !== titleRef.current) setTitle(record.title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const [parentId, setParentId] = React.useState(record.parentId ?? null)
  const [cycle, setCycle] = React.useState<number | null>(isNew ? null : record.cycle)
  React.useEffect(() => {
    if (isNew) return
    setParentId(record.parentId)
    setCycle(record.cycle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  async function save(patch: Patch) {
    if (isNew) return
    setSaving(true)
    try {
      const saved = await onPatch(record.id, patch)
      setValues(saved.values)
      if (patch.title !== undefined) setTitle(saved.title)
    } catch (e) {
      // Back to what the server has.
      setValues(record.values)
      setTitle(record.title)
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function create() {
    if (!title.trim()) return void titleRef.current?.focus()
    setSaving(true)
    try {
      await onCreate({ title: title.trim(), values, parentId, ...(draftDoc.current ? { description: draftDoc.current } : {}) })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const commitTitle = () => {
    const next = title.trim()
    if (isNew || !next || next === record.title) return void (!next && !isNew && setTitle(record.title))
    void save({ title: next })
  }

  const id = isNew ? null : formatId(collection.prefix, record.number)
  const path = isNew ? "" : `/api/app/collections/${collection.id}/records/${record.id}`
  const actions = isNew ? [] : menu
  const trashed = !isNew && !!record.deletedAt
  const editable = !readOnly && !trashed
  const hours = !isNew ? slaHours(collection.settings.sla, values as never) : null
  const sla = hours && !isNew ? slaState(Date.parse(record.createdAt), hours, Date.now()) : null
  const slaOpen = sla && !isClosed(collection.fields, values as never) ? sla : null

  const extraRows = (
    <>
      {cycles?.length && !isNew ? (
        <>
          <dt className="text-muted-foreground flex h-8 min-w-0 items-center gap-2 text-[13px]"><IterationCw className="size-3.5 shrink-0" /><label htmlFor="prop-cycle" className="truncate">{t("Cycle")}</label></dt>
          <dd className="min-w-0">
            <Select value={cycle ? String(cycle) : "none"} disabled={!editable} onValueChange={(v) => { const n = v === "none" ? null : Number(v); setCycle(n); void save({ cycle: n }) }}>
              <SelectTrigger id="prop-cycle" className="hover:bg-foreground/[0.04] h-8 w-full justify-start border-transparent px-2 text-[13px] shadow-none">{cycle ? <SelectValue /> : <span className="text-muted-foreground/70">{t("No cycle")}</span>}</SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="none"><span className="text-muted-foreground">{t("No cycle")}</span></SelectItem>
                {(cycles.some((c) => c.n === cycle) || !cycle ? cycles : [{ n: cycle, label: t("Cycle {n}", { n: cycle }) }, ...cycles]).map((c) => <SelectItem key={c.n} value={String(c.n)}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </dd>
        </>
      ) : null}
      {parentId || (editable && !isNew) ? (
        <>
          <dt className="text-muted-foreground flex h-8 min-w-0 items-center gap-2 text-[13px]"><Network className="size-3.5 shrink-0" /><span className="truncate">{t("Parent")}</span></dt>
          <dd className="group/parent relative min-w-0">
            <RecordPicker collectionId={collection.id} exclude={isNew ? [] : [record.id]} onPick={(r) => { setParentId(r.id); void save({ parentId: r.id }) }}>
              <button type="button" disabled={!editable} className="hover:bg-foreground/[0.04] flex h-8 w-full min-w-0 items-center rounded-md px-2 text-left text-[13px]">
                {parentId ? <span className="truncate">{parentTitle?.(parentId) ?? t("Parent record")}</span> : <span className="text-muted-foreground/70">{t("None")}</span>}
              </button>
            </RecordPicker>
            {parentId && editable ? <button type="button" aria-label={t("Clear")} onClick={() => { setParentId(null); void save({ parentId: null }) }} className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 hidden size-6 -translate-y-1/2 place-items-center rounded group-hover/parent:grid"><X className="size-3.5" /></button> : null}
          </dd>
        </>
      ) : null}
    </>
  )

  const properties = (
    <dl className={cn("grid items-start gap-x-2 gap-y-0.5", full ? "grid-cols-[minmax(5rem,7.5rem)_minmax(0,1fr)]" : "bg-muted/30 mt-5 grid-cols-[minmax(5rem,9rem)_minmax(0,1fr)] rounded-lg border px-2 py-1.5")}>
      {collection.fields.map((f) => {
        const Icon = FIELD_ICON[f.type]
        const key = `prop-${f.id}`
        return (
          <React.Fragment key={f.id}>
            <dt className="text-muted-foreground flex h-8 min-w-0 items-center gap-2 text-[13px]">
              <Icon className="size-3.5 shrink-0" />
              <label htmlFor={key} className="truncate">{f.name}</label>
            </dt>
            <dd className="min-w-0">
              <PropertyEditor
                id={key}
                field={f}
                value={values[f.id] ?? undefined}
                people={people}
                readOnly={!editable}
                onCommit={(v) => {
                  setValues((s) => ({ ...s, [f.id]: v }))
                  void save({ values: { [f.id]: v } })
                }}
              />
            </dd>
          </React.Fragment>
        )
      })}
      {extraRows}
    </dl>
  )
  const meta = isNew ? null : (
    <p className="text-muted-foreground text-xs leading-5">
      {t("Created {created}", { created: stamp(record.createdAt) })}
      <br />
      {t("Edited {edited}", { edited: stamp(record.updatedAt) })}
    </p>
  )

  const titleField = (
    <textarea
      ref={titleRef}
      value={title}
      rows={1}
      readOnly={!editable}
      maxLength={300}
      placeholder={t("Untitled")}
      aria-label={t("Name")}
      onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
      onBlur={commitTitle}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return
        e.preventDefault()
        if (isNew) void create()
        else e.currentTarget.blur()
      }}
      className="placeholder:text-muted-foreground/50 field-sizing-content w-full resize-none bg-transparent text-2xl leading-tight font-semibold tracking-tight outline-none"
    />
  )

  return (
    <aside aria-label={isNew ? t("New record") : record.title} data-record-panel className="bg-background flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs">
          <span className="min-w-8 truncate">{collection.name}</span>
          {parentId && !isNew ? <><span aria-hidden>›</span><button type="button" onClick={() => onOpenRecord(parentId, collection.id)} className="hover:text-foreground max-w-32 truncate">{parentTitle?.(parentId) ?? t("Parent record")}</button></> : null}
          {isNew ? <><span aria-hidden>›</span><span className="text-foreground">{t("New record")}</span></> : null}
          {id ? <><span aria-hidden>›</span><button type="button" onClick={() => copyText(id, t("ID copied."))} title={t("Copy ID")} className="hover:text-foreground font-mono">{id}</button></> : null}
          {slaOpen ? (
            <span title={slaOpen.state === "breached" ? t("SLA missed {time} ago", { time: shortSpan(slaOpen.left) }) : t("SLA {time} left", { time: shortSpan(slaOpen.left) })}
              className={cn("ml-1 shrink-0 rounded px-1 tabular-nums", slaOpen.state === "breached" ? "bg-red-500/10 text-red-600 dark:text-red-400" : slaOpen.state === "soon" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted")}>
              SLA {slaOpen.state === "breached" ? "-" : ""}{shortSpan(slaOpen.left)}
            </span>
          ) : null}
          {saving ? <Loader2 className="ml-1 size-3 animate-spin" /> : null}
        </span>
        {!isNew ? <span className="text-muted-foreground mr-1 hidden items-center gap-1 text-[11px] lg:flex"><Kbd>J</Kbd><Kbd>K</Kbd></span> : null}
        {!isNew && !trashed ? <FollowButton path={path} /> : null}
        {!isNew ? <Button variant="ghost" size="icon-sm" aria-label={t("Copy link")} title={`${t("Copy link")} (⌘⇧C)`} onClick={() => copyText(recordLink(record), t("Link copied."))}><Link2 /></Button> : null}
        {onToggleFull ? (
          <Button variant="ghost" size="icon-sm" aria-label={full ? t("Back beside the list") : t("Expand")} title={full ? t("Back beside the list") : t("Expand")} onClick={onToggleFull}>
            {full ? <Minimize2 /> : <Maximize2 />}
          </Button>
        ) : null}
        {actions.length ? <ActionMenuButton actions={actions} label={t("Record actions")} /> : null}
        <Button variant="ghost" size="icon-sm" aria-label={t("Close")} title={t("Close (Esc)")} onClick={onClose}><X /></Button>
      </header>
      {trashActions && trashed ? (
        <div className="bg-destructive/5 text-destructive flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[13px]">
          <Trash2 className="size-4" />
          <span className="flex-1">{t("In the trash since {date}. It's deleted for good after 30 days.", { date: stamp(record.deletedAt!) })}</span>
          <Button size="sm" variant="outline" className="h-7" onClick={trashActions.restore}><RotateCcw /> {t("Restore")}</Button>
          <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={trashActions.purge}>{t("Delete for good")}</Button>
        </div>
      ) : null}
      {triageActions && !isNew && record.triage ? (
        <div className="bg-primary/5 flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[13px]">
          <Inbox className="text-primary size-4" />
          <span className="flex-1">{t("Waiting in triage, sent by {who}.", { who: people.find((p) => p.id === record.createdBy)?.name ?? t("an app") })}</span>
          <Button size="sm" className="h-7" onClick={triageActions.accept}>{t("Accept")}</Button>
          <RecordPicker collectionId={collection.id} exclude={[record.id]} onPick={(r) => triageActions.duplicate(r.id)}>
            <Button size="sm" variant="outline" className="h-7">{t("Duplicate of…")}</Button>
          </RecordPicker>
          <Button size="sm" variant="ghost" className="h-7" onClick={triageActions.decline}>{t("Decline")}</Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto px-5 pt-6 pb-8", full ? "grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-10" : "")}>
          <div className="min-w-0">
            {titleField}
            {full ? null : properties}
            {isNew ? (
              <>
              <div className="-mx-1.5 mt-4">
                <MailEditor
                  initial={(draftDoc.current as Value | null) ?? undefined}
                  initialText=""
                  label={t("Description")}
                  placeholder={t("Add a description… (@ to mention)")}
                  className="min-h-24 rounded-md px-1.5 py-1 text-[14px] leading-6"
                  onChange={(value, text) => void (draftDoc.current = text.trim() ? value : null)}
                />
              </div>
              <div className="mt-6 flex items-center gap-2 border-t pt-4">
                <Button onClick={() => void create()} disabled={saving || !title.trim()}>{t("Create")}</Button>
                <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
              </div>
              </>
            ) : (
              <>
                <Description key={record.id} path={trashed ? `${path}?deleted=1` : path} record={record} readOnly={!editable} onSave={(doc) => onPatch(record.id, { description: doc })} />
                {!trashed ? <Relations collection={collection} record={record} readOnly={!editable} version={version} onOpenRecord={onOpenRecord} onCreateChild={(t) => onCreate({ title: t, values: {}, parentId: record.id })} /> : null}
                <RecordLinks path={path} readOnly={!editable} version={version} />
                <RecordComments path={path} people={people} fields={collection.fields} version={version} />
                {full ? null : <div className="mt-8 border-t pt-3">{meta}</div>}
              </>
            )}
          </div>
          {full ? (
            <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <h3 className="text-muted-foreground text-xs font-medium">{t("Properties")}</h3>
              {properties}
              {meta ? <div className="border-t pt-3">{meta}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
