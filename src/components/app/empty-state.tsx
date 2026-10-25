import * as React from "react"

import { cn } from "@/lib/utils"

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
}

/** Centered placeholder for a list or panel with nothing in it yet. */
export function EmptyState({ icon, title, description, action, variant = "framed", className, ...props }: EmptyStateProps) {
  const content = (
    <>
      <span className="bg-background text-muted-foreground flex size-11 items-center justify-center rounded-full [&>svg]:size-5">
        {icon}
      </span>
      <div className="grid gap-1">
        <p className="text-lg font-medium tracking-tight">{title}</p>
        {description ? <p className="text-muted-foreground max-w-sm text-sm tracking-tight">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </>
  )
  const layout = "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"

  if (variant === "plain") {
    return (
      <div className={cn(layout, className)} {...props}>
        {content}
      </div>
    )
  }
  return (
    <div className={cn("bg-surface rounded-2xl", layout, className)} {...props}>
      {content}
    </div>
  )
}
