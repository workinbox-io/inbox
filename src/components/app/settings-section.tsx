import * as React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SettingsSectionProps extends Omit<React.ComponentProps<"section">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  destructive?: boolean
}

/**
 * The title of the page section the cards sit in, when there is one: a card with the same title drops it (the section
 * already says it) and the cards' headings go one level down.
 */
export const SettingsSectionContext = React.createContext<string | null>(null)

/** The bands of a settings card: hairlines between them, and a tighter inset than Card's own. */
export const SETTINGS_CARD = "gap-0 overflow-hidden py-0 [&>*+*]:border-t [&>*+*]:border-border/60"
export const SETTINGS_INSET = "p-4 sm:p-5"

/** A settings group as a card (Tapll's settings): a header band with title and explanation, a hairline, the controls. */
export function SettingsSection({ title, description, destructive, className, children, ...props }: SettingsSectionProps) {
  const sectionTitle = React.useContext(SettingsSectionContext)
  // A string title doubles as the anchor, e.g. /app/settings#api-keys.
  const id = props.id ?? (typeof title === "string" ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : undefined)
  const showTitle = title !== sectionTitle
  return (
    <section id={id} data-slot="settings-section" className={cn("min-w-0 scroll-mt-20", className)} {...props}>
      <Card className={cn(SETTINGS_CARD, destructive && "ring-destructive/30 ring-1")}>
        {showTitle || description ? (
          <CardHeader className={SETTINGS_INSET}>
            {showTitle && <CardTitle role="heading" aria-level={sectionTitle === null ? 2 : 3} className={cn("text-base", destructive && "text-destructive")}>{title}</CardTitle>}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
        ) : null}
        <CardContent className={cn("min-w-0", SETTINGS_INSET)}>{children}</CardContent>
      </Card>
    </section>
  )
}
