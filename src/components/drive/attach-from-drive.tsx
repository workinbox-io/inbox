/**
 * One attachment menu for computer and Drive files. Drive copies use the same uploader,
 * attachment limits and outbox as files from the computer.
 */
import { appOn } from "@/config/modules"
import * as React from "react"
import { ChevronDown, HardDrive, Laptop, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Attachments } from "@/components/uploads/attachments"
import { t } from "@/lib/i18n/panel"
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, resolveAttachmentType } from "@/lib/uploads"
import { DrivePicker } from "./drive-picker"
import { task } from "./task"

export function MailAttachmentMenu({ attachments }: { attachments: Attachments }) {
  const [open, setOpen] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  if (!attachments.enabled) return null
  return (
    <>
      <input ref={input} type="file" multiple hidden accept={ATTACHMENT_ACCEPT} aria-label={t("Attach from computer")} onChange={(e) => {
        if (e.currentTarget.files) attachments.add(e.currentTarget.files)
        e.currentTarget.value = ""
      }} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label={t("Attach files")} title={t("Attach files")}>
            <Paperclip data-icon="inline-start" /><span className="hidden sm:inline">{t("Attach")}</span><ChevronDown data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" onCloseAutoFocus={(e) => { if (open) e.preventDefault() }}>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => input.current?.click()}><Laptop />{t("From computer")}</DropdownMenuItem>
            {appOn("drive") ? <DropdownMenuItem onSelect={() => setOpen(true)}><HardDrive />{t("From Drive")}</DropdownMenuItem> : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DrivePicker
        open={open}
        onOpenChange={setOpen}
        mode="files"
        title={t("Attach from Drive")}
        description={t("Files up to 10 MB are attached as copies.")}
        confirmLabel={t("Attach")}
        // The composer's own rules, shown up front instead of as error chips after the download.
        blocked={(f) => (f.size > ATTACHMENT_MAX_BYTES ? t("Over 10 MB") : resolveAttachmentType(f.mediaType, f.name) ? null : t("This file type can't be attached"))}
        max={Math.max(0, ATTACHMENT_MAX_FILES - attachments.items.length)}
        onPick={async ({ files }) => {
          const job = task(files.length === 1 ? t("Attaching {name}…", { name: files[0]!.name }) : t("Attaching {count} files…", { count: files.length }), { progress: true })
          let loaded = 0
          try {
            const picked = await Promise.all(
              files.map(async (f) => {
                const res = await fetch(`/api/app/drive/items/${f.id}/content?download=1`)
                if (!res.ok) throw new Error(t("Couldn't open {name}", { name: f.name }))
                const file = new File([await res.blob()], f.name, { type: f.mediaType ?? "" })
                job.progress(++loaded / files.length)
                return file
              }),
            )
            // The composer's strip takes over from here (its own upload progress).
            job.dismiss()
            attachments.add(picked)
          } catch (e) {
            job.fail((e as Error).message)
          }
        }}
      />
    </>
  )
}
