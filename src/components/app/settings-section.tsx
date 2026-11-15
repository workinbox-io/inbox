import * as React from "react"

import { cn } from "@/lib/utils"

interface SettingsSectionProps extends Omit<React.ComponentProps<"section">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  destructive?: boolean
}

export const SettingsSectionContext = React.createContext<string | null>(null)

/** Stacked groups fit the settings dialog without squeezing controls into a second column. */
export function SettingsSection({ title, description, destructive, className, children, ...props }: SettingsSectionProps) {
  const sectionTitle = React.useContext(SettingsSectionContext)
  // A string title doubles as the anchor, e.g. /app/settings#api-keys.
  const id = props.id ?? (typeof title === "string" ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : undefined)
  return (
    <section
      id={id}
      data-slot="settings-section"
      className={cn("grid min-w-0 scroll-mt-20 grid-cols-[minmax(0,1fr)] gap-4", className)}
      {...props}
    >
      <div className="grid content-start gap-1">
        {title !== sectionTitle && <h3 className={cn("font-medium tracking-tight", destructive && "text-destructive")}>{title}</h3>}
        {description ? <p className="text-muted-foreground text-sm tracking-tight">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
