/** Block changes shared by the "/" menu and the toolbar, and image uploads for notes. */
import { toggleCodeBlock } from "@platejs/code-block"
import { toggleList } from "@platejs/list"
import { TablePlugin } from "@platejs/table/react"
import { Code2, Heading1, Heading2, Heading3, ImageIcon, List, ListOrdered, Minus, Pilcrow, Quote, Square, Table, type LucideIcon } from "lucide-react"
import { KEYS } from "platejs"
import type { PlateEditor } from "platejs/react"

const LIST_TYPES: Record<string, string> = { [KEYS.ul]: "disc", [KEYS.ol]: "decimal", [KEYS.listTodo]: "todo" }

/** Turns the current block into `type` (a heading, quote, code block, list…), or back into a paragraph. */
export function setBlockType(editor: PlateEditor, type: string) {
  editor.tf.withoutNormalizing(() => {
    const listStyleType = LIST_TYPES[type]
    if (listStyleType) {
      toggleList(editor, { listStyleType })
      return
    }
    // Leaving a list: drop the list props first.
    const block = editor.api.block()
    if (block?.[0].listStyleType) editor.tf.unsetNodes(["listStyleType", "indent", "checked"], { at: block[1] })
    if (type === KEYS.codeBlock) toggleCodeBlock(editor)
    else editor.tf.toggleBlock(type)
  })
}

/** Inserts a block below the current one (tables, rules, images) or turns the empty current block into it. */
export function insertBlock(editor: PlateEditor, type: string) {
  if (type === KEYS.table) editor.getTransforms(TablePlugin).insert.table({ colCount: 3, rowCount: 3, header: true }, { select: true })
  else if (type === KEYS.hr) {
    editor.tf.insertNodes({ type: KEYS.hr, children: [{ text: "" }] })
    editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { select: true })
  } else if (type === KEYS.img) pickImage(editor)
  else setBlockType(editor, type)
}

export interface SlashItem {
  icon: LucideIcon
  value: string
  label: string
  keywords?: string[]
  onSelect: (editor: PlateEditor, value: string) => void
}

const item = (icon: LucideIcon, value: string, label: string, keywords: string[] = []): SlashItem => ({
  icon,
  value,
  label,
  keywords,
  onSelect: insertBlock,
})

export const SLASH_GROUPS: { group: string; items: SlashItem[] }[] = [
  {
    group: "Basic blocks",
    items: [
      item(Pilcrow, KEYS.p, "Text", ["paragraph"]),
      item(Heading1, KEYS.h1, "Heading 1", ["title", "h1"]),
      item(Heading2, KEYS.h2, "Heading 2", ["subtitle", "h2"]),
      item(Heading3, KEYS.h3, "Heading 3", ["h3"]),
      item(List, KEYS.ul, "Bulleted list", ["unordered", "ul", "-"]),
      item(ListOrdered, KEYS.ol, "Numbered list", ["ordered", "ol", "1"]),
      item(Square, KEYS.listTodo, "To-do list", ["checklist", "task", "checkbox", "[]"]),
      item(Quote, KEYS.blockquote, "Quote", ["blockquote", "citation", ">"]),
      item(Code2, KEYS.codeBlock, "Code block", ["```", "code"]),
    ],
  },
  {
    group: "Insert",
    items: [
      item(Table, KEYS.table, "Table", ["grid"]),
      item(ImageIcon, KEYS.img, "Image", ["picture", "photo", "upload"]),
      item(Minus, KEYS.hr, "Divider", ["hr", "rule", "---"]),
    ],
  },
]

/** Uploads an image to the org's files (POST /api/app/attachments) and returns its URL. */
export async function uploadImage(file: Blob, filename: string): Promise<string> {
  const res = await fetch("/api/app/attachments", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", "X-Filename": encodeURIComponent(filename) },
    body: file,
  })
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed")
  return data.url
}

/** Plate hands pasted and dropped images over as data URLs; upload them instead of storing the bytes in the note. */
export async function uploadDataUrl(dataUrl: ArrayBuffer | string): Promise<string> {
  if (typeof dataUrl !== "string") throw new Error("Unsupported image")
  const blob = await (await fetch(dataUrl)).blob()
  const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png"
  return uploadImage(blob, `image.${ext}`)
}

/** Opens a file picker and inserts the chosen image. */
export function pickImage(editor: PlateEditor) {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = "image/png,image/jpeg,image/gif,image/webp"
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const url = await uploadImage(file, file.name)
      editor.tf.insertNodes({ type: KEYS.img, url, children: [{ text: "" }] }, { select: true })
    } catch (e) {
      const { toast } = await import("@yusufceng1z/ding-react")
      toast.error((e as Error).message)
    }
  }
  input.click()
}
