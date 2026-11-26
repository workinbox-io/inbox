import Avatar from "boring-avatars"
import * as React from "react"

import { cn } from "@/lib/utils"
import { senderIcon } from "@/lib/sender-logo"

/** Palettes picked per address, so a team doesn't look like one face; the first is the chart palette (styles/brand.css). */
const PALETTES = [
  ["#1a1a1a", "#2bb3a3", "#8b7cf6", "#e6a23c", "#e66aa8"],
  ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"],
  ["#3d348b", "#7678ed", "#f7b801", "#f18701", "#f35b04"],
  ["#0b3954", "#087e8b", "#bfd7ea", "#ff5a5f", "#c81d25"],
  ["#2d3047", "#419d78", "#e0a458", "#ffdbb5", "#c04abc"],
  ["#1d3557", "#457b9d", "#a8dadc", "#f1faee", "#e63946"],
  ["#22223b", "#4a4e69", "#9a8c98", "#c9ada7", "#f2e9e4"],
  ["#003049", "#d62828", "#f77f00", "#fcbf49", "#eae2b7"],
]

function palette(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return PALETTES[(h >>> 0) % PALETTES.length]!
}

/** A known service logo or the company's favicon, otherwise a generated avatar stable across name changes. */
/** `favicon={false}`: no company icon (pages without a session, like the marketing site, can't load one). */
export function UserAvatar({ seed, size = 32, className, favicon = true }: { seed: string; size?: number; className?: string; favicon?: boolean }) {
  const icon = favicon ? senderIcon(seed) : undefined
  const local = icon?.startsWith("/logos/")
  // Favicons are drawn as squares: shown as a rounded square once loaded, the circle stays for faces.
  const [shown, setShown] = React.useState<string | null>(null)
  const square = !!icon && shown === icon
  return (
    <span className={cn("relative inline-flex shrink-0 overflow-hidden", square ? "rounded-[22%]" : "rounded-full", className)} aria-hidden>
      <Avatar name={seed} variant="beam" size={size} colors={palette(seed.trim().toLowerCase())} />
      {icon ? <img key={icon} src={icon} alt="" width={size} height={size} className={cn("absolute inset-0 size-full bg-white object-contain", local && "p-[18%]", !square && "opacity-0")} loading="lazy"
          // Shown once loaded (also when it loaded before hydration), so a missing favicon never flashes white.
          ref={(el) => { if (el?.complete && el.naturalWidth) setShown(icon) }}
          onLoad={() => setShown(icon)}
          onError={(event) => { event.currentTarget.hidden = true }} /> : null}
    </span>
  )
}
