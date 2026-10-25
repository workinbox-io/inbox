import { cn } from "@/lib/utils"

/** A short link to the docs next to a setting or description, so the panel doesn't have to explain it inline. */
export function DocsLink({ href, children = "Learn more", className }: { href: string; children?: React.ReactNode; className?: string }) {
  return (
    <a href={href} className={cn("hover:text-foreground underline underline-offset-2", className)}>
      {children}
    </a>
  )
}
