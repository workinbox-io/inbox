import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Archive, AtSign, ChevronLeft, Filter, Forward, Plus, RefreshCw, Send, Tag, Trash2, X } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { PrefHeading, PrefList, PrefRow } from "./pref-ui"
import type { FilterCondition, FilterActions } from "@/db/schema/mail-storage"

type Label = { id: string; mailboxId: string; name: string }
type Rule = { id: string; mailboxId: string; name: string; position: number; enabled: boolean; conditions: FilterCondition[]; actions: FilterActions }
type Target = { id: string; mailboxId: string; address: string; verifiedAt: string | null }
type Box = { id: string; address: string; storage?: { usedBytes: number; quotaBytes: number } }
const NONE = "__none__"
function Choice({ value, onChange, label, options }: {value:string;onChange:(v:string)=>void;label:string;options:{value:string;label:string}[]}) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
}
const emptyRule = () => ({ name: "", position: 0, enabled: true, conditions: [{field:"from",value:""}] as FilterCondition[], actions: {} as FilterActions })
/** Labels, filters and forwarding of one mailbox: loaded once, shared by the preference sections. */
export function useMailboxRules(address: string) {
  const [box, setBox] = React.useState<Box | null>(null)
  const [labels, setLabels] = React.useState<Label[]>([])
  const [rules, setRules] = React.useState<Rule[]>([])
  const [targets, setTargets] = React.useState<Target[]>([])
  const [busy, setBusy] = React.useState(false)
  const refresh = React.useCallback(async () => {
    const [boxes, l, f] = await Promise.all([
      api<{ mailboxes: Box[] }>("GET", "/api/app/mail/mailboxes"),
      api<{ labels: Label[] }>("GET", "/api/app/mail/labels"),
      api<{ filters: Rule[]; targets: Target[] }>("GET", "/api/app/mail/filters"),
    ])
    const b = boxes.mailboxes.find((b) => b.address === address) ?? null
    setBox(b)
    setLabels(l.labels.filter((l) => l.mailboxId === b?.id))
    setRules(f.filters.filter((r) => r.mailboxId === b?.id))
    setTargets(f.targets.filter((t) => t.mailboxId === b?.id))
  }, [address])
  React.useEffect(() => {
    if (address) refresh().catch((e) => toast.error(e.message))
  }, [address, refresh])
  const run = React.useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true)
      try {
        await action()
        await refresh()
        window.dispatchEvent(new Event("mail:labels-changed"))
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )
  return { box, labels, rules, targets, busy, run, refresh }
}
export type MailboxRules = ReturnType<typeof useMailboxRules>

function Loading() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      <div className="bg-muted h-9 animate-pulse rounded-lg" />
      <div className="bg-muted/60 h-24 animate-pulse rounded-xl" />
    </div>
  )
}

