import Avatar from "boring-avatars"

import { cn } from "@/lib/utils"

/** The chart palette (styles/brand.css): ink, teal, violet, amber, pink. */
const COLORS = ["#1a1a1a", "#2bb3a3", "#8b7cf6", "#e6a23c", "#e66aa8"]

/** A generated avatar; `seed` (the email) keeps it the same everywhere and across name changes. */
export function UserAvatar({ seed, size = 32, className }: { seed: string; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 overflow-hidden rounded-full", className)} aria-hidden>
      <Avatar name={seed} variant="beam" size={size} colors={COLORS} />
    </span>
  )
}
