import * as React from "react"
import { FileIcon, Loader2, Paperclip, Plus, X } from "lucide-react"

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  formatBytes,
  isImageType,
  resolveAttachmentType,
  type AttachmentInput,
} from "@/lib/uploads"
import { cn } from "@/lib/utils"

/** Shown to the user; the widget passes translations. */
export interface AttachmentLabels {
  attach: string
  remove: string
  drop: string
  tooLarge: string
  unsupported: string
  tooMany: string
  failed: string
}

export const DEFAULT_ATTACHMENT_LABELS: AttachmentLabels = {
  attach: "Attach a file",
  remove: "Remove",
  drop: "Drop files to attach",
  tooLarge: "Files can be up to 10 MB",
  unsupported: "This file type isn't supported",
  tooMany: `Up to ${ATTACHMENT_MAX_FILES} files per message`,
  failed: "Upload failed",
}

export interface PendingFile {
  id: string
  name: string
  size: number
  mediaType: string
  /** Local preview of images while (and after) uploading. */
  preview?: string
  /** 0 to 1. */
  progress: number
  status: "uploading" | "done" | "error"
  result?: AttachmentInput
  error?: string
}

/** Uploads one file; `onProgress` gets 0 to 1. Rejects with an Error carrying a readable message. */
export type UploadFn = (file: File, mediaType: string, onProgress: (fraction: number) => void) => Promise<AttachmentInput>

/** XHR (not fetch) because only XHR reports upload progress. */
export function uploadWithProgress(url: string, headers: Record<string, string>, file: File, mediaType: string, onProgress: (fraction: number) => void, failed: string) {
  return new Promise<AttachmentInput>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.setRequestHeader("Content-Type", mediaType)
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name))
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onerror = () => reject(new Error(failed))
    xhr.onload = () => {
      let data: { error?: string } & Partial<AttachmentInput> = {}
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        // Not JSON: fall through to the generic error.
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.url && data.mediaType && data.filename) resolve({ url: data.url, mediaType: data.mediaType, filename: data.filename })
      else reject(new Error(data.error ?? failed))
    }
    xhr.send(file)
  })
}

/**
 * Files attached to the message being written: validates, uploads right away with progress, and
 * hands back the finished uploads on send.
 */
export function useAttachments(upload: UploadFn | undefined, labels: AttachmentLabels = DEFAULT_ATTACHMENT_LABELS) {
  const [items, setItems] = React.useState<PendingFile[]>([])
  const itemsRef = React.useRef(items)
  itemsRef.current = items
  const labelsRef = React.useRef(labels)
  labelsRef.current = labels

  const patch = React.useCallback((id: string, next: Partial<PendingFile>) => setItems((prev) => prev.map((f) => (f.id === id ? { ...f, ...next } : f))), [])

  const add = React.useCallback(
    (files: FileList | File[]) => {
      if (!upload) return
      const l = labelsRef.current
      const room = ATTACHMENT_MAX_FILES - itemsRef.current.length
      const incoming = Array.from(files)
      const added: PendingFile[] = []
      const rejected: string[] = []
      for (const file of incoming) {
        const mediaType = resolveAttachmentType(file.type, file.name)
        if (!mediaType) rejected.push(`${file.name}: ${l.unsupported}`)
        else if (file.size > ATTACHMENT_MAX_BYTES) rejected.push(`${file.name}: ${l.tooLarge}`)
        else if (added.length >= room) rejected.push(l.tooMany)
        else {
          const id = crypto.randomUUID()
          added.push({ id, name: file.name, size: file.size, mediaType, preview: isImageType(mediaType) ? URL.createObjectURL(file) : undefined, progress: 0, status: "uploading" })
          upload(file, mediaType, (progress) => patch(id, { progress }))
            .then((result) => patch(id, { status: "done", progress: 1, result }))
            .catch((e: Error) => patch(id, { status: "error", error: e.message || l.failed }))
        }
      }
      if (added.length) setItems((prev) => [...prev, ...added])
      // Rejections surface as error chips, so they show in the widget without a toast system.
      if (rejected.length) {
        setItems((prev) => [...prev, ...[...new Set(rejected)].map((msg) => ({ id: crypto.randomUUID(), name: msg, size: 0, mediaType: "", progress: 0, status: "error" as const, error: msg }))])
      }
    },
    [upload, patch],
  )

  const remove = React.useCallback((id: string) => {
    setItems((prev) => {
      const f = prev.find((x) => x.id === id)
      if (f?.preview) URL.revokeObjectURL(f.preview)
      return prev.filter((x) => x.id !== id)
    })
  }, [])

  const clear = React.useCallback(() => {
    for (const f of itemsRef.current) if (f.preview) URL.revokeObjectURL(f.preview)
    setItems([])
  }, [])

  return {
    enabled: !!upload,
    items,
    add,
    remove,
    clear,
    uploading: items.some((f) => f.status === "uploading"),
    /** Finished uploads, in order. */
    ready: items.flatMap((f) => (f.status === "done" && f.result ? [f.result] : [])),
  }
}

