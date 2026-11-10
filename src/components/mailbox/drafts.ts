import * as React from "react"
import { api } from "@/lib/api-client"
import type { Draft } from "./types"

/**
 * Drafts: kept in this browser for instant reads and synced to the server (/api/app/mail/drafts), so they follow
 * the person across devices and AI apps' drafts show up here. The key is the thread id, NEW_DRAFT, or "d-<uuid>".
 * The newest `updatedAt` wins; a local copy the server no longer has was sent or discarded elsewhere.
 */
const PREFIX = "inbox:mail:draft:"
const EVENT = "inbox:mail-drafts"
export const NEW_DRAFT = "new"

interface Stored extends Draft {
  updatedAt?: number
  /** Was on the server once: if it's gone there, it was sent or discarded on another device. */
  synced?: boolean
}

/** What the server adds: who wrote it (an AI app) and the thread's subject, for the Drafts list. */
export interface DraftMeta {
  source: string
  via: string | null
  threadId: string | null
  threadSubject: string | null
}

const meta = new Map<string, DraftMeta>()
const notify = () => window.dispatchEvent(new Event(EVENT))

function readStored(key: string): Stored | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

function writeStored(key: string, draft: Stored | null) {
  try {
    if (draft) localStorage.setItem(PREFIX + key, JSON.stringify(draft))
    else localStorage.removeItem(PREFIX + key)
  } catch {
    // Private mode or blocked storage: the server copy still syncs.
  }
}

export function readDraft(key: string): Draft | null {
  return readStored(key)
}

const payload = (d: Draft) => ({ mode: d.mode, from: d.from, to: d.to, cc: d.cc, subject: d.subject, text: d.text, messageId: d.messageId, noSignature: d.noSignature })

// Typing saves on every key: the server gets the last version once the person pauses.
const timers = new Map<string, ReturnType<typeof setTimeout>>()
function pushLater(key: string) {
  clearTimeout(timers.get(key))
  timers.set(key, setTimeout(() => void push(key), 1200))
}
async function push(key: string) {
  timers.delete(key)
  const d = readStored(key)
  try {
    if (!d) {
      await api("DELETE", `/api/app/mail/drafts/${key}`)
      meta.delete(key)
      return
    }
    await api("PUT", `/api/app/mail/drafts/${key}`, payload(d))
    if (!d.synced && readStored(key)) writeStored(key, { ...readStored(key)!, synced: true })
  } catch {
    // Offline or the thread is gone: the local copy stays and the next sync tries again.
  }
}

/** Saves a draft, or removes it (null). */
export function writeDraft(key: string, draft: Draft | null) {
  const prev = readStored(key)
  writeStored(key, draft ? { ...draft, updatedAt: Date.now(), synced: prev?.synced } : null)
  if (draft || prev) pushLater(key)
  notify()
}

/** Pulls the server's drafts into this browser and pushes local ones it doesn't have yet. */
export async function syncDrafts() {
  const { drafts } = await api<{ drafts: (DraftMeta & { key: string; draft: Draft; updatedAt: number })[] }>("GET", "/api/app/mail/drafts")
  const remote = new Map(drafts.map((d) => [d.key, d]))
  for (const d of drafts) {
    // A change from this tab is on its way; it wins.
    if (timers.has(d.key)) continue
    meta.set(d.key, { source: d.source, via: d.via, threadId: d.threadId, threadSubject: d.threadSubject })
    const local = readStored(d.key)
    if (!local || (local.updatedAt ?? 0) < d.updatedAt) writeStored(d.key, { ...d.draft, updatedAt: d.updatedAt, synced: true })
  }
  for (const key of draftKeys()) {
    if (remote.has(key) || timers.has(key)) continue
    if (readStored(key)?.synced) writeStored(key, null)
    else void push(key)
  }
  notify()
}

export const draftMeta = (key: string) => meta.get(key)

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
