/**
 * The S / A / L picker (and the selection bar's buttons): a field's choices, labels or the people in a small searchable
 * list at a card, a button or the open record. Type to filter, arrows and Enter pick, Escape closes and gives focus
 * back. Labels (a multiselect) toggle and the list stays open; `current` then holds the labels every target has.
 */
import * as React from "react"
import { Check } from "lucide-react"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import type { CollectionField, FieldValue } from "@/lib/collections/fields"
import { t } from "@/lib/i18n/panel"
import { Chip, ChoiceView, optionColor, PersonView, type Person } from "./values"

export type PickerRequest = { field: CollectionField; anchor: DOMRect; current?: FieldValue; count: number; onPick: (v: FieldValue | null) => void }

export function FieldPicker({ request, people, onClose }: { request: PickerRequest | null; people: Person[]; onClose: () => void }) {
  const back = React.useRef<Element | null>(null)
  React.useEffect(() => {
    if (request) back.current = document.activeElement
  }, [request])
  if (!request) return null
  const { field, anchor, current, count, onPick } = request
  const multi = field.type === "multiselect"
  const pick = (v: FieldValue | null) => (onPick(v), multi ? undefined : onClose())
  const has = (v: string) => (Array.isArray(current) ? current.includes(v) : current === v)
  const options =
    field.type === "person"
      ? people.map((p) => ({ value: p.id, text: `${p.name} ${p.email}`, node: <PersonView id={p.id} people={people} /> }))
      : (field.options ?? []).map((o) => ({ value: o, text: o, node: multi ? <Chip color={optionColor(field, o)}>{o}</Chip> : <ChoiceView field={field} value={o} /> }))
  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={{ current: { getBoundingClientRect: () => anchor } }} />
      <PopoverContent
        align="start"
        className="w-60 p-0"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          ;(back.current as HTMLElement | null)?.focus?.()
        }}
      >
        <Command>
          <CommandInput placeholder={count > 1 ? t("{field} for {n} records…", { field: field.name, n: count }) : t("{field}…", { field: field.name })} />
          <CommandList className="max-h-64">
            <CommandEmpty>{t("Nothing matches")}</CommandEmpty>
            {options.map((o) => (
              <CommandItem key={o.value} value={o.text} onSelect={() => pick(o.value)} className="gap-2">
                <span className="min-w-0 flex-1 truncate">{o.node}</span>
                {has(o.value) ? <Check className="size-3.5" /> : null}
              </CommandItem>
            ))}
            <CommandItem value={`__empty ${t("Empty")} ${t("Nobody")}`} onSelect={() => (onPick(null), onClose())} className="text-muted-foreground">
              {field.type === "person" ? t("Nobody") : multi ? t("No labels") : t("Empty")}
            </CommandItem>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
