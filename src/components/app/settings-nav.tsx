import { cn } from "@/lib/utils"

export const SETTINGS_PAGES = [
  { href: "/app/settings/account", label: "Account" },
  { href: "/app/settings/organization", label: "Organization" },
  { href: "/app/settings/ai-apps", label: "AI apps" },
] as const

/** Sub-navigation between the settings pages; pill-style tabs. */
export function SettingsNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Settings" className="bg-surface inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1">
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
