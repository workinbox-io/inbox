/**
 * How a collection's values look and are edited, shared by the list, table, board, timeline, calendar and the record
 * panel: a type icon per field, status rings and priority bars (lib/collections/fields.ts `statusKind`,
 * `priorityLevel`), choice and label chips, people with their avatar, short dates, other records by their ID and title
 * (fetched once per id, `useRecordRefs`), files, and borderless editors that save on change (choices, labels, people,
 * records, files, checkboxes) or on blur and Enter (text, numbers, dates, links); Escape puts the old value back.
 */
import * as React from "react"
import { AtSign, CalendarDays, Check, CircleDot, ExternalLink, Hash, Link2, Loader2, Paperclip, SquareCheck, Tags, Type, User, Waypoints, X, type LucideIcon } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { uploadWithProgress } from "@/components/uploads/attachments"
import { tint, WORKSPACE_COLORS } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import { fieldStyle, priorityLevel, statusKind, valueText, type CollectionField, type FieldType, type FieldValue, type StatusKind } from "@/lib/collections/fields"
import { appLocale, t } from "@/lib/i18n/panel"
import type { RelatedRecord } from "@/lib/server/collection-relations"
import { cn } from "@/lib/utils"
import { RecordPicker } from "./record-picker"

export type Person = { id: string; name: string; email: string }

export const FIELD_ICON: Record<FieldType | "title", LucideIcon> = {
  title: Type, text: Type, number: Hash, date: CalendarDays, select: CircleDot, multiselect: Tags, checkbox: SquareCheck, person: User, url: Link2, email: AtSign, relation: Waypoints, file: Paperclip,
}

const STATUS_COLOR: Record<StatusKind, string> = { backlog: "var(--muted-foreground)", unstarted: "var(--muted-foreground)", started: "#d97706", done: "#5e6ad2", canceled: "var(--muted-foreground)" }

/**
 * A status as Linear draws it: a dashed ring (backlog or no value), an empty ring (not started), a ring filling up
 * with the step (in progress), a filled tick (done), a filled cross (cancelled).
 */
export function StatusIcon({ field, option, className }: { field: CollectionField; option: string | undefined; className?: string }) {
  const kind = statusKind(field, option)
  const color = kind ? (kind === "started" ? optionColor(field, option!) : STATUS_COLOR[kind]) : "var(--muted-foreground)"
  const cls = cn("size-3.5 shrink-0", className)
  if (!kind || kind === "backlog") return <svg viewBox="0 0 14 14" className={cls} aria-hidden><circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" /></svg>
  if (kind === "done" || kind === "canceled")
    return (
      <svg viewBox="0 0 14 14" className={cls} aria-hidden>
        <circle cx="7" cy="7" r="6.25" fill={color} />
        {kind === "done" ? <path d="M4.4 7.2 6.2 9 9.6 5.4" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M5 5l4 4M9 5l-4 4" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" />}
      </svg>
    )
  const started = (field.options ?? []).filter((o) => statusKind(field, o) === "started")
  const frac = kind === "unstarted" ? 0 : (started.indexOf(option!) + 1) / (started.length + 1)
  const a = frac * 2 * Math.PI
  const pie = frac > 0 ? `M7 7 L7 3 A4 4 0 ${frac > 0.5 ? 1 : 0} 1 ${7 + 4 * Math.sin(a)} ${7 - 4 * Math.cos(a)} Z` : ""
  return (
    <svg viewBox="0 0 14 14" className={cls} aria-hidden>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5" />
      {pie ? <path d={pie} fill={color} /> : null}
    </svg>
  )
}

/** Bars for low → high, a filled "!" square for urgent, three faint dashes for none. */
export function PriorityIcon({ level, className }: { level: number; className?: string }) {
  const cls = cn("size-3.5 shrink-0", className)
  if (level >= 4)
    return <svg viewBox="0 0 14 14" className={cls} aria-hidden><rect x="1" y="1" width="12" height="12" rx="3" fill="#f2683d" /><path d="M7 3.8v4M7 10.2v.01" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /></svg>
  return (
    <svg viewBox="0 0 14 14" className={cn(cls, "text-foreground")} aria-hidden>
      {[0, 1, 2].map((i) => (
        level === 0
          ? <rect key={i} x={1.5 + i * 4} y="6.25" width="3" height="1.5" rx=".75" fill="currentColor" opacity=".4" />
          : <rect key={i} x={1.5 + i * 4} y={8.5 - i * 3} width="3" height={3 + i * 3} rx="1" fill="currentColor" opacity={i < level ? 0.9 : 0.25} />
      ))}
    </svg>
  )
}

