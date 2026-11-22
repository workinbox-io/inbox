/**
 * Peek (Space on a hovered or focused card or row, like Linear): the record's ID, title, filled fields and description
 * in a dialog, read-only, without leaving the list. Space or Escape closes it, Enter opens the record.
 */
import * as React from "react"
import type { Value } from "platejs"
import { MailEditor } from "@/components/mailbox/mail-editor"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import type { Collection, CollectionRecord } from "@/lib/server/collections"
import { FIELD_ICON, ValueView, type Person } from "./values"

export function Peek({ collection, record, people, idOf, onClose, onOpen }: {
  collection: Collection
  record: CollectionRecord | null
  people: Person[]
  idOf: (r: CollectionRecord) => string | null
  onClose: () => void
  onOpen: (r: CollectionRecord) => void
}) {
  const [doc, setDoc] = React.useState<Value | null | undefined>(undefined)
  React.useEffect(() => {
    setDoc(undefined)
    if (!record) return
    api<CollectionRecord>("GET", `/api/app/collections/${collection.id}/records/${record.id}`).then((r) => setDoc((r.description as Value | null) ?? null), () => setDoc(null))
  }, [record?.id, collection.id])
  if (!record) return null
  const filled = collection.fields.filter((f) => record.values[f.id] !== undefined)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[80svh] overflow-y-auto sm:max-w-2xl"
        onKeyDown={(e) => {
          if (e.key === " " && !(e.target as HTMLElement).closest("[contenteditable],input,textarea")) (e.preventDefault(), onClose())
          if (e.key === "Enter") (e.preventDefault(), onOpen(record))
        }}
      >
        <p className="text-muted-foreground font-mono text-xs">{idOf(record)}</p>
        <DialogTitle className="text-xl leading-tight">{record.title}</DialogTitle>
        <DialogDescription className="sr-only">{t("A quick look at the record")}</DialogDescription>
        {filled.length ? (
          <dl className="grid grid-cols-[minmax(7rem,30%)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            {filled.map((f) => {
              const Icon = FIELD_ICON[f.type]
              return (
                <React.Fragment key={f.id}>
                  <dt className="text-muted-foreground flex items-center gap-2"><Icon className="size-3.5" />{f.name}</dt>
                  <dd className="min-w-0"><ValueView field={f} value={record.values[f.id]} people={people} /></dd>
                </React.Fragment>
              )
            })}
          </dl>
        ) : null}
        {doc === undefined ? <div className="h-16" /> : doc ? (
          <div className="border-t pt-3">
            <MailEditor initial={doc} initialText="" label={t("Description")} readOnly className="text-[14px] leading-6" onChange={() => {}} />
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs"><Kbd>Space</Kbd> {t("closes")} <Kbd>↵</Kbd> {t("opens")}</span>
          <Button size="sm" onClick={() => onOpen(record)}>{t("Open")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