const gib = (bytes: number) => bytes / 1024 ** 3
/** 340 MB, 2.4 GB: mail sizes people read at a glance. */
const size = (bytes: number) => (bytes > 0 && bytes < 1024 ** 2 ? "< 1 MB" : bytes < 1024 ** 3 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${gib(bytes).toFixed(gib(bytes) < 10 ? 1 : 0)} GB`)

export function StorageSection({ rules: { box } }: { rules: MailboxRules }) {
  if (!box) return <Loading />
  const used = box.storage?.usedBytes ?? 0
  const quota = box.storage?.quotaBytes ?? 10 * 1024 ** 3
  const pct = Math.min(100, (used / quota) * 100)
  const level = pct >= 95 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-foreground"
  return (
    <div className="flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex items-end justify-between gap-3">
        <p>
          <span className="text-2xl font-medium tabular-nums">{size(used)}</span>
          <span className="text-muted-foreground text-sm"> of {size(quota)}</span>
        </p>
        <span className="text-muted-foreground text-sm tabular-nums">{pct < 1 && used > 0 ? "< 1" : Math.round(pct)}%</span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
        <div className={cn("h-full rounded-full", level)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-muted-foreground text-xs">Messages, originals and attachments count. Empty the trash and spam folders to free space; your admin can raise the limit.</p>
    </div>
  )
}

export function LabelsSection({ rules: { box, labels, busy, run } }: { rules: MailboxRules }) {
  const [name, setName] = React.useState("")
  if (!box) return <Loading />
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await api("POST", "/api/app/mail/labels", { mailboxId: box.id, name })
            setName("")
          })
        }}
      >
        <Input aria-label="New label" placeholder="New label, e.g. Invoices" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        <Button disabled={busy || !name.trim()} type="submit" variant="outline">
          <Plus /> Add label
        </Button>
      </form>
      {labels.length ? (
        <PrefList>
          {labels.map((label) => (
            <LabelEditor key={label.id} label={label} busy={busy} onSave={(value) => run(() => api("POST", "/api/app/mail/labels", { ...label, name: value }))} onDelete={() => run(() => api("DELETE", `/api/app/mail/labels?id=${label.id}`))} />
          ))}
        </PrefList>
      ) : (
        <EmptyState variant="plain" density="compact" className="rounded-xl border border-dashed" icon={<Tag />} title="No labels yet" description="Apply them from the thread list or let a filter do it." />
      )}
    </div>
  )
}

function LabelEditor({ label, busy, onSave, onDelete }: { label: Label; busy: boolean; onSave: (name: string) => void; onDelete: () => void }) {
  const [value, setValue] = React.useState(label.name)
  React.useEffect(() => setValue(label.name), [label.name])
  const changed = value.trim() !== label.name && !!value.trim()
  return (
    <form
      className="flex items-center gap-2 py-1.5 pr-1.5 pl-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed) onSave(value.trim())
      }}
    >
      <Tag className="text-muted-foreground size-4 shrink-0" />
      <Input
        aria-label={`Rename ${label.name}`}
        className="hover:border-input focus-visible:border-ring h-8 border-transparent bg-transparent px-2 shadow-none dark:bg-transparent"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value !== label.name && (e.stopPropagation(), setValue(label.name))}
        maxLength={80}
      />
      {changed ? (
        <Button type="submit" size="sm" disabled={busy}>
          Rename
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${label.name}`} disabled={busy} onClick={onDelete} className="text-muted-foreground hover:text-destructive">
        <Trash2 />
      </Button>
    </form>
  )
}

const FIELD_LABELS: Record<FilterCondition["field"], string> = {
  from: "From contains",
  to: "To / Cc contains",
  subject: "Subject contains",
  text: "Body contains",
  attachment: "Has attachment",
}

/** "From contains acme.com · Has attachment" → "Label Invoices, skip the inbox". */
function describeRule(rule: Rule, labels: Label[], targets: Target[]) {
  const when = rule.conditions
    .map((c) => (c.field === "attachment" ? (c.value === "false" ? "No attachment" : "Has attachment") : `${FIELD_LABELS[c.field]} “${c.value}”`))
    .join(" and ")
  const then = [
    rule.actions.labelId ? `label ${labels.find((l) => l.id === rule.actions.labelId)?.name ?? "(deleted)"}` : null,
    rule.actions.archive ? "skip the inbox" : null,
    rule.actions.forwardTargetId ? `forward to ${targets.find((t) => t.id === rule.actions.forwardTargetId)?.address ?? "(removed)"}` : null,
  ].filter(Boolean)
  return `${when} → ${then.length ? then.join(", ") : "nothing yet"}`
}

