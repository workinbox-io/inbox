import * as React from "react"

import { cn } from "@/lib/utils"
import { IconStack } from "@/components/ui/icon-stack"

interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  icon: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  /**
   * `framed` sits on its own flat surface, for empty states that stand on the page.
   * `plain` has no frame, for empty states inside a card or panel that already has one.
   */
  variant?: "framed" | "plain"
  /**
   * How much room it has. `default`: a page or a full pane. `compact`: inside a card, list or
   * settings section, same shape with tighter padding. `dense`: a small slot; the illustration
   * goes, the icon sits in a plain box and the type steps down, so the state fits its box.
   */
  density?: "default" | "compact" | "dense"
}

/** Centered placeholder for a list or panel with nothing in it yet (Tapll's look: an icon stack). */
export function EmptyState({ icon, title, description, action, variant = "framed", density = "default", className, ...props }: EmptyStateProps) {
  const dense = density === "dense"
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center text-center text-balance",
        density === "default" && "gap-6 p-6 md:p-12",
        density === "compact" && "gap-4 p-4 md:p-8",
        dense && "gap-3 p-2 md:p-4",
        variant === "framed" && "bg-surface rounded-2xl",
        className,
      )}
      {...props}
    >
      <div className={cn("flex flex-col items-center", dense ? "max-w-xs gap-1" : "max-w-sm gap-2")}>
        {dense ? (
          <span className="bg-muted text-muted-foreground mb-1 flex size-8 items-center justify-center rounded-lg [&>svg]:size-[18px]">{icon}</span>
        ) : (
          <IconStack aria-hidden="true" className="mb-2">
            <span className="flex [&>svg]:size-4">{icon}</span>
          </IconStack>
        )}
        <p className={cn("font-medium tracking-tight", dense ? "text-sm" : "text-base")}>{title}</p>
        {description ? <div className={cn("text-muted-foreground [&>a]:hover:text-foreground [&>a]:underline [&>a]:underline-offset-4", dense ? "text-xs/relaxed" : "text-sm/relaxed")}>{description}</div> : null}
      </div>
      {action ? <div className={cn("flex w-full max-w-sm min-w-0 flex-col items-center text-sm", dense ? "gap-2" : "gap-4")}>{action}</div> : null}
    </div>
  )
}
