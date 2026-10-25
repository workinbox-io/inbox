import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Cycles system → light → dark; the logic lives in BaseLayout's inline script. */
export function ThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => window.setThemeMode(window.nextThemeMode())}
      aria-label="Theme: system, light or dark"
      title="Theme: system, light or dark"
    >
      <Monitor className="hidden in-data-[theme-mode=system]:block" />
      <Sun className="hidden in-data-[theme-mode=light]:block" />
      <Moon className="hidden in-data-[theme-mode=dark]:block" />
    </Button>
  )
}
