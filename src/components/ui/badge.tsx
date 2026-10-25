import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-2.5 py-0.5 text-xs font-medium tracking-tight whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        // Flat pills like the marketing site: a soft fill that reads on the page and on surface cards.
        secondary: "bg-foreground/[0.06] text-foreground/80 [a&]:hover:bg-foreground/10",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline: "bg-foreground/[0.04] text-muted-foreground [a&]:hover:bg-foreground/[0.08] [a&]:hover:text-foreground",
        success: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300",
        warning: "bg-amber-500/14 text-amber-800 dark:bg-amber-400/12 dark:text-amber-300",
        danger: "bg-red-500/12 text-red-700 dark:bg-red-400/12 dark:text-red-300",
        info: "bg-primary/10 text-primary dark:bg-primary/15 dark:text-blue-300",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
