import * as React from "react"
import type { Draft } from "./types"

/** Drafts live in this browser only (per viewer convenience); the key is the thread id or NEW_DRAFT. */
const PREFIX = "luxivo:admin-mail:draft:"
const EVENT = "luxivo:admin-mail-drafts"
export const NEW_DRAFT = "new"

export function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

/** Saves a draft, or removes it (null). */
export function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(PREFIX + key, JSON.stringify(draft))
    else localStorage.removeItem(PREFIX + key)
    window.dispatchEvent(new Event(EVENT))
  } catch {
    // Private mode or blocked storage: drafts just aren't kept.
  }
}

function draftKeys() {
  const keys = new Set<string>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.add(k.slice(PREFIX.length))
    }
  } catch {
    // Storage blocked: no drafts.
  }
  return keys
}

/** Thread ids with a draft, for the "Draft" label in the list; follows changes in this tab. */
export function useDraftKeys() {
  const [keys, setKeys] = React.useState<Set<string>>(() => new Set())
  React.useEffect(() => {
    const sync = () => setKeys(draftKeys())
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return keys
}

/** Remote images the viewer chose to always show, by sender. */
const IMAGES_KEY = "luxivo:admin-mail:images"

export function trustedSenders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(IMAGES_KEY) ?? "[]") as string[]
  } catch {
    return []
  }
}

export function trustSender(email: string) {
  try {
    localStorage.setItem(IMAGES_KEY, JSON.stringify([...new Set([...trustedSenders(), email.toLowerCase()])]))
  } catch {
    // Not kept; this mail still shows them.
  }
}
