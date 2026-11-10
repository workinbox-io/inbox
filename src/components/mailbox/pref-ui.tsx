import * as React from "react"
import { cn } from "@/lib/utils"

/** Building blocks of the mail settings dialog, so every section reads the same way. */

/** A bordered list of rows (labels, filters, forwarding addresses, device settings). */
export function PrefList({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("divide-border/70 bg-background divide-y rounded-xl border", className)} {...props} />
}

/** One row: optional icon, a title with a description under it, controls on the right. */
export function PrefRow({
  icon: Icon,
  title,
  description,
  children,
  className,
  onClick,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      className={cn("flex min-h-12 items-center gap-3 px-3.5 py-2.5", onClick && "hover:bg-muted/50 cursor-pointer", className)}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onClick()) : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {Icon ? <Icon className="text-muted-foreground size-4 shrink-0" /> : null}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="truncate text-sm">{title}</div>
        {description ? <div className="text-muted-foreground truncate text-xs">{description}</div> : null}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** A small heading above a group of fields or a list. */
export function PrefHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <h3 className="text-muted-foreground text-xs font-medium">{children}</h3>
      {action}
    </div>
  )
}
