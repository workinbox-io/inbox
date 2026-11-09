import * as React from "react"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Plus, X } from "lucide-react"
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
  return <p className="text-muted-foreground text-sm">Loading…</p>
}

export function StorageSection({ rules: { box } }: { rules: MailboxRules }) {
  if (!box) return <Loading />
  const used = box.storage?.usedBytes ?? 0
  const quota = box.storage?.quotaBytes ?? 10 * 1024 ** 3
  const pct = Math.min(100, (used / quota) * 100)
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div className="bg-foreground h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <p className="text-sm">
        <span className="font-medium tabular-nums">{(used / 1024 ** 3).toFixed(2)} GiB</span>
        <span className="text-muted-foreground"> of {(quota / 1024 ** 3).toFixed(1)} GiB used</span>
      </p>
      <p className="text-muted-foreground text-sm">Empty the trash and spam folders to free space.</p>
    </div>
  )
}

export function LabelsSection({ rules: { box, labels, busy, run } }: { rules: MailboxRules }) {
  const [name, setName] = React.useState("")
  if (!box) return <Loading />
  return (
    <div className="flex flex-col gap-4">
      {labels.length ? (
        <div className="divide-y rounded-lg border">
          {labels.map((label) => (
            <LabelEditor key={label.id} label={label} busy={busy} onSave={(value) => run(() => api("POST", "/api/app/mail/labels", { ...label, name: value }))} onDelete={() => run(() => api("DELETE", `/api/app/mail/labels?id=${label.id}`))} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No labels yet.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await api("POST", "/api/app/mail/labels", { mailboxId: box.id, name })
            setName("")
          })
        }}
      >
        <Field>
          <FieldLabel htmlFor="new-label">New label</FieldLabel>
          <div className="flex gap-2">
            <Input id="new-label" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            <Button disabled={busy || !name.trim()} type="submit" variant="outline">
              Add
            </Button>
          </div>
        </Field>
      </form>
    </div>
  )
}

export function FiltersSection({ rules: { box, labels, rules, targets, busy, run } }: { rules: MailboxRules }) {
  const [draft, setDraft] = React.useState<ReturnType<typeof emptyRule> & { id?: string }>(emptyRule)
  const [editing, setEditing] = React.useState(false)
  React.useEffect(() => setEditing(false), [box?.id])
  if (!box) return <Loading />
  if (editing)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await api("POST", "/api/app/mail/filters", { ...draft, mailboxId: box.id })
            setEditing(false)
          })
        }}
      >
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field>
              <FieldLabel htmlFor="filter-name">Name</FieldLabel>
              <Input id="filter-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={80} />
            </Field>
            <Field>
              <FieldLabel htmlFor="filter-priority">Priority</FieldLabel>
              <Input id="filter-priority" type="number" min={0} max={10000} value={draft.position} onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) })} />
            </Field>
          </div>
          <Field orientation="horizontal">
            <Checkbox id="filter-enabled" checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v === true })} />
            <FieldLabel htmlFor="filter-enabled">Enabled</FieldLabel>
          </Field>
          <Separator />
          <Field>
            <FieldLabel>When every condition matches</FieldLabel>
            <div className="flex flex-col gap-2">
              {draft.conditions.map((condition, i) => (
                <div key={i} className="flex gap-2">
                  <Choice
                    value={condition.field}
                    label={`Condition ${i + 1} field`}
                    onChange={(value) => setDraft({ ...draft, conditions: draft.conditions.map((c, n) => (n === i ? { field: value as FilterCondition["field"], value: value === "attachment" ? "true" : "" } : c)) })}
                    options={[
                      { value: "from", label: "From contains" },
                      { value: "to", label: "To / CC contains" },
                      { value: "subject", label: "Subject contains" },
                      { value: "text", label: "Body contains" },
                      { value: "attachment", label: "Has attachment" },
                    ]}
                  />
                  {condition.field === "attachment" ? (
                    <Choice value={condition.value} label="Attachment present" onChange={(value) => setDraft({ ...draft, conditions: draft.conditions.map((c, n) => (n === i ? { ...c, value } : c)) })} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} />
                  ) : (
                    <Input aria-label={`Condition ${i + 1} value`} value={condition.value} required onChange={(e) => setDraft({ ...draft, conditions: draft.conditions.map((c, n) => (n === i ? { ...c, value: e.target.value } : c)) })} />
                  )}
                  <Button variant="ghost" size="icon" type="button" aria-label="Remove condition" disabled={draft.conditions.length === 1} onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, n) => n !== i) })}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="self-start" disabled={draft.conditions.length >= 10} onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: "from", value: "" }] })}>
                <Plus /> Add condition
              </Button>
            </div>
          </Field>
          <Separator />
          <Field>
            <FieldLabel>Apply label</FieldLabel>
            <Choice value={draft.actions.labelId ?? NONE} label="Filter label" onChange={(value) => setDraft({ ...draft, actions: { ...draft.actions, labelId: value === NONE ? undefined : value } })} options={[{ value: NONE, label: "No label" }, ...labels.map((l) => ({ value: l.id, label: l.name }))]} />
          </Field>
          <Field>
            <FieldLabel>Forward to</FieldLabel>
            <Choice value={draft.actions.forwardTargetId ?? NONE} label="Forwarding destination" onChange={(value) => setDraft({ ...draft, actions: { ...draft.actions, forwardTargetId: value === NONE ? undefined : value } })} options={[{ value: NONE, label: "Do not forward" }, ...targets.filter((t) => t.verifiedAt).map((t) => ({ value: t.id, label: t.address }))]} />
            <FieldDescription>Only confirmed addresses (see Forwarding) are listed.</FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="filter-archive" checked={!!draft.actions.archive} onCheckedChange={(v) => setDraft({ ...draft, actions: { ...draft.actions, archive: v === true } })} />
            <FieldLabel htmlFor="filter-archive">Skip the inbox (archive)</FieldLabel>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save filter
            </Button>
          </div>
        </FieldGroup>
      </form>
    )
  return (
    <div className="flex flex-col gap-4">
      {rules.length ? (
        <div className="divide-y rounded-lg border">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
              <span className="text-muted-foreground w-6 text-xs tabular-nums">{rule.position}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{rule.name}</span>
              {rule.enabled ? null : <span className="text-muted-foreground text-xs">Paused</span>}
              <Button size="sm" variant="ghost" onClick={() => { setDraft(rule); setEditing(true) }}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api("DELETE", `/api/app/mail/filters?id=${rule.id}`))}>
                Delete
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No filters yet.</p>
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={() => { setDraft(emptyRule()); setEditing(true) }}>
        <Plus /> Add filter
      </Button>
    </div>
  )
}

