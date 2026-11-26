import * as React from "react"
import { cn } from "cn"

/**
 * `default` is the flat surface card. `inset` is a tile inside a card (a stat, a suggestion, a list
 * row): the page background, a smaller radius and its own padding. `elevated` floats above the page.
 */
const CARD_VARIANT = {
  default: "gap-6 rounded-2xl bg-surface py-7 text-surface-foreground",
  inset: "gap-0 rounded-xl bg-background p-3 text-foreground",
  elevated: "gap-6 rounded-2xl bg-popover py-7 text-popover-foreground shadow-lg",
} as const

function Card({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: keyof typeof CARD_VARIANT }) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn("flex flex-col", CARD_VARIANT[variant], className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-7 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-7",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-lg leading-tight font-medium tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm tracking-tight text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-7", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-7 [.border-t]:pt-7", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
