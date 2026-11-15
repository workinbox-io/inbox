/**
 * The file viewer every app opens (Drive's Quick look, mail attachments, chat files), laid out like Google's: full screen
 * on a dark backdrop, the file's name and actions on top, big arrows at the edges for the other files, zoom for images,
 * text as a page, and a "no preview" card with Download for the rest. ← → step, + − 0 zoom, Esc closes.
 */
import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { ChevronLeft, ChevronRight, Download, File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Loader2, Minus, Plus, Presentation, X } from "lucide-react"
import { parseCsv } from "@/lib/csv"
import { previewKind } from "@/lib/drive/access"
import { t } from "@/lib/i18n/panel"
import { formatBytes } from "@/lib/uploads"
import { cn } from "@/lib/utils"

export interface ViewerFile {
  /** Unique within the list. */
  id: string
  name: string
  mediaType: string
  size?: number
  /** Shown inline. */
  url: string
  /** Saved instead (defaults to `url` with the download attribute). */
  downloadUrl?: string
}

const ZOOMS = [1, 1.5, 2, 3, 4]
/** Text is read in the browser; past this it's a download. */
const TEXT_LIMIT = 256 * 1024

type FileFamily = "pdf" | "sheet" | "doc" | "slides" | "image" | "video" | "audio" | "archive" | "other"

