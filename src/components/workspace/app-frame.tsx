/** An app's screen, filling the space next to the app rail. */
import * as React from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function AppFrame({ className, children, ref }: { className?: string; children: React.ReactNode; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={ref}
        className={cn(
"workspace-frame bg-background flex h-full min-h-0 overflow-hidden", className
        )}
      >
        {children}
      </div>
    </TooltipProvider>
  )
}
