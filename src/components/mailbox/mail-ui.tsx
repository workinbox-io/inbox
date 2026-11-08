import * as React from "react"

import type { UserMailFolder as MailFolder } from "@/lib/mail/rules"
import { cn } from "@/lib/utils"

/**
 * Colours mailboxes wear, like calendars in a calendar app: the dot in the rail and the bar on each
 * thread in "All mailboxes". Picked from the address, so a mailbox keeps its colour everywhere.
 */
const MAILBOX_COLORS = ["#2bb3a3", "#8b7cf6", "#f0793a", "#4caf6e", "#e66aa8", "#e6a23c", "#4f8ff7", "#ef5a5a"]

/** A calendar-event tint of a mailbox colour, for selected rows and chips. */
export const tint = (color: string, pct = 12) => `color-mix(in oklab, ${color} ${pct}%, transparent)`

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
export const FOLDER_KEYS: Partial<Record<MailFolder, string>> = { inbox: "i", starred: "s", snoozed: "b", sent: "t", archived: "e", spam: "!", trash: "#" }

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "border-border/80 text-muted-foreground bg-background inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] border px-1 font-mono text-[10px] leading-none font-medium shadow-[0_1px_0_var(--border)]",
        className,
      )}
    >
      {children}
    </kbd>
  )
}

