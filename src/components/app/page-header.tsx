import * as React from "react"

import { cn } from "@/lib/utils"

interface PageHeaderProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  /** Small line under the title, e.g. status, region and host. */
  meta?: React.ReactNode
  actions?: React.ReactNode
}

/** Title block at the top of every app page. */
export function PageHeader({ title, description, meta, actions, className, ...props }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)} {...props}>
      <div className="grid min-w-0 gap-2">
        <h1 className="truncate text-3xl leading-tight font-normal tracking-tight sm:text-4xl">{title}</h1>
        {description ? <p className="text-muted-foreground max-w-2xl text-base tracking-tight">{description}</p> : null}
        {meta ? (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm tracking-tight">{meta}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:pt-1">{actions}</div> : null}
    </div>
  )
}

interface SectionHeaderProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}

/** Heading for a section of a page, e.g. a tab, with actions on the right. Sits on the page, not in a card. */
export function SectionHeader({ title, description, actions, className, ...props }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)} {...props}>
      <div className="grid min-w-0 gap-1">
        <h2 className="text-xl font-normal tracking-tight">{title}</h2>
        {description ? <p className="text-muted-foreground max-w-2xl text-sm tracking-tight">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Small uppercase label above a group of cards. */
export function SectionLabel({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("eyebrow", className)}
      {...props}
    />
  )
}
