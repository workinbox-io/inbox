/**
 * Folders from the computer: dropped (DataTransfer entries, read recursively) or picked (<input webkitdirectory>).
 * The folders are made first, parents before children, then each file goes up through the normal uploader.
 */
import { api } from "@/lib/api-client"
import type { DriveDetail } from "./types"

export interface PickedFile {
  /** Folder names from the top of what was dropped down to the file's folder. */
  dirs: string[]
  file: File
}

/** What a drop holds: plain files and whole folders. Call during the drop event; entries go stale after it. */
export function dropEntries(data: DataTransfer): Promise<{ files: PickedFile[]; folders: string[][] }> {
  const entries = [...data.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  // Browsers without entries: just the files.
  if (!entries.length) return Promise.resolve({ files: [...data.files].map((file) => ({ dirs: [], file })), folders: [] })
  return walk(entries)
}

async function walk(entries: FileSystemEntry[]) {
  const files: PickedFile[] = []
  const folders: string[][] = []
  const visit = async (entry: FileSystemEntry, dirs: string[]): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      files.push({ dirs, file })
      return
    }
    const here = [...dirs, entry.name]
    folders.push(here)
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns a batch at a time (100 in Chrome) until it returns none.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
      if (!batch.length) break
      for (const child of batch) await visit(child, here)
    }
  }
  for (const e of entries) await visit(e, [])
  return { files, folders }
}

/** Files from <input webkitdirectory>: their webkitRelativePath holds the folders. */
export function inputEntries(list: FileList) {
  const files = [...list].map((file) => ({ dirs: file.webkitRelativePath.split("/").slice(0, -1), file }))
  const folders = [...new Map(files.flatMap((f) => f.dirs.map((_, i) => f.dirs.slice(0, i + 1))).map((d) => [d.join("/"), d])).values()]
  return { files, folders }
}

/**
 * Makes the folders under `parentId` (null = My drive) and returns where each file goes. The top folder may come back
 * renamed ("Photos (2)") if the name is taken; everything below follows it.
 */
export async function createFolders(folders: string[][], parentId: string | null) {
  const ids = new Map<string, string | null>([["", parentId]])
  for (const dirs of [...folders].sort((a, b) => a.length - b.length)) {
    const key = dirs.join("/")
    if (ids.has(key)) continue
    const parent = ids.get(dirs.slice(0, -1).join("/")) ?? parentId
    const folder = await api<DriveDetail>("POST", "/api/app/drive/items", { name: dirs.at(-1), parentId: parent })
    ids.set(key, folder.id)
  }
  return (dirs: string[]) => ids.get(dirs.join("/")) ?? parentId
}
