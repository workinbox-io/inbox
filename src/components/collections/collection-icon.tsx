/** A collection's icon in its colour (rail, header, dialog), and the picker for both. Keys: lib/collections/appearance.ts. */
import {
  BookOpen, Box, Briefcase, Bug, CalendarDays, CircleCheck, Database, Flag, Folder, Handshake, Heart, Laptop, Lightbulb,
  List, Megaphone, Package, Rocket, Star, Target, Truck, Users, Wrench, type LucideIcon,
} from "lucide-react"
import { WORKSPACE_COLORS } from "@/components/workspace/ui"
import { COLLECTION_ICONS, type CollectionIconKey } from "@/lib/collections/appearance"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"

const ICON: Record<CollectionIconKey, LucideIcon> = {
  list: List, check: CircleCheck, bug: Bug, rocket: Rocket, target: Target, flag: Flag, star: Star, heart: Heart, users: Users,
  briefcase: Briefcase, handshake: Handshake, box: Box, package: Package, truck: Truck, wrench: Wrench, laptop: Laptop,
  book: BookOpen, calendar: CalendarDays, lightbulb: Lightbulb, megaphone: Megaphone, folder: Folder, database: Database,
}

/** The icon in the colour, or the plain dot when no icon is set. */
export function CollectionIcon({ icon, color, className }: { icon: string; color: string; className?: string }) {
  const Icon = ICON[icon as CollectionIconKey]
  if (!Icon) return <span className={cn("size-2.5 shrink-0 rounded-full", className)} style={{ background: color }} />
  return <Icon className={cn("size-3.5 shrink-0", className)} style={{ color }} />
}

const swatch = "grid size-7 place-items-center rounded-md border border-transparent outline-none hover:bg-foreground/[0.05] focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-checked:border-foreground/30 aria-checked:bg-foreground/[0.06]"

/** Colour swatches and the icon grid; `color` falls back to `fallback` (the list's colour) for the preview. */
export function AppearancePicker({ icon, color, fallback, onChange }: { icon: string; color: string; fallback: string; onChange: (next: { icon?: string; color?: string }) => void }) {
  const shown = color || fallback
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("Colour")}>
        {WORKSPACE_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={shown === c} aria-label={c} onClick={() => onChange({ color: c })} className={swatch}>
            <span className="size-4 rounded-full" style={{ background: c }} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("Icon")}>
        <button type="button" role="radio" aria-checked={!icon} aria-label={t("No icon")} title={t("No icon")} onClick={() => onChange({ icon: "" })} className={swatch}>
          <span className="size-2.5 rounded-full" style={{ background: shown }} />
        </button>
        {COLLECTION_ICONS.map((key) => {
          const Icon = ICON[key]
          return (
            <button key={key} type="button" role="radio" aria-checked={icon === key} aria-label={key} title={key} onClick={() => onChange({ icon: key })} className={swatch}>
              <Icon className="size-4" style={{ color: shown }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
