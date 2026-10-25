import * as React from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      aria-label="Copy"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="text-emerald-500" /> : <Copy />}
    </Button>
  )
}

/** Label + monospace value with a copy button. */
export function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="bg-muted flex min-w-0 items-center justify-between gap-2 rounded-xl py-1 pr-1 pl-3">
        <code className={cn("min-w-0 truncate text-sm", secret && "font-semibold")}>{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  )
}