/** A choice as its style reads: status ring or priority bars with the label, or a coloured chip. */
export function ChoiceView({ field, value, bare }: { field: CollectionField; value: string; bare?: boolean }) {
  const style = fieldStyle(field)
  if (style === "status") return <span className="inline-flex min-w-0 items-center gap-1.5"><StatusIcon field={field} option={value} />{bare ? null : <span className="truncate">{value}</span>}</span>
  if (style === "priority") return <span className="inline-flex min-w-0 items-center gap-1.5"><PriorityIcon level={priorityLevel(field, value)} />{bare ? null : <span className="truncate">{value}</span>}</span>
  return <Chip color={optionColor(field, value)}>{value}</Chip>
}

// ---- Other records (relation fields), fetched once per id for every view ----

const refs = new Map<string, RelatedRecord | null>()
const waiting = new Set<string>()
const listeners = new Set<() => void>()
let timer = 0
function load() {
  const ids = [...waiting]
  waiting.clear()
  timer = 0
  for (let i = 0; i < ids.length; i += 100)
    api<{ records: RelatedRecord[] }>("GET", `/api/app/collections/lookup?ids=${ids.slice(i, i + 100).join(",")}`).then(
      (r) => {
        for (const id of ids.slice(i, i + 100)) refs.set(id, r.records.find((x) => x.id === id) ?? null)
        listeners.forEach((l) => l())
      },
      () => {},
    )
}
/** Forget what's known about records (one changed): the next render asks again. */
export const forgetRecordRefs = (ids: string[]) => (ids.forEach((id) => refs.delete(id)), listeners.forEach((l) => l()))

export function useRecordRefs(ids: string[]) {
  const [, bump] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    listeners.add(bump)
    return () => void listeners.delete(bump)
  }, [])
  const missing = ids.filter((id) => !refs.has(id) && !waiting.has(id))
  if (missing.length && typeof window !== "undefined") {
    missing.forEach((id) => waiting.add(id))
    if (!timer) timer = window.setTimeout(load, 30)
  }
  return (id: string) => refs.get(id)
}

