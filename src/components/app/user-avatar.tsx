import Avatar from "boring-avatars"

import { cn } from "@/lib/utils"

/** The calendar palette (charts in styles/brand.css): orange, blue, violet, green, yellow. */
const COLORS = ["#ff7d44", "#51a9e0", "#9b60f7", "#3fbf72", "#f2b53a"]

/** A generated avatar; `seed` (the email) keeps it the same everywhere and across name changes. */
export function UserAvatar({ seed, size = 32, className }: { seed: string; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 overflow-hidden rounded-full", className)} aria-hidden>
      <Avatar name={seed} variant="beam" size={size} colors={COLORS} />
    </span>
  )
}
