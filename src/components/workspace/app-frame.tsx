/**
 * The workspace screen fills the user view or sits flush inside the dashboard's rounded content area.
 */
import * as React from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function AppFrame({ userView, className, children, ref }: { userView: boolean; className?: string; children: React.ReactNode; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={ref}
        className={cn(
          userView ? "bg-background flex h-full min-h-0 overflow-hidden" : "bg-background -mx-2 -mb-2 flex h-full min-h-0 overflow-hidden rounded-b-xl border-t",
          className,
        )}
      >
        {children}
      </div>
    </TooltipProvider>
  )
}
