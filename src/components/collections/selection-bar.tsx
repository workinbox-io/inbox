/**
 * The board's selection, floating at the bottom: how many, a button per choice/person field (opens the field picker),
 * extra actions (`children`), delete, clear. Escape or "Clear" ends the selection.
 */
import type * as React from "react"
import { Trash2, X } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import type { CollectionField } from "@/lib/collections/fields"
import { t, tp } from "@/lib/i18n/panel"
import { FIELD_ICON } from "./values"

export function SelectionBar({ count, fields, canEdit, onField, onDelete, onClear, children }: {
  count: number
  fields: CollectionField[]
  canEdit: boolean
  onField: (field: CollectionField, anchor: DOMRect) => void
  onDelete?: () => void
  onClear: () => void
  children?: React.ReactNode
}) {
  return (
    <motion.div
      role="toolbar"
      aria-label={t("Selected records")}
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 16, opacity: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className="bg-popover absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border p-1 shadow-lg"
    >
      <span className="px-2 text-[13px] font-medium whitespace-nowrap tabular-nums">{tp(count, { one: "{n} selected", other: "{n} selected" })}</span>
      {canEdit
        ? fields.map((f) => {
            const Icon = FIELD_ICON[f.type]
            return (
              <Button key={f.id} variant="ghost" size="sm" className="h-7 shrink-0" onClick={(e) => onField(f, e.currentTarget.getBoundingClientRect())}>
                <Icon />{f.name}
              </Button>
            )
          })
        : null}
      {children}
      {canEdit && onDelete ? <Button variant="ghost" size="sm" className="text-destructive h-7 shrink-0" onClick={onDelete}><Trash2 />{t("Delete")}</Button> : null}
      <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={t("Clear selection")} title={`${t("Clear selection")} (Esc)`} onClick={onClear}><X /></Button>
    </motion.div>
  )
}