/** The family a file belongs to, by type and then by extension (attachments often come as octet-stream). */
export function fileFamily(file: Pick<ViewerFile, "mediaType" | "name">): FileFamily {
  const type = file.mediaType.toLowerCase()
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (type === "application/pdf" || ext === "pdf") return "pdf"
  if (/csv|spreadsheet|ms-excel/.test(type) || ["csv", "xls", "xlsx", "ods", "numbers"].includes(ext)) return "sheet"
  if (/presentation|powerpoint/.test(type) || ["ppt", "pptx", "odp", "key"].includes(ext)) return "slides"
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("video/")) return "video"
  if (type.startsWith("audio/")) return "audio"
  if (/zip|compressed|tar|rar|7z/.test(type) || ["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive"
  if (/word|text\/|rtf|opendocument\.text/.test(type) || ["doc", "docx", "txt", "md", "rtf", "odt", "pages"].includes(ext)) return "doc"
  return "other"
}

/** Icon and colour per family, like Google's: red PDF, green sheets, blue documents, yellow slides. */
const FAMILY: Record<FileFamily, { icon: typeof File; tone: string }> = {
  pdf: { icon: FileText, tone: "bg-red-500/12 text-red-600 dark:text-red-400" },
  sheet: { icon: FileSpreadsheet, tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
  doc: { icon: FileText, tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400" },
  slides: { icon: Presentation, tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  image: { icon: FileImage, tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  video: { icon: FileVideo, tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  audio: { icon: FileAudio, tone: "bg-orange-500/12 text-orange-600 dark:text-orange-400" },
  archive: { icon: FileArchive, tone: "bg-muted text-muted-foreground" },
  other: { icon: File, tone: "bg-muted text-muted-foreground" },
}

const iconFor = (file: Pick<ViewerFile, "mediaType" | "name">) => FAMILY[fileFamily(file)].icon

/** The coloured file-type tile for attachment cards (mail, chat). */
export function FileBadge({ file, className }: { file: Pick<ViewerFile, "mediaType" | "name">; className?: string }) {
  const { icon: Icon, tone } = FAMILY[fileFamily(file)]
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-md", tone, className)}>
      <Icon className="size-[18px]" />
    </span>
  )
}

const extension = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase() : "")

/** A round dark button for the viewer's chrome. */
function ChromeButton({ label, onClick, children, className, href, download }: { label: string; onClick?: () => void; children: React.ReactNode; className?: string; href?: string; download?: string }) {
  const cls = cn(
    "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors outline-none hover:bg-white/12 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40 [&_svg]:size-[18px]",
    className,
  )
  return href ? (
    <a href={href} download={download} aria-label={label} title={label} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cls}>
      {children}
    </button>
  )
}

function TextPage({ url, csv }: { url: string; csv?: boolean }) {
  const [text, setText] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    setText(null)
    fetch(url, { headers: { Range: `bytes=0-${TEXT_LIMIT - 1}` } })
      .then((r) => r.text())
      .then((s) => live && setText(s.slice(0, TEXT_LIMIT)))
      .catch(() => live && setText(""))
    return () => {
      live = false
    }
  }, [url])
  const rows = csv && text ? parseCsv(text) : null
  if (rows && rows.length) {
    const width = Math.max(...rows.map((r) => r.length))
    return (
      // A sheet, like Google's preview of a CSV: the first row as the header, row numbers on the left.
      <div className="h-full w-full overflow-auto px-2 py-4 sm:px-6" onClick={(e) => e.stopPropagation()}>
        <table className="mx-auto border-separate border-spacing-0 bg-white text-[13px] text-neutral-900 shadow-2xl">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 border-r border-b border-neutral-200 bg-neutral-100 px-2" />
              {Array.from({ length: width }, (_, i) => (
                <th key={i} className="border-r border-b border-neutral-200 bg-neutral-100 px-3 py-1.5 text-left font-semibold whitespace-nowrap">
                  {rows[0]![i] ?? ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r, n) => (
              <tr key={n} className="hover:bg-blue-50">
                <td className="sticky left-0 border-r border-b border-neutral-200 bg-neutral-50 px-2 text-right text-[11px] text-neutral-500 tabular-nums">{n + 2}</td>
                {Array.from({ length: width }, (_, i) => (
                  <td key={i} className={cn("max-w-80 truncate border-r border-b border-neutral-200 px-3 py-1", /^-?[\d\s.,]+%?$/.test(r[i] ?? "") && "text-right tabular-nums")} title={r[i]}>
                    {r[i] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div className="h-full w-full overflow-auto px-4 py-6" onClick={(e) => e.stopPropagation()}>
      <article className="mx-auto min-h-full max-w-3xl rounded-sm bg-white px-8 py-10 text-neutral-900 shadow-2xl sm:px-14 sm:py-14">
        {text === null ? <Spinner dark /> : <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{text || t("This file is empty.")}</pre>}
      </article>
    </div>
  )
}

function Spinner({ dark }: { dark?: boolean }) {
  return <Loader2 className={cn("mx-auto size-6 animate-spin", dark ? "text-neutral-400" : "text-white/60")} aria-label={t("Loading…")} />
}

function ImageStage({ file, zoom, setZoom }: { file: ViewerFile; zoom: number; setZoom: (z: number) => void }) {
  const [loaded, setLoaded] = React.useState(false)
  const [fit, setFit] = React.useState<number | null>(null)
  const img = React.useRef<HTMLImageElement>(null)
  const box = React.useRef<HTMLDivElement>(null)
  // Zoom from the middle, like Google's viewer, not from the top-left corner.
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el || zoom === 1) return
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
  }, [zoom])
  return (
    <div ref={box} className={cn("flex h-full w-full", zoom === 1 ? "items-center justify-center p-4 sm:p-10" : "overflow-auto")} onClick={(e) => e.stopPropagation()}>
      {!loaded ? <Spinner /> : null}
      <img
        ref={img}
        src={file.url}
        alt={file.name}
        draggable={false}
        onLoad={() => {
          setLoaded(true)
          setFit(img.current?.clientWidth ?? null)
        }}
        onClick={() => setZoom(zoom === 1 ? 2 : 1)}
        style={zoom !== 1 && fit ? { width: fit * zoom, maxWidth: "none", maxHeight: "none" } : undefined}
        className={cn(
          "shrink-0 select-none object-contain shadow-2xl transition-opacity duration-200",
          zoom === 1 ? "max-h-full max-w-full cursor-zoom-in" : "m-auto cursor-zoom-out",
          loaded ? "opacity-100" : "absolute opacity-0",
        )}
      />
    </div>
  )
}

function NoPreview({ file, download }: { file: ViewerFile; download: React.ReactNode }) {
  const Icon = iconFor(file)
  return (
    <div className="flex w-full max-w-sm flex-col items-center rounded-2xl bg-neutral-800/90 px-8 py-10 text-center shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
      <span className="relative grid size-16 place-items-center rounded-xl bg-white/8">
        <Icon className="size-8 text-white/80" strokeWidth={1.5} />
        {extension(file.name) ? <span className="absolute -bottom-2 rounded bg-white px-1.5 text-[10px] font-bold tracking-wide text-neutral-900">{extension(file.name)}</span> : null}
      </span>
      <p className="mt-6 text-[15px] font-medium text-white">{t("No preview available")}</p>
      <p className="mt-1 max-w-full truncate text-sm text-white/60">
        {file.name}
        {file.size ? ` · ${formatBytes(file.size)}` : ""}
      </p>
      <div className="mt-6">{download}</div>
    </div>
  )
}

export function FileViewer({
  files,
  index,
  onIndexChange,
  onClose,
  subtitle,
  actions,
}: {
  files: ViewerFile[]
  /** The open file; null closes the viewer. */
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
  /** Under the name: who sent it, where it lives… */
  subtitle?: (file: ViewerFile) => React.ReactNode
  /** Extra buttons before Download (Save to Drive, Share…): use `ViewerAction`. */
  actions?: (file: ViewerFile) => React.ReactNode
}) {
  const file = index === null ? undefined : files[index]
  const [zoom, setZoom] = React.useState(1)
  const many = files.length > 1
  const step = React.useCallback(
    (d: number) => {
      if (index === null || !many) return
      onIndexChange((index + d + files.length) % files.length)
    },
    [index, many, files.length, onIndexChange],
  )
  React.useEffect(() => setZoom(1), [file?.id])

  const kind = file ? previewKind(file.mediaType) : null
  const tooLarge = kind === "text" && (file?.size ?? 0) > 5 * 1024 * 1024
  const shown = tooLarge ? null : kind

  React.useEffect(() => {
    if (!file) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLMediaElement) return
      if (e.key === "ArrowRight") step(1)
      else if (e.key === "ArrowLeft") step(-1)
      else if (shown === "image" && (e.key === "+" || e.key === "=")) setZoom((z) => ZOOMS.find((x) => x > z) ?? z)
      else if (shown === "image" && e.key === "-") setZoom((z) => [...ZOOMS].reverse().find((x) => x < z) ?? z)
      else if (shown === "image" && e.key === "0") setZoom(1)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [file, step, shown])

  const Icon = file ? iconFor(file) : File
  const downloadButton = file ? (
    <a
      href={file.downloadUrl ?? file.url}
      download={file.downloadUrl ? undefined : file.name}
      className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-neutral-900 transition-colors hover:bg-white/90"
    >
      <Download className="size-4" /> {t("Download")}
    </a>
  ) : null

  return (
    <DialogPrimitive.Root open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] fixed inset-0 z-50 flex flex-col text-white outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {file ? (
            <>
              <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-2 sm:px-3">
                <ChromeButton label={t("Close (Esc)")} onClick={onClose}>
                  <X />
                </ChromeButton>
                <Icon className="ml-1 size-5 shrink-0 text-white/70" />
                <div className="min-w-0 flex-1 leading-tight">
                  <DialogPrimitive.Title className="truncate text-sm font-medium">{file.name}</DialogPrimitive.Title>
                  <p className="truncate text-xs text-white/55">
                    {[subtitle?.(file), file.size ? formatBytes(file.size) : null, many ? `${index! + 1} / ${files.length}` : null].filter(Boolean).map((x, i) => (
                      <React.Fragment key={i}>
                        {i ? " · " : null}
                        {x}
                      </React.Fragment>
                    ))}
                  </p>
                </div>
                {actions?.(file)}
                <ChromeButton label={t("Download")} href={file.downloadUrl ?? file.url} download={file.downloadUrl ? undefined : file.name}>
                  <Download />
                </ChromeButton>
              </header>

              {/* A click on the backdrop (not the file) closes, like Google's viewer. */}
              <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={onClose}>
                {shown === "image" ? (
                  <ImageStage key={file.id} file={file} zoom={zoom} setZoom={setZoom} />
                ) : shown === "pdf" ? (
                  <iframe key={file.id} src={file.url} title={file.name} className="h-full w-full max-w-5xl bg-white shadow-2xl sm:h-[calc(100%-1.5rem)] sm:rounded-sm" onClick={(e) => e.stopPropagation()} />
                ) : shown === "video" ? (
                  <video key={file.id} src={file.url} controls autoPlay className="max-h-full max-w-full shadow-2xl sm:max-h-[calc(100%-2.5rem)]" onClick={(e) => e.stopPropagation()} />
                ) : shown === "audio" ? (
                  <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-neutral-800/90 p-8 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
                    <span className="grid size-20 place-items-center rounded-full bg-white/8">
                      <FileAudio className="size-9 text-white/80" strokeWidth={1.5} />
                    </span>
                    <audio key={file.id} src={file.url} controls autoPlay className="w-full" />
                  </div>
                ) : shown === "text" ? (
                  <TextPage key={file.id} url={file.url} csv={fileFamily(file) === "sheet"} />
                ) : (
                  <NoPreview file={file} download={downloadButton} />
                )}

                {many ? (
                  <>
                    <ChromeButton label={t("Previous (←)")} onClick={() => step(-1)} className="absolute top-1/2 left-2 size-11 -translate-y-1/2 bg-black/40 sm:left-4 sm:size-12 [&_svg]:size-6">
                      <ChevronLeft />
                    </ChromeButton>
                    <ChromeButton label={t("Next (→)")} onClick={() => step(1)} className="absolute top-1/2 right-2 size-11 -translate-y-1/2 bg-black/40 sm:right-4 sm:size-12 [&_svg]:size-6">
                      <ChevronRight />
                    </ChromeButton>
                  </>
                ) : null}
              </div>

              {shown === "image" ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
                  <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-neutral-800/95 p-1 shadow-xl ring-1 ring-white/10">
                    <ChromeButton label={t("Zoom out (−)")} onClick={() => setZoom([...ZOOMS].reverse().find((x) => x < zoom) ?? zoom)} className="size-8">
                      <Minus />
                    </ChromeButton>
                    <button type="button" onClick={() => setZoom(1)} className="min-w-14 rounded-full px-2 text-center text-xs font-medium tabular-nums text-white/85 hover:text-white" title={t("Fit to screen (0)")}>
                      {zoom === 1 ? t("Fit") : `${Math.round(zoom * 100)}%`}
                    </button>
                    <ChromeButton label={t("Zoom in (+)")} onClick={() => setZoom(ZOOMS.find((x) => x > zoom) ?? zoom)} className="size-8">
                      <Plus />
                    </ChromeButton>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** A round button for the viewer's header, for `actions`. */
export const ViewerAction = ChromeButton
