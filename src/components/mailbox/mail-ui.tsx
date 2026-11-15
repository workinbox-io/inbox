import * as React from "react"

import type { MailView as MailFolder } from "./types"
import { WORKSPACE_COLORS } from "@/components/workspace/ui"

/**
 * Colours mailboxes wear, like calendars in a calendar app: the dot in the rail and the bar on each
 * thread in "All mailboxes". Picked from the address, so a mailbox keeps its colour everywhere.
 */
const MAILBOX_COLORS = WORKSPACE_COLORS

// Shared with the other workspace apps (components/workspace).
export { Kbd, tint } from "@/components/workspace/ui"

const assigned = new Map<string, string>()

/**
 * Gives the viewer's mailboxes distinct colours (in their order, like calendars), so two of them never share one
 * the way two hashes can. Called once by MailboxApp; addresses outside the list fall back to the hash.
 */
export function assignMailboxColors(addresses: string[]) {
  assigned.clear()
  addresses.forEach((a, i) => assigned.set(a, MAILBOX_COLORS[i % MAILBOX_COLORS.length]!))
}

export function mailboxColor(address: string) {
  const known = assigned.get(address)
  if (known) return known
  let h = 0
  for (const c of address) h = (h * 31 + c.charCodeAt(0)) | 0
  return MAILBOX_COLORS[Math.abs(h) % MAILBOX_COLORS.length]!
}

/** Two-key folder shortcuts, Gmail style: g then the letter. */
export const FOLDER_KEYS: Partial<Record<MailFolder, string>> = { inbox: "i", starred: "s", snoozed: "b", drafts: "d", sent: "t", outbox: "o", archived: "e", spam: "!", trash: "#" }


