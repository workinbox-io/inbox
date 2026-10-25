import * as React from "react"

import { cn } from "@/lib/utils"

interface SettingsSectionProps extends Omit<React.ComponentProps<"section">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  destructive?: boolean
}

/** A settings group: title and explanation on the left, controls on the right. */
export function SettingsSection({ title, description, destructive, className, children, ...props }: SettingsSectionProps) {
  // A string title doubles as the anchor, e.g. /app/settings#api-keys.
  const id = props.id ?? (typeof title === "string" ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : undefined)
  return (
    <section
      id={id}
      className={cn("grid scroll-mt-20 gap-4 md:grid-cols-[18rem_1fr] md:gap-10", className)}
      {...props}
    >
      <div className="grid content-start gap-1">
        <h2 className={cn("text-lg font-normal tracking-tight", destructive && "text-destructive")}>{title}</h2>
        {description ? <p className="text-muted-foreground text-sm tracking-tight">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
