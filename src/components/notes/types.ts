/** Shapes of /api/app/notes responses (lib/server/notes/notes.ts). */
export type Sharing = "private" | "people" | "team"
export type NoteRole = "owner" | "edit" | "view"
export type NoteView = "all" | "mine" | "shared" | "pinned" | "archived"

export interface NoteSummary {
  id: string
  title: string
  icon: string | null
  folderId: string | null
  sharing: Sharing
  pinned: boolean
  archived: boolean
  preview: string
  ownerId: string | null
  role: NoteRole
  updatedAt: string
}

export interface NoteDetail extends NoteSummary {
  teamRole: "view" | "edit"
  canManage: boolean
  markdown: string
  /** The saved Plate document (shown until the live one syncs). */
  value: import("platejs").Value
  people: { userId: string; role: "view" | "edit"; name: string; email: string }[]
  createdAt: string
}

export interface NoteFolder {
  id: string
  name: string
}
