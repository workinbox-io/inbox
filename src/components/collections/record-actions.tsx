/**
 * A record's actions, defined once for cards (right-click, "…"), list and table rows, the selection and ⌘K: open, peek,
 * set any choice, label or person field (submenus, the current value ticked), cycle, parent, copy link / ID / git
 * branch name, repeat, save as template, move to the trash (undo from the toast or ⌘Z). With several records (the
 * selection) every change applies to all of them. Copying is shared with the ⌘⇧C, ⌘. and ⌘⇧. shortcuts.
 */
import { Check, Copy, ExternalLink, Eye, FileStack, GitBranch, Hash, IterationCw, Link2, Network, Repeat, Trash2, UserX } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import type { CollectionField, FieldValue } from "@/lib/collections/fields"
import { t, tp } from "@/lib/i18n/panel"
import type { CollectionRecord } from "@/lib/server/collections"
import { FIELD_ICON, type Person } from "./values"

export const recordLink = (r: CollectionRecord) => `${location.origin}/app/open/record/${r.id}`

/** "tas-12-landing-page-copy", for a git branch. */
export function branchName(id: string | null, title: string) {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return [id?.toLowerCase(), slug].filter(Boolean).join("-").slice(0, 60).replace(/-+$/, "")
}

export async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.error(t("Couldn't copy."))
  }
}

/** The values every target shares for a field, or undefined when they differ. */
const shared = (targets: CollectionRecord[], id: string) => {
  const v = targets[0]?.values[id]
  return targets.every((r) => JSON.stringify(r.values[id]) === JSON.stringify(v)) ? v : undefined
}

export type CycleOption = { n: number; label: string }

export function recordActions({ targets, fields, people, canEdit, idOf, onOpen, onPeek, onPatch, onToggleLabel, onDelete, cycles, onCycle, onParent, onRepeat, onTemplate }: {
  targets: CollectionRecord[]
  fields: CollectionField[]
  people: Person[]
  canEdit: boolean
  /** "TSK-12", when the collection numbers its records. */
  idOf?: (r: CollectionRecord) => string | null
  onOpen: (r: CollectionRecord) => void
  onPeek?: (r: CollectionRecord) => void
  onPatch: (targets: CollectionRecord[], values: Record<string, FieldValue | null>) => void
  /** A label on or off for every target (on unless all have it). */
  onToggleLabel?: (targets: CollectionRecord[], field: CollectionField, label: string) => void
  onDelete: (targets: CollectionRecord[]) => void | Promise<void>
  /** The collection's cycles (current and the next ones), when it has them. */
  cycles?: CycleOption[]
  onCycle?: (targets: CollectionRecord[], n: number | null) => void
  onParent?: (r: CollectionRecord) => void
  onRepeat?: (r: CollectionRecord) => void
  onTemplate?: (r: CollectionRecord) => void
}): MenuAction[] {
  const one = targets.length === 1 ? targets[0]! : null
  const set = (f: CollectionField, v: FieldValue | null) => () => onPatch(targets, { [f.id]: v })
  const fieldMenus: MenuAction[] = canEdit
    ? fields
        .filter((f) => f.type === "select" || f.type === "person" || f.type === "multiselect")
        .map((f) => {
          const now = shared(targets, f.id)
          if (f.type === "multiselect") {
            const all = (o: string) => targets.every((r) => Array.isArray(r.values[f.id]) && (r.values[f.id] as string[]).includes(o))
            return { label: f.name, icon: FIELD_ICON[f.type], items: [...(f.options ?? []).map((o) => ({ label: o, icon: all(o) ? Check : undefined, onSelect: () => onToggleLabel?.(targets, f, o) })), { separator: true }, { label: t("No labels"), onSelect: set(f, null) }] }
          }
          const items: MenuAction[] =
            f.type === "select"
              ? (f.options ?? []).map((o) => ({ label: o, icon: now === o ? Check : undefined, onSelect: set(f, o) }))
              : people.map((p) => ({ label: p.name || p.email, icon: now === p.id ? Check : undefined, onSelect: set(f, p.id) }))
          items.push({ separator: true }, { label: f.type === "person" ? t("Nobody") : t("Empty"), icon: f.type === "person" ? UserX : undefined, onSelect: set(f, null) })
          return { label: f.name, icon: FIELD_ICON[f.type], items }
        })
    : []
  const cycleNow = targets.every((r) => r.cycle === targets[0]?.cycle) ? targets[0]?.cycle ?? null : undefined
  const id = one && idOf ? idOf(one) : null
  return cleanActions([
    one && { label: t("Open"), icon: ExternalLink, shortcut: "↵", onSelect: () => onOpen(one) },
    one && onPeek && { label: t("Peek"), icon: Eye, shortcut: "Space", onSelect: () => onPeek(one) },
    { separator: true },
    ...fieldMenus,
    canEdit && cycles?.length && onCycle
      ? { label: t("Cycle"), icon: IterationCw, items: [...cycles.map((c) => ({ label: c.label, icon: cycleNow === c.n ? Check : undefined, onSelect: () => onCycle(targets, c.n) })), { separator: true }, { label: t("No cycle"), icon: cycleNow === null ? Check : undefined, onSelect: () => onCycle(targets, null) }] }
      : null,
    canEdit && one && onParent && { label: t("Set parent…"), icon: Network, onSelect: () => onParent(one) },
    { separator: true },
    one && { label: t("Copy link"), icon: Link2, shortcut: "⌘⇧C", onSelect: () => copyText(recordLink(one), t("Link copied.")) },
    id ? { label: t("Copy ID"), icon: Hash, shortcut: "⌘.", onSelect: () => copyText(id, t("ID copied.")) } : null,
    one && { label: t("Copy git branch name"), icon: GitBranch, shortcut: "⌘⇧.", onSelect: () => copyText(branchName(id, one.title), t("Branch name copied.")) },
    !one && { label: t("Copy links"), icon: Copy, onSelect: () => copyText(targets.map(recordLink).join("\n"), t("Links copied.")) },
    { separator: true },
    canEdit && one && onRepeat && { label: t("Repeat…"), icon: Repeat, onSelect: () => onRepeat(one) },
    one && onTemplate && { label: t("Save as template"), icon: FileStack, onSelect: () => onTemplate(one) },
    { separator: true },
    canEdit && {
      label: one ? t("Move to trash") : tp(targets.length, { one: "Move {n} record to trash", other: "Move {n} records to trash" }),
      icon: Trash2,
      destructive: true,
      shortcut: "⌫",
      onSelect: () => onDelete(targets),
    },
  ])
}
