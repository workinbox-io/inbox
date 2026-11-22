import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n/panel"

/** Cycles system → light → dark; the logic lives in BaseLayout's inline script. */
export function ThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => window.setThemeMode(window.nextThemeMode())}
      aria-label={t("Theme: system, light or dark")}
      title={t("Theme: system, light or dark")}
    >
      <Monitor className="hidden in-data-[theme-mode=system]:block" />
      <Sun className="hidden in-data-[theme-mode=light]:block" />
      <Moon className="hidden in-data-[theme-mode=dark]:block" />
    </Button>
  )
}
