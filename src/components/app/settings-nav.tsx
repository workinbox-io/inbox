import * as React from "react"

import { cn } from "@/lib/utils"

export const SETTINGS_PAGES = [
  { href: "/app/settings/account", label: "Account" },
  { href: "/app/settings/organization", label: "Organization" },
  { href: "/app/settings/mail", label: "Mail" },
  { href: "/app/settings/ai-apps", label: "AI apps" },
] as const

const FADE = "1.5rem"

/** Sub-navigation between the settings pages; pill-style tabs. */
export function SettingsNav({ pathname }: { pathname: string }) {
  const ref = React.useRef<HTMLElement>(null)
  const [edges, setEdges] = React.useState({ start: false, end: false })

  const measure = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    setEdges({ start: el.scrollLeft > 4, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }, [])

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    // Bring the open page's pill into view, without moving the page itself.
    const active = el.querySelector<HTMLElement>('[aria-current="page"]')
    if (active) el.scrollLeft = Math.max(0, active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2)
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])

  const mask = `linear-gradient(to right, ${edges.start ? "transparent, #000 " + FADE : "#000, #000"}, ${edges.end ? `#000 calc(100% - ${FADE}), transparent` : "#000, #000"})`

  return (
    <nav
      ref={ref}
      onScroll={measure}
      aria-label="Settings"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="bg-surface inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1"
    >
      {SETTINGS_PAGES.map((p) => {
        const active = pathname.startsWith(p.href)
        return (
          <a
            key={p.href}
            href={p.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-background text-foreground" : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
            )}
          >
            {p.label}
          </a>
        )
      })}
    </nav>
  )
}
