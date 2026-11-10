/**
 * "Attach from Drive" in the mail composer: picks drive files, fetches them and hands them to the composer's own
 * uploader, so the usual attachment rules (types, 10 MB, five files) and the outbox apply unchanged.
 */
import * as React from "react"
import { HardDrive } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { Button } from "@/components/ui/button"
import type { Attachments } from "@/components/uploads/attachments"
import { t } from "@/lib/i18n/panel"
import { DrivePicker } from "./drive-picker"

export function AttachFromDrive({ attachments }: { attachments: Attachments }) {
  const [open, setOpen] = React.useState(false)
  if (!attachments.enabled) return null
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <HardDrive /> {t("Attach from Drive")}
      </Button>
      <DrivePicker
        open={open}
        onOpenChange={setOpen}
        mode="files"
        title={t("Attach from Drive")}
        description={t("Files up to 10 MB are attached as copies.")}
        confirmLabel={t("Attach")}
        onPick={async ({ files }) => {
          try {
            const picked = await Promise.all(
              files.map(async (f) => {
                const res = await fetch(`/api/app/drive/items/${f.id}/content?download=1`)
                if (!res.ok) throw new Error(t("Couldn't open {name}", { name: f.name }))
                return new File([await res.blob()], f.name, { type: f.mediaType ?? "" })
              }),
            )
            attachments.add(picked)
          } catch (e) {
            toast.error((e as Error).message)
          }
        }}
      />
    </>
  )
}