export type Attachments = ReturnType<typeof useAttachments>

/** "+" button with its hidden file input. */
export function AttachButton({ attachments, label, className }: { attachments: Attachments; label: string; className?: string }) {
  const input = React.useRef<HTMLInputElement>(null)
  if (!attachments.enabled) return null
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ATTACHMENT_ACCEPT}
        aria-label={label}
        onChange={(e) => {
          if (e.currentTarget.files) attachments.add(e.currentTarget.files)
          e.currentTarget.value = ""
        }}
      />
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => input.current?.click()}
        className={cn("text-muted-foreground hover:text-foreground bg-foreground/[0.06] hover:bg-foreground/10 flex size-8 items-center justify-center rounded-full transition-colors", className)}
      >
        <Plus className="size-[18px]" />
      </button>
    </>
  )
}

/**
 * Drag & drop and paste for everything inside. Native capture listeners, so the prompt input's
 * own file handling (which would keep raw blobs) never sees these events.
 */
export function AttachmentDropZone({ attachments, label, children, className, style }: { attachments: Attachments; label: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [over, setOver] = React.useState(false)
  const add = React.useRef(attachments.add)
  add.current = attachments.add
  const enabled = attachments.enabled

  React.useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes("Files")
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setOver(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
    }
    const onLeave = (e: DragEvent) => {
      if (hasFiles(e) && --depth <= 0) {
        depth = 0
        setOver(false)
      }
    }
    const onDrop = (e: DragEvent) => {
      depth = 0
      setOver(false)
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer?.files.length) add.current(e.dataTransfer.files)
    }
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? []).flatMap((i) => (i.kind === "file" ? [i.getAsFile()!] : []))
      if (!files.length) return
      e.preventDefault()
      e.stopPropagation()
      add.current(files)
    }
    el.addEventListener("dragenter", onEnter, true)
    el.addEventListener("dragover", onOver, true)
    el.addEventListener("dragleave", onLeave, true)
    el.addEventListener("drop", onDrop, true)
    el.addEventListener("paste", onPaste, true)
    return () => {
      el.removeEventListener("dragenter", onEnter, true)
      el.removeEventListener("dragover", onOver, true)
      el.removeEventListener("dragleave", onLeave, true)
      el.removeEventListener("drop", onDrop, true)
      el.removeEventListener("paste", onPaste, true)
    }
  }, [enabled])

  return (
    <div ref={ref} className={cn("relative", className)} style={style}>
      {children}
      {over ? (
        <div className="bg-background/85 text-foreground pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed text-sm font-medium backdrop-blur-[1px]" aria-hidden>
          <Paperclip className="mr-2 size-4" />
          {label}
        </div>
      ) : null}
    </div>
  )
}

/** The files waiting to be sent: thumbnails and chips with progress. */
export function AttachmentStrip({ attachments, removeLabel, className }: { attachments: Attachments; removeLabel: string; className?: string }) {
  if (!attachments.items.length) return null
  return (
    <ul className={cn("flex flex-wrap gap-2 px-1 pb-2", className)}>
      {attachments.items.map((f) => (
        <li key={f.id} className={cn("bg-muted relative flex max-w-full items-center gap-2 overflow-hidden rounded-xl py-1.5 pr-7 pl-1.5 text-xs", f.status === "error" && "bg-destructive/10 text-destructive")}>
          {f.preview ? <img src={f.preview} alt="" className="size-8 rounded-md object-cover" /> : f.status === "error" ? null : <FileIcon className="text-muted-foreground ml-1 size-4 shrink-0" />}
          <span className="grid min-w-0">
            <span className={cn("font-medium", f.status === "error" && !f.size ? "whitespace-normal" : "max-w-40 truncate")}>{f.status === "error" && !f.size ? f.error : f.name}</span>
            {f.size ? <span className="text-muted-foreground">{f.status === "error" ? f.error : formatBytes(f.size)}</span> : null}
          </span>
          {f.status === "uploading" ? <Loader2 className="text-muted-foreground size-3.5 shrink-0 animate-spin" /> : null}
          <button type="button" onClick={() => attachments.remove(f.id)} aria-label={removeLabel} className="hover:bg-foreground/10 absolute top-1 right-1 rounded-full p-1">
            <X className="size-3" />
          </button>
          {f.status === "uploading" ? (
            <span className="bg-foreground/10 absolute inset-x-0 bottom-0 h-0.5" role="progressbar" aria-valuenow={Math.round(f.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span className="bg-primary block h-full transition-[width] duration-150" style={{ width: `${Math.max(4, f.progress * 100)}%` }} />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
