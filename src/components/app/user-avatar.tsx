import Avatar from "boring-avatars"

import { cn } from "@/lib/utils"

/** Brand primary, the chart teal and cyan, amber, and a pale blue (see global.css). */
const COLORS = ["#2f5bff", "#0d9488", "#164e63", "#fbbf24", "#dbe4ff"]

/** A generated avatar; `seed` (the email) keeps it the same everywhere and across name changes. */
export function UserAvatar({ seed, size = 32, className }: { seed: string; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 overflow-hidden rounded-full", className)} aria-hidden>
      <Avatar name={seed} variant="beam" size={size} colors={COLORS} />
    </span>
  )
}
