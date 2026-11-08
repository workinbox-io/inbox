import * as React from "react"

import type { UserMailFolder as MailFolder } from "@/lib/mail/rules"
import { cn } from "@/lib/utils"

/**
 * Colours mailboxes wear, like calendars in a calendar app: the dot in the rail and the bar on each
 * thread in "All mailboxes". Picked from the address, so a mailbox keeps its colour everywhere.
 */
const MAILBOX_COLORS = ["#5b5bd6", "#0e9f6e", "#e5484d", "#d97706", "#0091ff", "#a144af", "#12a594", "#e93d82"]

/** A calendar-event tint of a mailbox colour, for selected rows and chips. */
export const tint = (color: string, pct = 12) => `color-mix(in oklab, ${color} ${pct}%, transparent)`

export function mailboxColor(address: string) {
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

