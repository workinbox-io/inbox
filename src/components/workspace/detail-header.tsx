/** The bar above an open item (a thread, a note): back on phones, then the item's actions as icon buttons. */
import * as React from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Kbd } from "./ui"

export function DetailHeader({ onBack, backLabel = "Back to the list", children }: { onBack: () => void; backLabel?: string; children: React.ReactNode }) {
  return (
    <header className="flex min-h-12 items-center gap-1 border-b px-2 py-2 md:px-3">
      <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label={backLabel} onClick={onBack}>
        <ArrowLeft />
      </Button>
      {children}
    </header>
  )
}

/** A ghost icon button with a tooltip; "Archive (e)" shows as "Archive" with an E key chip. */
export function IconAction({ label, onClick, children, disabled }: { label: string; onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  const key = /\(([^)]+)\)$/.exec(label)?.[1]
  const text = label.replace(/\s*\(([^)]+)\)$/, "")
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={text} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {text}
        {key ? <Kbd className="border-white/20 bg-white/10 text-current shadow-none">{key.toUpperCase()}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  )
}
