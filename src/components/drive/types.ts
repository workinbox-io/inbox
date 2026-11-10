/** What the drive API returns (lib/server/drive/items.ts, links.ts). Types only: nothing server-side reaches the browser. */
import type { getItem } from "@/lib/server/drive/items"

export type { DriveSummary } from "@/lib/server/drive/items"
export type { DriveLinkView } from "@/lib/server/drive/links"
export type DriveDetail = Awaited<ReturnType<typeof getItem>>
export type DriveView = "mine" | "shared" | "recent" | "trash"
export interface DriveUsage {
  used: number
  quota: number | null
}
