import { navigatePanel, PANEL_NAVIGATION } from "@/lib/panel-history"
import * as React from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommandPalette, openAppSearch, useCommandPaletteShortcut, type CommandPaletteGroup } from "@/components/ui/command-palette"
import { APP_ACTIONS, APP_HELP, WORKSPACE_NAV } from "@/config/nav"
import { t } from "@/lib/i18n/panel"
import { useOpenCommandPalette, usePaletteGroups } from "./app-commands"

/**
 * The user view's ⌘K: the rail/header button and the palette with the apps and "new" actions. On phones it is also
 * the app switcher, since AppRail is hidden there.
 */
export function AppSearch({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener(PANEL_NAVIGATION, close)
    return () => window.removeEventListener(PANEL_NAVIGATION, close)
  }, [])
  useCommandPaletteShortcut(setOpen)
  useOpenCommandPalette(React.useCallback(() => setOpen(true), []))
  const go = (href: string) => () => {
    setOpen(false)
    navigatePanel(href)
  }
  const shared: CommandPaletteGroup[] = [
    {
      heading: t("Navigate"),
      items: [...WORKSPACE_NAV, ...APP_HELP].map((n) => ({
        id: n.href,
        label: t(n.label),
        icon: <n.icon />,
        onSelect: go(n.href),
      })),
    },
    {
      heading: t("Actions"),
      items: APP_ACTIONS.map((a) => ({ id: a.href, label: t(a.label), icon: <a.icon />, onSelect: go(a.href) })),
    },
  ]
  const palette = usePaletteGroups(shared, open)
  return (
    <>
      <Button
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "sm"}
        className={compact ? undefined : "text-muted-foreground w-9 justify-start gap-2 px-0 max-sm:justify-center sm:w-64 sm:px-3"}
        aria-label={t("Search pages")}
        title={compact ? `${t("Search…")} (⌘K)` : undefined}
        onClick={() => openAppSearch(() => setOpen(true))}
      >
        <Search />
        {!compact && (
          <>
            <span className="max-sm:sr-only">{t("Search…")}</span>
            <kbd className="bg-muted ml-auto rounded px-1.5 font-mono text-[10px] max-sm:hidden">⌘K</kbd>
          </>
        )}
      </Button>
      <CommandPalette groups={palette.groups} onQueryChange={palette.onQueryChange} onSelect={() => setOpen(false)} open={open} onOpenChange={setOpen} placeholder={palette.placeholder ?? t("Search pages and actions…")} />
    </>
  )
}
