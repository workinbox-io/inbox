/** Small parts the drive explorer's pieces share: icons, colours, URLs, drag data and remembered preferences. */
import { File, FileArchive, FileAudio, FileImage, FileText, FileVideo, Folder, Globe, Lock, Users } from "lucide-react"
import { WORKSPACE_COLORS } from "@/components/workspace/ui"
import { previewKind } from "@/lib/drive/access"
import type { SortDir, SortKey } from "@/lib/drive/explorer"
import type { DriveSummary } from "./types"

/** Rows and tiles wear the sharing kind's colour, like mailboxes in Mail. */
export const SHARING = {
  private: { icon: Lock, label: "Only me", color: "#9ca3af" },
  people: { icon: Users, label: "Shared with people", color: WORKSPACE_COLORS[1] },
  team: { icon: Globe, label: "Everyone in the organization", color: WORKSPACE_COLORS[0] },
} as const

export function fileIcon(item: Pick<DriveSummary, "kind" | "mediaType" | "name">) {
  if (item.kind === "folder") return Folder
  const kind = previewKind(item.mediaType)
  if (kind === "image") return FileImage
  if (kind === "video") return FileVideo
  if (kind === "audio") return FileAudio
  if (kind === "pdf" || kind === "text") return FileText
  if (/\.(zip|rar|7z|tar|gz)$/i.test(item.name)) return FileArchive
  return File
}

export const contentUrl = (id: string, download = false) => `/api/app/drive/items/${id}/content${download ? "?download=1" : ""}`
export const zipUrl = (ids: string[]) => `/api/app/drive/zip?ids=${ids.join(",")}`

/** Starts a download without leaving the page. */
export function download(url: string) {
  const a = document.createElement("a")
  a.href = url
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Drag data for moving drive items inside the app (files from the computer come as "Files"). */
export const DRAG_TYPE = "application/x-workinbox-drive"
export const draggedIds = (e: React.DragEvent) => {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || "[]") as string[]
  } catch {
    return []
  }
}
export const isDriveDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE)
export const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes("Files")

export interface DrivePrefs {
  layout: "list" | "grid"
  sort: SortKey
  dir: SortDir
  details: boolean
  detailsWidth: number
}

const PREFS_KEY = "drive:prefs"
const DEFAULT_PREFS: DrivePrefs = { layout: "list", sort: "name", dir: "asc", details: true, detailsWidth: 340 }

/** Per viewer, in this browser only; the page works the same without it. */
export function readPrefs(): DrivePrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writePrefs(p: DrivePrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {}
}
