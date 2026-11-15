/**
 * One ⌘K for every app. The palette lives in AppSearch (user view) and AppShell (dashboard); the open app adds its own
 * group(s) on top with `useAppCommands` (Chat: channels and people, Calendar: actions and a quick event from the typed
 * text). Islands share this module on a page, so a plain store is enough.
 */
import * as React from "react"
import type { CommandPaletteGroup } from "@/components/ui/command-palette"

export interface AppCommandSource {
  /** Groups shown above Navigate/Actions; `query` is what's typed, for items made from it. */
  groups: (query: string) => CommandPaletteGroup[]
  placeholder?: string
}

const OPEN_EVENT = "app:open-search"
let current: AppCommandSource | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Opens the shared palette (rail buttons, "Jump to…", a header button). */
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT))

/** Calls `open` whenever something asks for the palette. */
export function useOpenCommandPalette(open: () => void) {
  React.useEffect(() => {
    window.addEventListener(OPEN_EVENT, open)
    return () => window.removeEventListener(OPEN_EVENT, open)
  }, [open])
}

/** The open app's commands, while it is mounted. Always reads the latest `source`, so no memoizing needed. */
export function useAppCommands(source: AppCommandSource) {
  const ref = React.useRef(source)
  ref.current = source
  React.useEffect(() => {
    const entry: AppCommandSource = {
      groups: (q) => ref.current.groups(q),
      get placeholder() {
        return ref.current.placeholder
      },
    }
    current = entry
    emit()
    return () => {
      if (current === entry) current = null
      emit()
    }
  }, [])
}

/** For the palettes: the app's groups (made from the typed text) before the shared ones. */
export function usePaletteGroups(shared: CommandPaletteGroup[], open: boolean) {
  const source = React.useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => null,
  )
  const [query, setQuery] = React.useState("")
  React.useEffect(() => {
    if (!open) setQuery("")
  }, [open])
  const groups = open && source ? [...source.groups(query).filter((g) => g.items.length), ...shared] : shared
  return { groups, onQueryChange: setQuery, placeholder: source?.placeholder }
}