/** Another record: its ID and title, a link that opens it; "Unknown record" when it's gone or hidden. */
export function RecordRef({ id, plain }: { id: string; plain?: boolean }) {
  const r = useRecordRefs([id])(id)
  if (r === undefined) return <span className="text-muted-foreground/60">…</span>
  if (r === null) return <span className="text-muted-foreground">{t("Unknown record")}</span>
  const body = <>{r.key ? <span className="text-muted-foreground trim-caps shrink-0 font-mono text-[11px]">{r.key}</span> : null}<span className="truncate">{r.title}</span></>
  if (plain) return <span className="inline-flex min-w-0 items-center gap-1.5">{body}</span>
  return <a href={`/app/open/record/${r.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex min-w-0 items-center gap-1.5 underline-offset-2 hover:underline">{body}</a>
}

/** A stored attachment's name, from its URL's last part. */
export const fileName = (url: string) => decodeURIComponent(url.split("/").pop() ?? "").replace(/^\d+-/, "") || t("File")

export const optionColor = (field: CollectionField, value: string) =>
  WORKSPACE_COLORS[Math.max(0, field.options?.indexOf(value) ?? 0) % WORKSPACE_COLORS.length]!

export function Chip({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center truncate rounded-md px-1.5 py-px text-xs font-medium", className)} style={{ background: tint(color, 16), color }}>
      {children}
    </span>
  )
}

export function PersonView({ id, people, size = 18 }: { id: string; people: Person[]; size?: number }) {
  const p = people.find((x) => x.id === id)
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <UserAvatar seed={p?.email ?? id} size={size} />
      <span className="truncate">{p ? p.name || p.email : t("Former member")}</span>
    </span>
  )
}

/** "25 Mar" this year, "25 Mar 1995" otherwise. */
export function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(appLocale(), { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })
}

/** A value read-only; nothing for an empty one. */
export function ValueView({ field, value, people }: { field: CollectionField; value: FieldValue | undefined; people: Person[] }) {
  if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) return null
  switch (field.type) {
    case "select":
      return <ChoiceView field={field} value={String(value)} />
    case "multiselect":
      return <span className="flex min-w-0 flex-wrap gap-1">{(value as string[]).map((v) => <Chip key={v} color={optionColor(field, v)}>{v}</Chip>)}</span>
    case "relation":
      return <RecordRef id={String(value)} />
    case "file":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex min-w-0 items-center gap-1 underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground">
          <Paperclip className="text-muted-foreground size-3 shrink-0" /><span className="truncate">{fileName(String(value))}</span>
        </a>
      )
    case "checkbox":
      return value ? <SquareCheck className="text-primary size-4" aria-label={t("Yes")} /> : null
    case "person":
      return <PersonView id={String(value)} people={people} />
    case "number":
      return <span className="tabular-nums">{Number(value).toLocaleString(appLocale())}</span>
    case "date":
      return <span className="tabular-nums">{shortDate(String(value))}</span>
    case "url": {
      let host = String(value)
      try {
        host = new URL(host).host.replace(/^www\./, "")
      } catch {}
      return (
        <a href={String(value)} target="_blank" rel="noreferrer noopener" className="text-foreground inline-flex items-center gap-1 underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground" onClick={(e) => e.stopPropagation()}>
          {host}<ExternalLink className="text-muted-foreground size-3" />
        </a>
      )
    }
    case "email":
      return <a href={`/app/mail?compose=1&to=${encodeURIComponent(String(value))}`} className="underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground" onClick={(e) => e.stopPropagation()}>{String(value)}</a>
    default:
      return <span className="truncate">{valueText(value)}</span>
  }
}

const NONE = "__none__"
const ghost = "bg-transparent dark:bg-transparent hover:bg-foreground/[0.04] focus-visible:bg-background data-[state=open]:bg-foreground/[0.04] h-8 w-full rounded-md border border-transparent px-2 text-[13px] shadow-none outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-default disabled:opacity-100"

/**
 * One field's editor in the record panel. Choices, people and checkboxes call `onCommit` at once; typed values on blur
 * or Enter, only when they changed. `readOnly` shows the value without letting it change.
 */
export function PropertyEditor({ field, value, people, readOnly, onCommit, id }: {
  field: CollectionField
  value: FieldValue | undefined
  people: Person[]
  readOnly: boolean
  onCommit: (v: FieldValue | null) => void
  id: string
}) {
  const [draft, setDraft] = React.useState(value == null ? "" : valueText(value))
  const input = React.useRef<HTMLInputElement>(null)
  // Someone else's change (live) doesn't replace what's being typed here.
  React.useEffect(() => void (document.activeElement !== input.current && setDraft(value == null ? "" : valueText(value))), [value])
  const empty = value === undefined || value === "" || (Array.isArray(value) && !value.length)
  const placeholder = <span className="text-muted-foreground/50">{t("Empty")}</span>

  if (field.type === "multiselect") {
    const picked = new Set(Array.isArray(value) ? value : [])
    const toggle = (o: string) => {
      const next = (field.options ?? []).filter((x) => (x === o ? !picked.has(x) : picked.has(x)))
      onCommit(next.length ? next : null)
    }
    return (
      <Popover>
        <PopoverTrigger id={id} disabled={readOnly} className={cn(ghost, "flex items-center text-left")}>
          {empty ? placeholder : <ValueView field={field} value={value} people={people} />}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          {(field.options ?? []).map((o) => (
            <button key={o} type="button" aria-pressed={picked.has(o)} onClick={() => toggle(o)} className="hover:bg-foreground/[0.05] flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]">
              <span className={cn("grid size-4 shrink-0 place-items-center rounded border", picked.has(o) && "bg-primary border-primary text-primary-foreground")}>{picked.has(o) ? <Check className="size-3" /> : null}</span>
              <Chip color={optionColor(field, o)}>{o}</Chip>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    )
  }

  if (field.type === "relation") {
    const view = <span className="flex min-w-0 items-center">{empty ? placeholder : <RecordRef id={String(value)} plain />}</span>
    if (readOnly) return <div className="flex h-8 min-w-0 items-center px-2 text-[13px]">{empty ? placeholder : <RecordRef id={String(value)} />}</div>
    return (
      <div className="group/rel relative">
        <RecordPicker collectionId={field.target ?? ""} onPick={(r) => onCommit(r.id)} placeholder={t("{field}…", { field: field.name })}>
          <button type="button" id={id} className={cn(ghost, "flex items-center text-left")}>{view}</button>
        </RecordPicker>
        {!empty ? <button type="button" aria-label={t("Clear")} onClick={() => onCommit(null)} className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 hidden size-6 -translate-y-1/2 place-items-center rounded group-hover/rel:grid"><X className="size-3.5" /></button> : null}
      </div>
    )
  }

  if (field.type === "file") return <FileEditor id={id} value={empty ? undefined : String(value)} readOnly={readOnly} onCommit={onCommit} />

  if (field.type === "checkbox")
    return (
      <div className="flex h-8 items-center px-2">
        <Checkbox id={id} checked={value === true} disabled={readOnly} onCheckedChange={(c) => onCommit(c === true)} />
      </div>
    )

  if (field.type === "select" || field.type === "person") {
    const empty = value === undefined || value === ""
    return (
      <Select value={empty ? NONE : String(value)} onValueChange={(v) => onCommit(v === NONE ? null : v)} disabled={readOnly}>
        <SelectTrigger id={id} className={cn(ghost, "justify-start gap-2 [&>svg:last-child]:ml-auto [&>svg:last-child]:opacity-0 hover:[&>svg:last-child]:opacity-60")}>
          {empty ? <span className="text-muted-foreground/70">{t("Empty")}</span> : <SelectValue />}
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="min-w-48">
          <SelectItem value={NONE}><span className="text-muted-foreground">{t("Empty")}</span></SelectItem>
          {field.type === "select"
            ? (field.options ?? []).map((o) => <SelectItem key={o} value={o}><ChoiceView field={field} value={o} /></SelectItem>)
            : people.map((p) => <SelectItem key={p.id} value={p.id}><PersonView id={p.id} people={people} /></SelectItem>)}
        </SelectContent>
      </Select>
    )
  }

  const type = ({ number: "number", date: "date", url: "url", email: "email", text: "text" } as Record<string, string>)[field.type] ?? "text"
  const commit = () => {
    const next = draft.trim()
    if (next === (value == null ? "" : valueText(value))) return
    onCommit(next === "" ? null : next)
  }
  if (readOnly)
    return (
      <div className="flex h-8 min-w-0 items-center px-2 text-[13px]">
        {value === undefined || value === "" ? <span className="text-muted-foreground/70">{t("Empty")}</span> : <ValueView field={field} value={value} people={people} />}
      </div>
    )
  return (
    <input
      ref={input}
      id={id}
      type={type}
      step={field.type === "number" ? "any" : undefined}
      value={draft}
      placeholder={t("Empty")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.preventDefault(), e.currentTarget.blur())
        if (e.key === "Escape") (e.stopPropagation(), setDraft(value == null ? "" : valueText(value)), requestAnimationFrame(() => e.currentTarget?.blur()))
      }}
      className={cn(ghost, "placeholder:text-muted-foreground/70 bg-transparent", field.type === "number" && "tabular-nums")}
    />
  )
}

/** A file field: the file's name (opens it), "Upload" when empty, × to clear. Uploads go to /api/app/attachments. */
function FileEditor({ id, value, readOnly, onCommit }: { id: string; value: string | undefined; readOnly: boolean; onCommit: (v: FieldValue | null) => void }) {
  const ref = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  async function upload(file: File) {
    setBusy(true)
    try {
      onCommit((await uploadWithProgress("/api/app/attachments", {}, file, file.type, () => {}, t("Upload failed"))).url)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="group/file flex h-8 min-w-0 items-center gap-1 px-2 text-[13px]">
      {value ? (
        <a href={value} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 underline-offset-2 hover:underline"><Paperclip className="text-muted-foreground size-3.5 shrink-0" /><span className="truncate">{fileName(value)}</span></a>
      ) : readOnly ? (
        <span className="text-muted-foreground/70">{t("Empty")}</span>
      ) : (
        <button type="button" id={id} onClick={() => ref.current?.click()} disabled={busy} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}{t("Upload a file")}
        </button>
      )}
      {value && !readOnly ? <button type="button" aria-label={t("Remove file")} onClick={() => onCommit(null)} className="text-muted-foreground hover:text-foreground ml-auto hidden size-6 place-items-center rounded group-hover/file:grid"><X className="size-3.5" /></button> : null}
      <input ref={ref} type="file" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (file) void upload(file)
      }} />
    </div>
  )
}