export function FiltersSection({ rules: { box, labels, rules, targets, busy, run } }: { rules: MailboxRules }) {
  const [draft, setDraft] = React.useState<ReturnType<typeof emptyRule> & { id?: string }>(emptyRule)
  const [editing, setEditing] = React.useState(false)
  React.useEffect(() => setEditing(false), [box?.id])
  if (!box) return <Loading />
  if (editing) return <FilterEditor draft={draft} setDraft={setDraft} labels={labels} targets={targets} busy={busy} onCancel={() => setEditing(false)} onSave={() => run(async () => { await api("POST", "/api/app/mail/filters", { ...draft, mailboxId: box.id }); setEditing(false) })} />
  const add = () => {
    // New filters go last, after the ones already there.
    setDraft({ ...emptyRule(), position: rules.length ? Math.max(...rules.map((r) => r.position)) + 1 : 0 })
    setEditing(true)
  }
  return (
    <div className="flex flex-col gap-3">
      <PrefHeading
        action={
          <Button variant="outline" size="sm" onClick={add}>
            <Plus /> Add filter
          </Button>
        }
      >
        {rules.length ? `${rules.length} ${rules.length === 1 ? "filter" : "filters"}, top to bottom` : "Filters"}
      </PrefHeading>
      {rules.length ? (
        <PrefList>
          {rules.map((rule) => (
            <PrefRow
              key={rule.id}
              title={<span className={cn(!rule.enabled && "text-muted-foreground")}>{rule.name}</span>}
              description={describeRule(rule, labels, targets)}
              onClick={() => {
                setDraft(rule)
                setEditing(true)
              }}
            >
              <Switch checked={rule.enabled} disabled={busy} aria-label={rule.enabled ? `Pause ${rule.name}` : `Turn on ${rule.name}`} onCheckedChange={(enabled) => run(() => api("POST", "/api/app/mail/filters", { ...rule, enabled, mailboxId: box.id }))} />
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${rule.name}`} disabled={busy} className="text-muted-foreground hover:text-destructive" onClick={() => run(() => api("DELETE", `/api/app/mail/filters?id=${rule.id}`))}>
                <Trash2 />
              </Button>
            </PrefRow>
          ))}
        </PrefList>
      ) : (
        <EmptyState variant="plain" density="compact" className="rounded-xl border border-dashed" icon={<Filter />} title="No filters yet" description="Label, archive or forward new mail automatically." />
      )}
    </div>
  )
}

type Draft = ReturnType<typeof emptyRule> & { id?: string }

function FilterEditor({ draft, setDraft, labels, targets, busy, onCancel, onSave }: { draft: Draft; setDraft: (d: Draft) => void; labels: Label[]; targets: Target[]; busy: boolean; onCancel: () => void; onSave: () => void }) {
  const confirmed = targets.filter((t) => t.verifiedAt)
  const setCondition = (i: number, c: FilterCondition) => setDraft({ ...draft, conditions: draft.conditions.map((x, n) => (n === i ? c : x)) })
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground -ml-2 self-start" onClick={onCancel}>
        <ChevronLeft /> All filters
      </Button>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="filter-name">Name</FieldLabel>
          <Input id="filter-name" autoFocus={!draft.id} placeholder="Invoices from suppliers" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={80} />
        </Field>
      </FieldGroup>

      <section className="flex flex-col gap-2">
        <PrefHeading>When every condition matches</PrefHeading>
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          {draft.conditions.map((condition, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] gap-2">
              <Choice
                value={condition.field}
                label={`Condition ${i + 1} field`}
                onChange={(value) => setCondition(i, { field: value as FilterCondition["field"], value: value === "attachment" ? "true" : "" })}
                options={Object.entries(FIELD_LABELS).map(([value, label]) => ({ value, label: value === "attachment" ? "Attachment" : label }))}
              />
              {condition.field === "attachment" ? (
                <Choice value={condition.value} label="Attachment present" onChange={(value) => setCondition(i, { ...condition, value })} options={[{ value: "true", label: "Has one" }, { value: "false", label: "Has none" }]} />
              ) : (
                <Input aria-label={`Condition ${i + 1} value`} placeholder={condition.field === "from" ? "acme.com" : condition.field === "to" ? "billing@" : "invoice"} value={condition.value} required onChange={(e) => setCondition(i, { ...condition, value: e.target.value })} />
              )}
              <Button variant="ghost" size="icon" type="button" aria-label="Remove condition" className="text-muted-foreground" disabled={draft.conditions.length === 1} onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, n) => n !== i) })}>
                <X />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground self-start" disabled={draft.conditions.length >= 10} onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: "from", value: "" }] })}>
            <Plus /> Add condition
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <PrefHeading>Then</PrefHeading>
        <PrefList>
          <PrefRow icon={Tag} title="Apply a label">
            <div className="w-48">
              <Choice value={draft.actions.labelId ?? NONE} label="Filter label" onChange={(value) => setDraft({ ...draft, actions: { ...draft.actions, labelId: value === NONE ? undefined : value } })} options={[{ value: NONE, label: labels.length ? "No label" : "No labels yet" }, ...labels.map((l) => ({ value: l.id, label: l.name }))]} />
            </div>
          </PrefRow>
          <PrefRow icon={Archive} title="Skip the inbox" description="Archive it right away.">
            <Switch checked={!!draft.actions.archive} aria-label="Skip the inbox" onCheckedChange={(v) => setDraft({ ...draft, actions: { ...draft.actions, archive: v } })} />
          </PrefRow>
          <PrefRow icon={Forward} title="Forward a copy" description={confirmed.length ? undefined : "Confirm an address under Forwarding first."}>
            <div className="w-48">
              <Choice value={draft.actions.forwardTargetId ?? NONE} label="Forwarding destination" onChange={(value) => setDraft({ ...draft, actions: { ...draft.actions, forwardTargetId: value === NONE ? undefined : value } })} options={[{ value: NONE, label: "Don't forward" }, ...confirmed.map((t) => ({ value: t.id, label: t.address }))]} />
            </div>
          </PrefRow>
        </PrefList>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
          {draft.enabled ? "On" : "Paused"}
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={busy || !draft.name.trim()}>
            {draft.id ? "Save filter" : "Create filter"}
          </Button>
        </div>
      </div>
    </form>
  )
}

export function ForwardingSection({ rules: { box, targets, busy, run, refresh } }: { rules: MailboxRules }) {
  const [target, setTarget] = React.useState("")
  if (!box) return <Loading />
  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await api("POST", "/api/app/mail/forward-targets", { mailboxId: box.id, address: target })
            setTarget("")
            toast.success("Confirmation email sent")
          })
        }}
      >
        <Field>
          <div className="flex gap-2">
            <Input aria-label="Forwarding address" type="email" placeholder="name@example.com" value={target} onChange={(e) => setTarget(e.target.value)} required />
            <Button type="submit" variant="outline" disabled={busy || !target}>
              <Send /> Send confirmation
            </Button>
          </div>
          <FieldDescription>We e-mail the address a link. Once its owner confirms, a filter can forward to it. Spam is never forwarded.</FieldDescription>
        </Field>
      </form>
      {targets.length ? (
        <PrefList>
          {targets.map((t) => (
            <PrefRow key={t.id} icon={AtSign} title={t.address}>
              {t.verifiedAt ? (
                <Badge variant="success">Confirmed</Badge>
              ) : (
                <>
                  <Badge variant="warning">Waiting for confirmation</Badge>
                  <Button variant="ghost" size="icon-sm" aria-label="Check again" className="text-muted-foreground" disabled={busy} onClick={() => run(refresh)}>
                    <RefreshCw className={cn(busy && "animate-spin")} />
                  </Button>
                </>
              )}
            </PrefRow>
          ))}
        </PrefList>
      ) : (
        <EmptyState variant="plain" density="compact" className="rounded-xl border border-dashed" icon={<Forward />} title="No forwarding addresses" description="Add one above, then pick it in a filter." />
      )}
    </div>
  )
}
export function LabelActions({threadIds,onApplied,onFilter}:{threadIds:string[];onApplied:()=>void;onFilter:(q:string)=>void}){
  const [labels,setLabels]=React.useState<Label[]>([])
  const [id,setId]=React.useState(NONE)
  const [busy,setBusy]=React.useState(false)
  React.useEffect(()=>{
    const refresh=()=>{void api<{labels:Label[]}>("GET","/api/app/mail/labels").then(r=>setLabels(r.labels)).catch(e=>toast.error(e.message))};
    refresh();window.addEventListener("mail:labels-changed",refresh);
    return ()=>window.removeEventListener("mail:labels-changed",refresh);
  },[threadIds.join(",")])
  if(!labels.length)return null
  async function apply(remove:boolean){if(id===NONE)return;setBusy(true);try{await api("PATCH","/api/app/mail/labels",{labelId:id,threadIds,remove});toast.success(remove?"Label removed":"Label applied");onApplied()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
  return <div className="flex flex-wrap items-center gap-2 border-b p-2"><Choice value={id} label="Labels" onChange={setId} options={[{value:NONE,label:"Labels"},...labels.map(l=>({value:l.id,label:l.name}))]}/>{threadIds.length?<><Button size="sm" variant="outline" disabled={busy||id===NONE} onClick={()=>apply(false)}>Apply</Button><Button size="sm" variant="ghost" disabled={busy||id===NONE} onClick={()=>apply(true)}>Remove</Button></>:<Button size="sm" variant="outline" disabled={id===NONE} onClick={()=>onFilter(`label:${id}`)}>Show</Button>}</div>
}
