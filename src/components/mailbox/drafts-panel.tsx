import * as React from "react"

import { draftMeta, readDraft, useDraftKeys } from "./drafts"
import type { Draft, MailThread } from "./types"

/** Drafts as list rows (the same list as threads), keyed by the draft key. Empty ones (a reply opened and left) are skipped. */
export interface DraftRow extends MailThread {
  /** A reply's thread: opening the row opens the thread with its draft. */
  threadId: string | null
}

const isThread = (key: string) => key !== "new" && !key.startsWith("d-")

export function draftRows(keys: Set<string>, boxes: string[], q: string): DraftRow[] {
  const needle = q.trim().toLowerCase()
  const out: DraftRow[] = []
  for (const key of keys) {
    const draft = readDraft(key) as (Draft & { updatedAt?: number }) | null
    if (!draft || (!draft.text.trim() && !draft.subject.trim() && !draft.to.length)) continue
    if (!boxes.includes(draft.from)) continue
    const meta = draftMeta(key)
    const subject = isThread(key) ? `Re: ${meta?.threadSubject ?? draft.subject}` : draft.subject.trim()
    if (needle && ![subject, ...draft.to, ...draft.cc, draft.text].join(" ").toLowerCase().includes(needle)) continue
    out.push({
      id: key,
      threadId: isThread(key) ? key : null,
      mailbox: draft.from,
      subject,
      labels: meta?.source === "ai" ? [{ id: "ai", name: meta.via ? `From ${meta.via}` : "From an AI app" }] : [],
      contactEmail: draft.to[0] || "No recipient",
      contactName: draft.to.length > 1 ? `${draft.to[0]} +${draft.to.length - 1}` : null,
      unread: false,
      starred: false,
      spam: false,
      archivedAt: null,
      trashedAt: null,
      snoozedUntil: null,
      lastMessageAt: new Date(draft.updatedAt ?? Date.now()).toISOString(),
      snippet: draft.text.trim().replace(/\s+/g, " ").slice(0, 160),
    })
  }
  return out.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

/** Count for "Drafts" in the folders. */
export function useDraftCount(boxes: string[]) {
  const keys = useDraftKeys()
  return React.useMemo(() => draftRows(keys, boxes, "").length, [keys, boxes])
}
