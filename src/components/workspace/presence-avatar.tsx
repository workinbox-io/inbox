/**
 * A person's avatar with their status in a notch, like the support-chat widget's launcher: the avatar is masked with a
 * round hole at the bottom right and the dot sits in it, so the gap is see-through on any background (hover, selected
 * rows, dark mode) instead of a ring in the page's colour. Vector circles as the mask: gradients rasterize jagged in
 * Safari at these sizes.
 */
import { UserAvatar } from "@/components/app/user-avatar"
import { msg, t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"

export type Presence = "active" | "away" | "offline"

const CIRCLE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 2'%3E%3Ccircle cx='1' cy='1' r='1'/%3E%3C/svg%3E")`

const LABEL: Record<Presence, string> = { active: msg("Active"), away: msg("Away"), offline: msg("Offline") }

export function PresenceAvatar({ seed, size = 20, status, className }: { seed: string; size?: number; status?: Presence; className?: string }) {
  // The dot is ~30% of the avatar (at least 6px), the notch adds a gap on every side.
  const dot = Math.max(6, Math.round(size * 0.3))
  const gap = Math.max(1.5, size * 0.07)
  const notch = dot + gap * 2
  // The dot's centre sits on the avatar's edge at the bottom right (45°), so it reads as part of the circle.
  const centre = size / 2 + (size / 2) * Math.SQRT1_2
  const at = `${centre - notch / 2}px ${centre - notch / 2}px`
  const masked = status
    ? {
        WebkitMaskImage: `${CIRCLE}, ${CIRCLE}`,
        maskImage: `${CIRCLE}, ${CIRCLE}`,
        WebkitMaskSize: `100% 100%, ${notch}px ${notch}px`,
        maskSize: `100% 100%, ${notch}px ${notch}px`,
        WebkitMaskPosition: `0 0, ${at}`,
        maskPosition: `0 0, ${at}`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskComposite: "source-out",
        maskComposite: "subtract",
      }
    : undefined
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <span className="inline-flex" style={masked}>
        <UserAvatar seed={seed} size={size} />
      </span>
      {status ? (
        <span
          role="img"
          aria-label={t(LABEL[status])}
          title={t(LABEL[status])}
          className={cn(
            "absolute rounded-full transition-[background-color,box-shadow,transform] duration-300",
            status === "active" && "bg-emerald-500",
            status === "away" && "bg-amber-400",
            // Offline is a hollow ring, like Slack, so it doesn't compete with the coloured ones.
            status === "offline" && "shadow-[inset_0_0_0_1.5px] shadow-muted-foreground/60",
          )}
          style={{ width: dot, height: dot, left: centre - dot / 2, top: centre - dot / 2 }}
        />
      ) : null}
    </span>
  )
}
