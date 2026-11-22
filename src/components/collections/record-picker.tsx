/**
 * Picks a record of a collection: a searchable list (title, values or the ID like TSK-12) in a popover around any
 * trigger. Used by relation fields, "Set parent…", relations and "Mark as duplicate". Collections' names and prefixes
 * come from `CollectionsMeta` (set by the app), so IDs read right for other collections too.
 */
import * as React from "react"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { api } from "@/lib/api-client"
import { formatId } from "@/lib/collections/ids"
import { t } from "@/lib/i18n/panel"
import type { CollectionRecord } from "@/lib/server/collections"

export type CollectionMeta = { id: string; name: string; prefix: string }
export const CollectionsMeta = React.createContext<CollectionMeta[]>([])

export type PickedRecord = { id: string; title: string; key: string | null; collectionId: string }

export function RecordPicker({ collectionId, exclude = [], onPick, placeholder, children, open: controlled, onOpenChange }: {
  collectionId: string
  exclude?: string[]
  onPick: (r: PickedRecord) => void
  placeholder?: string
  /** The trigger (asChild). */
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [own, setOwn] = React.useState(false)
  const open = controlled ?? own
  const setOpen = onOpenChange ?? setOwn
  const meta = React.useContext(CollectionsMeta).find((c) => c.id === collectionId)
  const [q, setQ] = React.useState("")
  const [found, setFound] = React.useState<CollectionRecord[] | null>(null)
  React.useEffect(() => {
    if (!open || !collectionId) return
    const timer = setTimeout(() => {
      api<{ records: CollectionRecord[] }>("GET", `/api/app/collections/${collectionId}/records?limit=30${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`).then((r) => setFound(r.records), () => setFound([]))
    }, q ? 200 : 0)
    return () => clearTimeout(timer)
  }, [open, q, collectionId])
  React.useEffect(() => {
    if (!open) (setQ(""), setFound(null))
  }, [open])
  const items = (found ?? []).filter((r) => !exclude.includes(r.id))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" onClick={(e) => e.stopPropagation()}>
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={placeholder ?? (meta ? t("Search {collection}…", { collection: meta.name }) : t("Search records…"))} />
          <CommandList className="max-h-72">
            <CommandEmpty>{found === null ? t("Loading…") : t("Nothing matches")}</CommandEmpty>
            {items.map((r) => {
              const key = meta ? formatId(meta.prefix, r.number) : null
              return (
                <CommandItem key={r.id} value={r.id} onSelect={() => (onPick({ id: r.id, title: r.title, key, collectionId }), setOpen(false))} className="gap-2">
                  {key ? <span className="text-muted-foreground trim-caps w-14 shrink-0 font-mono text-[11px]">{key}</span> : null}
                  <span className="truncate">{r.title}</span>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