export function ForwardingSection({ rules: { box, targets, busy, run, refresh } }: { rules: MailboxRules }) {
  const [target, setTarget] = React.useState("")
  if (!box) return <Loading />
  return (
    <div className="flex flex-col gap-4">
      {targets.length ? (
        <div className="divide-y rounded-lg border">
          {targets.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate">{t.address}</span>
              <span className={t.verifiedAt ? "text-xs" : "text-muted-foreground text-xs"}>{t.verifiedAt ? "Confirmed" : "Awaiting confirmation"}</span>
            </div>
          ))}
        </div>
      ) : null}
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
          <FieldLabel htmlFor="forward-address">Add a forwarding address</FieldLabel>
          <div className="flex gap-2">
            <Input id="forward-address" type="email" value={target} onChange={(e) => setTarget(e.target.value)} required />
            <Button type="submit" variant="outline" disabled={busy || !target}>
              Send confirmation
            </Button>
          </div>
          <FieldDescription>The recipient must confirm before a filter can forward mail to it. Spam is never forwarded.</FieldDescription>
        </Field>
      </form>
      {targets.some((t) => !t.verifiedAt) ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => run(refresh)} disabled={busy}>
          Refresh confirmations
        </Button>
      ) : null}
    </div>
  )
}
function LabelEditor({label,busy,onSave,onDelete}:{label:Label;busy:boolean;onSave:(name:string)=>void;onDelete:()=>void}){
  const [value,setValue]=React.useState(label.name)
  return <div className="flex items-center gap-1 p-1.5"><Input aria-label={`Label ${label.name}`} className="h-8 border-transparent shadow-none hover:border-input focus-visible:border-ring" value={value} onChange={e=>setValue(e.target.value)} maxLength={80}/>{value!==label.name?<Button variant="outline" size="sm" disabled={busy||!value.trim()} onClick={()=>onSave(value)}>Rename</Button>:null}<Button variant="ghost" size="sm" disabled={busy} onClick={onDelete}>Delete</Button></div>
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
