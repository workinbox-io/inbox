/**
 * A collection's automations (lib/collections/automations.ts): the rules as sentences with an on/off switch, and a
 * builder that reads like one: "When [a field] changes to [a value], then [e-mail these people | post in #channel]".
 */
import * as React from "react"
import { ArrowRight, Bell, Hash, Mail, Plus, Trash2, Zap } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { appOn } from "@/config/modules"
import { api } from "@/lib/api-client"
import { triggerText, type AutomationAction, type AutomationTrigger } from "@/lib/collections/automations"
import type { ChatChannel } from "@/lib/chat/types"
import { t } from "@/lib/i18n/panel"
import type { Automation } from "@/lib/server/collection-automations"
import type { Collection } from "@/lib/server/collections"
import { cn } from "@/lib/utils"

type Person = { id: string; name: string; email: string }
const ADDED = "__added__"
const ANY = "__any__"

export function AutomationsDialog({ collection, people, open, onOpenChange }: { collection: Collection; people: Person[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [rules, setRules] = React.useState<Automation[] | null>(null)
  const [channels, setChannels] = React.useState<ChatChannel[]>([])
  const [adding, setAdding] = React.useState(false)
  const base = `/api/app/collections/${collection.id}/automations`

  React.useEffect(() => {
    if (!open) return
    setAdding(false)
    api<{ automations: Automation[] }>("GET", base).then((r) => setRules(r.automations), (e) => toast.error((e as Error).message))
    if (appOn("chat")) api<{ channels: ChatChannel[] }>("GET", "/api/app/chat").then((r) => setChannels(r.channels.filter((c) => c.kind === "channel" && (c.joined || !c.private))), () => {})
  }, [open, base])

  const name = (id: string) => people.find((p) => p.id === id)?.name || t("Someone who left")
  const actionText = (a: AutomationAction) =>
    a.kind === "email" ? t("e-mail {people}", { people: a.userIds.map(name).join(", ") })
    : a.kind === "notify" ? t("notify {people}", { people: a.userIds.map(name).join(", ") })
    : t("post in #{channel}", { channel: channels.find((c) => c.id === a.channelId)?.name ?? t("a channel") })

  async function toggle(rule: Automation, enabled: boolean) {
    setRules((list) => list?.map((r) => (r.id === rule.id ? { ...r, enabled } : r)) ?? null)
    await api("PATCH", `${base}/${rule.id}`, { enabled }).catch((e) => {
      setRules((list) => list?.map((r) => (r.id === rule.id ? rule : r)) ?? null)
      toast.error((e as Error).message)
    })
  }

  async function remove(rule: Automation) {
    await api("DELETE", `${base}/${rule.id}`).then(() => setRules((list) => list?.filter((r) => r.id !== rule.id) ?? null), (e) => toast.error((e as Error).message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Automations")}</DialogTitle>
          <DialogDescription>{t("Let {name} tell people when records are added or change.", { name: collection.name })}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          {rules === null ? (
            <p className="text-muted-foreground text-sm">{t("Loading…")}</p>
          ) : rules.length === 0 && !adding ? (
            <div className="grid place-items-center gap-2 rounded-lg border border-dashed p-6 text-center">
              <Zap className="text-muted-foreground size-5" />
              <p className="text-sm font-medium">{t("No automations yet")}</p>
              <p className="text-muted-foreground max-w-sm text-xs">{t("For example: when Status changes to Low, e-mail purchasing; when a deal is Won, post in #sales.")}</p>
            </div>
          ) : (
            <ul className="grid gap-2">
              {rules.map((r) => (
                <li key={r.id} className={cn("flex items-center gap-3 rounded-lg border p-3", !r.enabled && "opacity-60")}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    {r.action.kind === "email" ? <Mail className="size-4" /> : r.action.kind === "notify" ? <Bell className="size-4" /> : <Hash className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{t(triggerText(r.trigger, collection.fields))}</span>
                    <ArrowRight className="text-muted-foreground mx-1.5 inline size-3.5" />
                    <span className="text-muted-foreground">{actionText(r.action)}</span>
                  </span>
                  <Switch checked={r.enabled} onCheckedChange={(on) => void toggle(r, on)} aria-label={t("On")} />
                  <Button variant="ghost" size="icon-sm" aria-label={t("Delete")} onClick={() => void remove(r)}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
          {adding ? (
            <RuleBuilder collection={collection} people={people} channels={channels} onCancel={() => setAdding(false)}
              onAdd={async (trigger, action) => {
                const rule = await api<Automation>("POST", base, { trigger, action })
                setRules((list) => [...(list ?? []), rule])
                setAdding(false)
                toast.success(t("Automation added"))
              }} />
          ) : (
            <Button variant="outline" className="justify-self-start" onClick={() => setAdding(true)} disabled={rules === null}><Plus /> {t("Add automation")}</Button>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function RuleBuilder({ collection, people, channels, onCancel, onAdd }: {
  collection: Collection
  people: Person[]
  channels: ChatChannel[]
  onCancel: () => void
  onAdd: (trigger: AutomationTrigger, action: AutomationAction) => Promise<void>
}) {
  const [when, setWhen] = React.useState<string>(collection.fields.find((f) => f.type === "select")?.id ?? ADDED)
  const field = collection.fields.find((f) => f.id === when)
  const [value, setValue] = React.useState<string>(field?.options?.[0] ?? ANY)
  const [kind, setKind] = React.useState<"notify" | "email" | "chat">("notify")
  const [userIds, setUserIds] = React.useState<string[]>([])
  const [channelId, setChannelId] = React.useState(channels[0]?.id ?? "")
  const [busy, setBusy] = React.useState(false)
  const values = field?.type === "select" ? (field.options ?? []).map((o) => ({ v: o, label: o })) : field?.type === "checkbox" ? [{ v: "true", label: t("checked") }, { v: "false", label: t("unchecked") }] : []
  const ready = kind === "chat" ? !!channelId : userIds.length > 0

  async function add() {
    setBusy(true)
    try {
      const trigger: AutomationTrigger = when === ADDED ? { on: "created" } : { on: "changed", field: when, value: value === ANY ? null : value }
      await onAdd(trigger, kind === "chat" ? { kind, channelId } : { kind, userIds })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const label = "text-muted-foreground w-12 shrink-0 text-xs font-medium tracking-wide uppercase"
  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={label}>{t("When")}</span>
        <Select value={when} onValueChange={(w) => { setWhen(w); const f = collection.fields.find((x) => x.id === w); setValue(f?.type === "select" ? (f.options?.[0] ?? ANY) : f?.type === "checkbox" ? "true" : ANY) }}>
          <SelectTrigger size="sm" className="min-w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ADDED}>{t("a record is added")}</SelectItem>
            {collection.fields.map((f) => <SelectItem key={f.id} value={f.id}>{t("{field} changes", { field: f.name })}</SelectItem>)}
          </SelectContent>
        </Select>
        {field ? (
          <>
            <span className="text-muted-foreground text-sm">{t("to")}</span>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger size="sm" className="min-w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {values.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
                {field.type !== "checkbox" ? <SelectItem value={ANY}>{t("any value")}</SelectItem> : null}
              </SelectContent>
            </Select>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <span className={cn(label, "pt-1.5")}>{t("Then")}</span>
        <div className="grid min-w-0 flex-1 gap-3">
          <SegmentedControl<"notify" | "email" | "chat">
            size="sm"
            value={kind}
            onValueChange={setKind}
            className="justify-self-start"
            options={[
              { value: "notify", label: <span className="flex items-center gap-1.5"><Bell className="size-3.5" />{t("Notify")}</span> },
              { value: "email", label: <span className="flex items-center gap-1.5"><Mail className="size-3.5" />{t("E-mail")}</span> },
              ...(channels.length ? [{ value: "chat" as const, label: <span className="flex items-center gap-1.5"><Hash className="size-3.5" />{t("Post in a channel")}</span> }] : []),
            ]}
          />
          {kind !== "chat" ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={kind === "email" ? t("People to e-mail") : t("People to notify")}>
              {people.map((p) => {
                const on = userIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setUserIds((ids) => (on ? ids.filter((id) => id !== p.id) : [...ids, p.id]))}
                    className={cn("flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs transition-colors", on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent/50")}
                  >
                    <UserAvatar seed={p.email} size={20} />
                    {p.name || p.email}
                  </button>
                )
              })}
            </div>
          ) : (
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger size="sm" className="min-w-48 justify-self-start"><SelectValue /></SelectTrigger>
              <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t("Cancel")}</Button>
        <Button size="sm" onClick={() => void add()} disabled={!ready || busy}><Zap /> {t("Add")}</Button>
      </div>
    </div>
  )
}
