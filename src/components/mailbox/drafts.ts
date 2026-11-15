import * as React from "react"
import { api } from "@/lib/api-client"
import type { Draft } from "./types"

/**
 * Drafts: kept in this browser for instant reads and synced to the server (/api/app/mail/drafts), so they follow
 * the person across devices and AI apps' drafts show up here. The key is the thread id, NEW_DRAFT, or "d-<uuid>".
 * Server versions prevent overwriting concurrent edits; a local copy the server no longer has was sent or discarded elsewhere.
 */
const PREFIX = "inbox:mail:draft:"
const EVENT = "inbox:mail-drafts"
export const NEW_DRAFT = "new"

interface Stored extends Draft {
  updatedAt?: number
  synced?: boolean
  dirty?: boolean
  deleted?: boolean
}
export interface DraftMeta {
  source: string
  via: string | null
  threadId: string | null
  threadSubject: string | null
}
type Remote = DraftMeta & { key: string; draft: Draft; updatedAt: number }
const unavailableStorage = new Map<string, Stored | null>()
const meta = new Map<string, DraftMeta>()
const conflicts = new Map<string, Remote | null>()
const REMOTE = "inbox:mail-draft-remote"
const notify = () => window.dispatchEvent(new Event(EVENT))
const changed = (key: string) => window.dispatchEvent(new CustomEvent(REMOTE, { detail: key }))
function readStored(key: string): Stored | null {
  if (unavailableStorage.has(key)) return unavailableStorage.get(key) ?? null
  try { return JSON.parse(localStorage.getItem(PREFIX + key) ?? "null") as Stored | null } catch { return null }
}
function writeStored(key: string, draft: Stored | null) {
  try {
    if (draft) localStorage.setItem(PREFIX + key, JSON.stringify(draft))
    else localStorage.removeItem(PREFIX + key)
    unavailableStorage.delete(key)
  } catch { unavailableStorage.set(key, draft) }
}
export function readDraft(key: string): Draft | null {
  const draft = readStored(key)
  return draft?.deleted ? null : draft
}
const payload = (d: Draft) => ({ mode: d.mode, from: d.from, to: d.to, cc: d.cc, subject: d.subject, text: d.text, doc: d.doc, messageId: d.messageId, noSignature: d.noSignature, files: d.files ?? [] })
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const writes = new Map<string, Promise<void>>()
function pushLater(key: string) {
  clearTimeout(timers.get(key))
  timers.set(key, setTimeout(() => { timers.delete(key); void push(key).catch(() => {}) }, 1200))
}
function push(key: string): Promise<void> {
  const pending = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const d = readStored(key)
    if (!d?.dirty || conflicts.has(key)) return
    try {
      const expectedUpdatedAt = d.synced ? d.updatedAt : null
      if (d.deleted) {
        if (expectedUpdatedAt !== null) await api("DELETE", `/api/app/mail/drafts/${key}`, { expectedUpdatedAt })
        if (readStored(key)?.deleted) writeStored(key, null)
        meta.delete(key)
      } else {
        const saved = await api<{ updatedAt: number }>("PUT", `/api/app/mail/drafts/${key}`, { ...payload(d), expectedUpdatedAt })
        const latest = readStored(key)
        if (latest) writeStored(key, { ...latest, updatedAt: saved.updatedAt, synced: true, dirty: JSON.stringify(latest) !== JSON.stringify(d) })
      }
    } catch (e) {
      if ((e as Error & { status?: number }).status === 409) {
        const remote = await api<Remote>("GET", `/api/app/mail/drafts/${key}`).catch(error => {
          if ((error as { status?: number }).status === 404) return null
          throw error
        })
        if (d.deleted) {
          writeStored(key, remote ? { ...remote.draft, updatedAt: remote.updatedAt, synced: true } : null)
          conflicts.delete(key)
        } else conflicts.set(key, remote)
        changed(key)
      }
      throw e
    } finally { notify() }
  })
  writes.set(key, pending)
  void pending.finally(() => { if (writes.get(key) === pending) writes.delete(key) }).catch(() => {})
  return pending
}
export function writeDraft(key: string, draft: Draft | null) {
  const prev = readStored(key)
  if (!draft && !prev) return
  if (draft && prev && !prev.deleted && JSON.stringify(payload(draft)) === JSON.stringify(payload(prev))) return
  writeStored(key, { ...(draft ?? prev!), updatedAt: prev?.updatedAt, synced: prev?.synced, dirty: true, deleted: !draft })
  pushLater(key)
  notify()
}
/** Flush edits before sending; a conflict must be explicitly resolved. */
export async function flushDraft(key: string, expected?: Draft) {
  if (expected && JSON.stringify(payload(readStored(key) ?? expected)) !== JSON.stringify(payload(expected))) throw new Error("Draft changed. Review the latest version before sending.")
  clearTimeout(timers.get(key)); timers.delete(key)
  await push(key)
  const saved = readStored(key)
  if (conflicts.has(key) || !saved?.synced || saved.dirty || saved.deleted) throw new Error("Draft changed or was deleted. Resolve the draft conflict before sending.")
  if (expected && JSON.stringify(payload(saved)) !== JSON.stringify(payload(expected))) throw new Error("Draft changed. Review the latest version before sending.")
  return saved.updatedAt!
}
export async function resolveDraftConflict(key: string, mine: boolean) {
  // Read again: the version shown in the conflict may already have changed.
  const remote = await api<Remote>("GET", `/api/app/mail/drafts/${key}`).catch(error => {
    if ((error as { status?: number }).status === 404) return null
    throw error
  })
  const local = readStored(key)
  conflicts.delete(key)
  if (mine && local) {
    writeStored(key, { ...local, synced: !!remote, updatedAt: remote?.updatedAt, dirty: true })
    await push(key)
  } else writeStored(key, remote ? { ...remote.draft, synced: true, updatedAt: remote.updatedAt } : null)
  changed(key); notify()
}
export async function syncDrafts() {
  const before = new Map([...draftKeys()].map(key => [key, JSON.stringify(readStored(key))]))
  const drafts: Remote[] = []
  let cursor: string | null = null
  do {
    const page: { drafts: Remote[]; nextCursor: string | null } = await api("GET", `/api/app/mail/drafts?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
    drafts.push(...page.drafts); cursor = page.nextCursor
  } while (cursor)
  const remote = new Map(drafts.map(d => [d.key, d]))
  for (const key of new Set([...draftKeys(), ...remote.keys()])) {
    if (JSON.stringify(readStored(key)) !== (before.get(key) ?? "null")) continue
    const d = remote.get(key)
    const local = readStored(key)
    if (d) meta.set(key, d)
    if (local?.dirty) {
      if ((local.synced && local.updatedAt !== d?.updatedAt) || (!local.synced && d)) {
        conflicts.set(key, d ?? null); changed(key)
      } else if (!conflicts.has(key)) void push(key).catch(() => {})
      continue
    }
    if (d && (!local || local.updatedAt !== d.updatedAt)) {
      writeStored(key, { ...d.draft, updatedAt: d.updatedAt, synced: true }); changed(key)
    } else if (!d && local?.synced) {
      writeStored(key, null); meta.delete(key); changed(key)
    }
  }
  notify()
}
/** Remote changes never autosave; typed local changes are kept on conflict. */
export function useRemoteDraft(key: string, load: (draft: Draft | null) => void) {
  const [conflict, setConflict] = React.useState(false)
  const latest = React.useRef(load); latest.current = load
  React.useEffect(() => {
    const update = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== key) return
      setConflict(conflicts.has(key))
      if (!conflicts.has(key)) latest.current(readDraft(key))
    }
    setConflict(conflicts.has(key))
    window.addEventListener(REMOTE, update)
    return () => window.removeEventListener(REMOTE, update)
  }, [key])
  return conflict
}

export const draftMeta = (key: string) => meta.get(key)

function draftKeys() {
  const keys = new Set([...unavailableStorage].filter(([, draft]) => draft && !draft.deleted).map(([key]) => key))
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX) && !readStored(k.slice(PREFIX.length))?.deleted) keys.add(k.slice(PREFIX.length))
    }
  } catch {
    // Storage blocked: no drafts.
  }
  return keys
}

/** Draft keys (thread ids with a draft, for the "Draft" label in the list); follows changes in this tab. */
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
const IMAGES_KEY = "inbox:mail:images"

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
