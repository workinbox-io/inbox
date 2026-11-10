/**
 * The frame of a workspace app. In the user view (`account` set, MailLayout) it fills the screen and brings its own
 * toasts; inside the dashboard it sits flush in AppLayout's rounded content area.
 */
import * as React from "react"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function AppFrame({ userView, className, children }: { userView: boolean; className?: string; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          userView ? "bg-background flex h-full min-h-0 overflow-hidden" : "bg-background -mx-2 -mb-2 flex h-full min-h-0 overflow-hidden rounded-b-xl border-t",
          className,
        )}
      >
        {children}
      </div>
      {userView ? <Toaster /> : null}
    </TooltipProvider>
  )
}
